import { createHash } from "node:crypto";
import { ImageResponse } from "next/og";
import { db, audit } from "./db";
import { scopeFor, HttpError } from "./auth";
import { canReadConversation } from "./inbox";
import { evidenceFingerprint, paginateEvidence, validateEvidence, type EvidenceMessage } from "./evidence";
import { RenderPage } from "./evidence-render";
import { mediaAccess } from "./media-service";
import type { PoolClient } from "pg";
import type { AuthProfile } from "@alc/identity/auth";

export const evidenceCaseId=/^[a-zA-Z0-9_-]{1,80}$/;
export type EvidenceFolder = {
 case_id:string; conversation_id:string; phone:string; base_key:string; sigla:string;
 source_hash:string; print_count:number; message_count:number; manifest:Record<string,unknown>;
 created_at:string; created_by:string|null;
};
const fingerprint=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");

async function evidenceMessages(conversationId:string,connection:PoolClient|ReturnType<typeof db>=db(),lock=false) {
 const result=await connection.query(
  `SELECT m.id,m.provider_id,m.direction,m.body,m.type,m.status,m.created_at,m.attachment,m.case_id,
   CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id',a.id,'message_id',a.message_id,'case_id',a.case_id,'filename',a.filename,
    'mime',a.mime,'type',a.type,'size',a.size,'sha256',a.sha256,'status',a.status) END AS media
   FROM alc_atendimento.messages m LEFT JOIN alc_atendimento.media a ON a.message_id=m.id
   WHERE m.conversation_id=$1 ORDER BY m.created_at ASC,m.id ASC LIMIT 502 ${lock?"FOR SHARE OF m":""}`,[conversationId]);
 return result.rows as EvidenceMessage[];
}

export async function authorizedFolder(profile:AuthProfile,caseId:string):Promise<EvidenceFolder> {
 if(!evidenceCaseId.test(caseId))throw new HttpError(400,"ID de PNR inválido.");
 const result=await db().query(
   "SELECT e.*,c.assigned_to FROM alc_atendimento.evidence_folders e JOIN alc_atendimento.conversations c ON c.id=e.conversation_id WHERE e.case_id=$1",
   [caseId],
 );
 const folder=result.rows[0] as EvidenceFolder|undefined;
 const current=folder?(await db().query("SELECT case_id,base_key,sigla FROM alc_atendimento.cases WHERE case_id=$1",[caseId])).rows[0]:null;
 if(!folder || !current || !await canReadConversation(profile,folder) || !await canReadConversation(profile,current))
   throw new HttpError(404,"Pasta de comprovantes não encontrada.");
 return folder;
}

export async function evidencePrint(profile:AuthProfile,caseId:string,part:number) {
 await authorizedFolder(profile,caseId);
 const row=(await db().query(
  "SELECT filename,sha256,image_png FROM alc_atendimento.evidence_images WHERE case_id=$1 AND page_number=$2",[caseId,part],
 )).rows[0];
 if(!row)throw new HttpError(404,"Print não encontrado.");
 const bytes=row.image_png as Buffer;
 if(fingerprint(bytes)!==row.sha256)throw new HttpError(409,"Integridade do print não confirmada.");
 await authorizedFolder(profile,caseId);
 await audit(profile.id,"evidence_print_access",caseId,{part,sha256:row.sha256});
 return {bytes,filename:row.filename as string,sha256:row.sha256 as string};
}

