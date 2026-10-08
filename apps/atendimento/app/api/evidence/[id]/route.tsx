import { ImageResponse } from "next/og";
import { createHash } from "node:crypto";
import { z } from "zod";
import { currentProfile, scopeFor, visible } from "@/lib/auth";
import { audit, db } from "@/lib/db";
import { evidenceFingerprint, validateEvidence, paginateEvidence, type EvidenceMessage, type EvidencePage } from "@/lib/evidence";
import { packZip } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const failed=(message:string,status:number)=>
  Response.json({error:message},{status,headers:{"Cache-Control":"private, no-store"}});
const time=(d:Date|string)=>new Date(d).toLocaleTimeString("pt-BR",{
  timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",
});
const date=(d:Date|string)=>new Date(d).toLocaleDateString("pt-BR",{
  timeZone:"America/Sao_Paulo",
});
function RenderPage({page,phone,caseId,pageNumber,total}:{
  page:EvidencePage;phone:string;caseId:string;pageNumber:number;total:number;
}) {
  return <div style={{
    height:840,width:900,display:"flex",flexDirection:"column",
    backgroundColor:"#efeae2",fontFamily:"Arial, sans-serif",color:"#111b21",
  }}>
    <div style={{height:77,flexShrink:0,display:"flex",alignItems:"center",
      gap:14,padding:"12px 23px",backgroundColor:"#f0f2f5",borderBottom:"1px solid #d8dfe2"}}>
      <span style={{color:"#8696a0",fontSize:25,marginRight:4}}>‹</span>
      <div style={{width:48,height:48,borderRadius:48,backgroundColor:"#dfe5e7",
        display:"flex",alignItems:"center",justifyContent:"center",color:"#687a84"}}>
        <svg width="34" height="34" viewBox="0 0 34 34">
          <circle cx="17" cy="12" r="7" fill="currentColor"/>
          <path d="M3 31C3 21 10 19 17 19C24 19 31 21 31 31" fill="currentColor"/>
        </svg>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <strong style={{fontSize:21,fontWeight:600}}>+{phone}</strong>
        <span style={{color:"#667781",fontSize:13}}>Contato · Atendimento ALC</span>
      </div>
      <div style={{marginLeft:"auto",color:"#64777e",fontSize:23,display:"flex",gap:22}}>
        <span>⌕</span><span>⋮</span>
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",flexGrow:1,padding:"20px 42px",
      gap:8,backgroundColor:"#efeae2"}}>
      <div style={{alignSelf:"center",borderRadius:7,backgroundColor:"#fff",
        padding:"7px 13px",fontSize:12,color:"#65777d",marginBottom:5}}>
        {date(page.first)} · parte {pageNumber} de {total}
      </div>
      {page.segments.map((slice,index)=><div key={slice.message.id+":"+slice.section+":"+index}
        style={{backgroundColor:slice.message.direction==="out"?"#d9fdd3":"#fff",
          maxWidth:690,minWidth:145,alignSelf:slice.message.direction==="out"?"flex-end":"flex-start",
          display:"flex",flexDirection:"column",gap:6,
          padding:"9px 12px 7px",borderRadius:8,
        }}>
        {slice.sections>1?<span style={{fontSize:11,color:"#667781"}}>
          Mensagem em continuação · trecho {slice.section}/{slice.sections}
        </span>:null}
        <div style={{fontSize:17,lineHeight:1.25,whiteSpace:"pre-wrap",overflowWrap:"break-word"}}>
          {slice.text}
        </div>
        <div style={{alignSelf:"flex-end",fontSize:11,color:"#667781",display:"flex",gap:8}}>
          <span>{time(slice.message.created_at)}</span>
          {slice.message.direction==="out" ?
            <span style={{color:slice.message.status==="read"?"#53bdeb":"#667781"}}>
              {slice.message.status==="read"?"✓✓":slice.message.status==="delivered"?"✓✓":"✓"}
            </span>:null}
        </div>
      </div>)}
    </div>
    <div style={{height:51,flexShrink:0,backgroundColor:"#f0f2f5",borderTop:"1px solid #d8dfe2",
      display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 19px",
      fontSize:11,color:"#53646a",gap:12}}>
      <span>ALC Atendimento · Registro visual reconstruído de mensagens verificadas, não captura nativa do WhatsApp Web</span>
      <strong>PNR {caseId} · {pageNumber}/{total}</strong>
    </div>
  </div>;
}

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const profile=await currentProfile();
  const parsed=z.string().uuid().safeParse((await params).id);
  if(!parsed.success)return failed("Conversa inválida.",400);
  const result=await db().query(
    "SELECT id,phone,channel,status,case_id,base_key,sigla FROM alc_atendimento.conversations WHERE id=$1",
    [parsed.data],
  );
  const conversation=result.rows[0];
  if(!conversation || !visible(await scopeFor(profile),conversation))
    return failed("Conversa não encontrada.",404);
  if(conversation.channel!=="client")return failed("Comprovantes são restritos ao canal de clientes.",422);
  if(!conversation.case_id)return failed("Conversa sem vínculo com PNR.",422);
  const matches=await db().query(
    "SELECT DISTINCT case_id FROM alc_atendimento.outbox WHERE conversation_id=$1 AND case_id IS NOT NULL LIMIT 2",
    [parsed.data],
  );
  if(matches.rows.length>1 || (matches.rows.length===1 && matches.rows[0].case_id!==conversation.case_id))
    return failed("Mensagens associadas a mais de uma PNR. A tratativa deve ser delimitada antes da exportação.",422);
  const resultMessages=await db().query(
    `SELECT id,provider_id,direction,body,type,status,created_at,attachment
      FROM alc_atendimento.messages WHERE conversation_id=$1
      ORDER BY created_at ASC,id ASC LIMIT 502`,[parsed.data],
  );
  const messages=resultMessages.rows as EvidenceMessage[];
  const reason=validateEvidence(conversation,messages,messages.length>500);
  if(reason)return failed(reason,422);
  const caseId=String(conversation.case_id);
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(caseId))
    return failed("ID da PNR incompatível com a nomenclatura de pasta; exportação não executada.",422);
  let pages:EvidencePage[];
  try{pages=paginateEvidence(messages);}
  catch(e){return failed(e instanceof Error?e.message:"Falha no recorte dos prints.",422);}
  if(!pages.length)return failed("Não há páginas para exportar.",422);
  const checksum=evidenceFingerprint(conversation.phone,caseId,messages);
  const entries:{path:string;data:Buffer}[]=[];
  const manifestFiles:{file:string;sha256:string;part:number}[]=[];
  for(let i=0;i<pages.length;i++){
    const png=new ImageResponse(
      <RenderPage page={pages[i]} phone={conversation.phone} caseId={caseId}
        pageNumber={i+1} total={pages.length}/>,
      {width:900,height:840},
    );
    const bytes=Buffer.from(await png.arrayBuffer());
    const name=`print-${String(i+1).padStart(2,"0")}.png`;
    entries.push({path:`${caseId}/${name}`,data:bytes});
    manifestFiles.push({file:name,sha256:createHash("sha256").update(bytes).digest("hex"),part:i+1});
  }
  const manifest={
    origem:"ALC Atendimento — reconstituição visual; não captura nativa do WhatsApp Web",
    case_id:caseId,conversation_id:parsed.data,phone:conversation.phone,
    messages:messages.length,prints:pages.length,sha256_conversa:checksum,
    files:manifestFiles,exported_at:new Date().toISOString(),
  };
  entries.push({path:`${caseId}/manifesto.json`,data:Buffer.from(JSON.stringify(manifest,null,2),"utf8")});
  const archive=packZip(entries);
  await audit(profile.id,"evidence_export",parsed.data,{
    caseId,prints:pages.length,messages:messages.length,sha256:checksum,
    format:"zip/screenshots",
  });
  return new Response(new Uint8Array(archive),{
    status:200,headers:{
      "Content-Type":"application/zip",
      "Content-Disposition":`attachment; filename="comprovante-${caseId}.zip"`,
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff",
    },
  });
}
