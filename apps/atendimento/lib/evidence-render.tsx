import type { EvidencePage } from "./evidence";
const time=(d:Date|string)=>new Date(d).toLocaleTimeString("pt-BR",{
  timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",
});
const date=(d:Date|string)=>new Date(d).toLocaleDateString("pt-BR",{
  timeZone:"America/Sao_Paulo",
});
export function RenderPage({page,phone,caseId,pageNumber,total}:{
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