export async function createEvidenceFolder(profile:AuthProfile,conversationId:string) {
 const result=await db().query(
   "SELECT id,phone,channel,status,case_id,base_key,sigla,assigned_to FROM alc_atendimento.conversations WHERE id=$1",
   [conversationId],
 );
 const conversation=result.rows[0];
 if(!conversation || !await canReadConversation(profile,conversation))
   throw new HttpError(404,"Conversa não encontrada.");
 if(conversation.channel!=="client")
   throw new HttpError(422,"Somente tratativas de clientes podem gerar comprovantes.");
 if(!conversation.case_id || !evidenceCaseId.test(String(conversation.case_id)))
   throw new HttpError(422,"ID da PNR ausente ou inválido.");
 const caseId=String(conversation.case_id);
 const pnr=(await db().query("SELECT case_id,base_key,sigla FROM alc_atendimento.cases WHERE case_id=$1",[caseId])).rows[0];
 if(!pnr || !await canReadConversation(profile,pnr))throw new HttpError(404,"PNR não encontrada.");
 const linked=await db().query(
   "SELECT DISTINCT case_id FROM alc_atendimento.outbox WHERE conversation_id=$1 AND case_id IS NOT NULL LIMIT 2",
   [conversationId],
 );
 if(linked.rows.length>1 || (linked.rows.length===1 && linked.rows[0].case_id!==caseId))
   throw new HttpError(422,"Histórico relacionado a mais de uma PNR. Separe as tratativas antes de gerar.");
 const messages=await evidenceMessages(conversationId);
 if(messages.some(m=>m.case_id && m.case_id!==caseId))
   throw new HttpError(422,"Histórico relacionado a mais de uma PNR. Separe as tratativas antes de gerar.");
 const reason=validateEvidence(conversation,messages,messages.length>500);
 if(reason)throw new HttpError(422,reason);
 const sourceHash=evidenceFingerprint(conversation.phone,caseId,messages);
 const existing=await db().query(
   "SELECT source_hash FROM alc_atendimento.evidence_folders WHERE case_id=$1",
   [caseId],
 );
 if(existing.rowCount){
   if(existing.rows[0].source_hash!==sourceHash)
     throw new HttpError(409,"Já existe uma pasta para esta PNR com histórico diferente. Preservamos a evidência original para evitar substituição silenciosa.");
   await authorizedFolder(profile,caseId);
   return {caseId,created:false};
 }
 const originals=new Map<string,Buffer>();
 let originalBytes=0;
 for(const message of messages)if(message.media){
   originalBytes+=message.media.size;
   if(originalBytes>25*1024*1024)throw new HttpError(422,"Anexos excedem 25 MB para uma geração integral. Nenhum comprovante foi gravado.");
   const {bytes}=await mediaAccess(profile,message.media.id);
   if(!bytes)throw new HttpError(409,"Mídia incompleta; nenhum comprovante será gravado.");
   originals.set(message.media.id,bytes);
 }
 const pages=await paginateEvidence(messages,600,originals);
 originals.clear();
 const images:{part:number;name:string;bytes:Buffer;sha:string}[]=[];
 let totalBytes=0;
 for(let index=0;index<pages.length;index++){
   const rendered=new ImageResponse(<RenderPage
     page={pages[index]} phone={conversation.phone} caseId={caseId}
     pageNumber={index+1} total={pages.length}
   />,{width:900,height:840});
   const bytes=Buffer.from(await rendered.arrayBuffer());
   totalBytes+=bytes.length;
   if(totalBytes>25*1024*1024)
     throw new HttpError(422,"Prints excedem 25 MB. Nenhum comprovante foi gravado.");
   images.push({part:index+1,name:`print-${String(index+1).padStart(2,"0")}.png`,bytes,sha:fingerprint(bytes)});
 }
 const manifest={
   source:"ALC Atendimento — reconstrução visual de mensagens reais, não captura nativa do WhatsApp Web",
   case_id:caseId,conversation_id:conversationId,
   phone:conversation.phone,message_count:messages.length,
   print_count:pages.length,source_sha256:sourceHash,
   format_version:2,
   timestamp_source:"Horários de registro das mensagens no ALC",
   messages:messages.map(m=>({id:m.id,provider_id:m.provider_id,direction:m.direction,body:m.body,type:m.type,status:m.status,
     created_at:new Date(m.created_at).toISOString(),media:m.media||null})),
   prints:images.map(x=>({file:x.name,part:x.part,sha256:x.sha})),
   created_at:new Date().toISOString(),
 };
 const client=await db().connect();
 try{
   await client.query("BEGIN");
   await client.query("SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))");
   await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["atendimento_case:"+caseId]);
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[conversationId]);
   const current=(await client.query("SELECT * FROM alc_atendimento.conversations WHERE id=$1 FOR UPDATE",[conversationId])).rows[0];
   const currentPnr=(await client.query("SELECT case_id,base_key,sigla FROM alc_atendimento.cases WHERE case_id=$1 FOR SHARE",[caseId])).rows[0];
   const scope=await scopeFor(profile,client);
   if(!current || !currentPnr || !await canReadConversation(profile,current,scope,client) || !await canReadConversation(profile,currentPnr,scope,client))
     throw new HttpError(404,"Conversa não encontrada.");
   const freshMessages=await evidenceMessages(conversationId,client,true);
   if(current.case_id!==caseId || current.phone!==conversation.phone || validateEvidence(current,freshMessages,freshMessages.length>500) ||
       freshMessages.some(m=>m.case_id && m.case_id!==caseId) || evidenceFingerprint(current.phone,caseId,freshMessages)!==sourceHash)
     throw new HttpError(409,"Histórico alterado durante a geração. Nenhum comprovante foi gravado; tente novamente.");
   const mediaIds=messages.flatMap(m=>m.media?[m.media.id]:[]);
   if(mediaIds.length){
     const held=await client.query(`SELECT id FROM alc_atendimento.media WHERE id=ANY($1::uuid[]) AND status='ready'
       AND (legal_hold OR retention_until>now()) ORDER BY id FOR UPDATE`,[mediaIds]);
     if(held.rowCount!==mediaIds.length)throw new HttpError(409,"Mídia indisponível durante a geração. Nenhum comprovante foi gravado.");
   }
   await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["alc_evidence:"+caseId]);
   const previous=await client.query(
     "SELECT source_hash FROM alc_atendimento.evidence_folders WHERE case_id=$1 FOR UPDATE",
     [caseId],
   );
   if(previous.rowCount){
     if(previous.rows[0].source_hash!==sourceHash)
       throw new HttpError(409,"Pasta já existente com comprovantes diferentes; não é permitido sobrescrever.");
     await client.query("COMMIT");
     return {caseId,created:false};
   }
   await client.query(
     `INSERT INTO alc_atendimento.evidence_folders
      (case_id,conversation_id,phone,base_key,sigla,source_hash,message_count,print_count,manifest,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
     [caseId,conversationId,conversation.phone,currentPnr.base_key,currentPnr.sigla,
       sourceHash,messages.length,pages.length,manifest,profile.id],
   );
   for(const image of images)await client.query(
     `INSERT INTO alc_atendimento.evidence_images(case_id,page_number,filename,sha256,image_png)
       VALUES($1,$2,$3,$4,$5)`,
     [caseId,image.part,image.name,image.sha,image.bytes],
   );
   for(const message of messages)if(message.media){
     await client.query("INSERT INTO alc_atendimento.evidence_media(case_id,media_id,message_id,sha256) VALUES($1,$2,$3,$4)",
       [caseId,message.media.id,message.id,message.media.sha256]);
     await client.query("UPDATE alc_atendimento.media SET legal_hold=true,updated_at=now() WHERE id=$1",[message.media.id]);
   }
   await audit(profile.id,"evidence_folder_created",caseId,
     {conversationId,sha256:sourceHash,prints:images.length,messages:messages.length},client);
   await client.query("COMMIT");
   return {caseId,created:true};
 }catch(error){await client.query("ROLLBACK");throw error;}
 finally{client.release();}
}
