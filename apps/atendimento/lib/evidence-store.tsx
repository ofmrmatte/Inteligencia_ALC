import { createHash } from "node:crypto";
import { ImageResponse } from "next/og";
import { db, audit } from "./db";
import { scopeFor, HttpError } from "./auth";
import { canReadConversation } from "./inbox";
import { evidenceFingerprint, paginateEvidence, validateEvidence, type EvidenceMessage } from "./evidence";
import { RenderPage } from "./evidence-render";
import type { AuthProfile } from "@alc/identity/auth";

export const evidenceCaseId=/^[a-zA-Z0-9_-]{1,80}$/;
export type EvidenceFolder = {
 case_id:string; conversation_id:string; phone:string; base_key:string; sigla:string;
 source_hash:string; print_count:number; message_count:number; manifest:Record<string,unknown>;
 created_at:string; created_by:string|null;
};
const fingerprint=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");

export async function authorizedFolder(profile:AuthProfile,caseId:string):Promise<EvidenceFolder> {
 if(!evidenceCaseId.test(caseId))throw new HttpError(400,"ID de PNR inválido.");
 const result=await db().query(
   "SELECT e.*,c.assigned_to FROM alc_atendimento.evidence_folders e LEFT JOIN alc_atendimento.conversations c ON c.id=e.conversation_id WHERE e.case_id=$1",
   [caseId],
 );
 const folder=result.rows[0] as EvidenceFolder|undefined;
 if(!folder || !await canReadConversation(profile,folder))
   throw new HttpError(404,"Pasta de comprovantes não encontrada.");
 return folder;
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
 const linked=await db().query(
   "SELECT DISTINCT case_id FROM alc_atendimento.outbox WHERE conversation_id=$1 AND case_id IS NOT NULL LIMIT 2",
   [conversationId],
 );
 if(linked.rows.length>1 || (linked.rows.length===1 && linked.rows[0].case_id!==caseId))
   throw new HttpError(422,"Histórico relacionado a mais de uma PNR. Separe as tratativas antes de gerar.");
 const messagesResult=await db().query(
   `SELECT id,provider_id,direction,body,type,status,created_at,attachment
    FROM alc_atendimento.messages WHERE conversation_id=$1
    ORDER BY created_at ASC,id ASC LIMIT 502`,
   [conversationId],
 );
 const messages=messagesResult.rows as EvidenceMessage[];
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
   return {caseId,created:false};
 }
 const pages=paginateEvidence(messages);
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
   prints:images.map(x=>({file:x.name,part:x.part,sha256:x.sha})),
   created_at:new Date().toISOString(),
 };
 const client=await db().connect();
 try{
   await client.query("BEGIN");
   await client.query("SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))");
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[conversationId]);
   const current=(await client.query("SELECT * FROM alc_atendimento.conversations WHERE id=$1",[conversationId])).rows[0];
   if(!current || !await canReadConversation(profile,current,await scopeFor(profile,client),client))
     throw new HttpError(404,"Conversa não encontrada.");
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
     [caseId,conversationId,conversation.phone,conversation.base_key,conversation.sigla,
       sourceHash,messages.length,pages.length,manifest,profile.id],
   );
   for(const image of images)await client.query(
     `INSERT INTO alc_atendimento.evidence_images(case_id,page_number,filename,sha256,image_png)
       VALUES($1,$2,$3,$4,$5)`,
     [caseId,image.part,image.name,image.sha,image.bytes],
   );
   await audit(profile.id,"evidence_folder_created",caseId,
     {conversationId,sha256:sourceHash,prints:images.length,messages:messages.length},client);
   await client.query("COMMIT");
   return {caseId,created:true};
 }catch(error){await client.query("ROLLBACK");throw error;}
 finally{client.release();}
}
