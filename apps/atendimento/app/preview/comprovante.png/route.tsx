import { ImageResponse } from "next/og";
import { clientOpening, clientReply, type CaseRecord } from "@/lib/domain";
export const runtime = "nodejs";
const syntheticRecord = {
  customerVerified:true, customerName:"Cliente Exemplo", customerPhone:"5511999990000",
  products:[{title:"Produto demonstrativo"}], purchaseValue:285.5,
  deliveryAt:"2026-10-07T17:00:00Z", shipmentId:"DEMO-ENV-101",
} as CaseRecord;
const messages = [
  {out:true,time:"09:01",text:clientOpening(syntheticRecord,"Equipe ALC")},
  {out:false,time:"09:03",text:"Sim, recebi o produto."},
  {out:true,time:"09:04",text:clientReply({step:"receipt"},"Sim","Cliente Exemplo").reply},
  {out:false,time:"09:05",text:"07/10"},
  {out:true,time:"09:06",text:clientReply({step:"date"},"07/10","Cliente Exemplo").reply},
  {out:false,time:"09:07",text:"Sim, o produto estava correto."},
  {out:true,time:"09:08",text:clientReply({step:"product",receivedAt:"07/10"},"Sim, correto","Cliente Exemplo").reply},
];
export async function GET() {
  return new ImageResponse(
    <div style={{width:900,height:1580,display:"flex",flexDirection:"column",backgroundColor:"#efeae2",fontFamily:"Arial, sans-serif",color:"#111b21"}}>
      <div style={{backgroundColor:"#b51c29",color:"#fff",padding:"12px 20px",fontSize:17,fontWeight:700,display:"flex",justifyContent:"center"}}>
        DEMONSTRAÇÃO · DADOS FICTÍCIOS · SEM VALOR PROBATÓRIO
      </div>
      <div style={{display:"flex",backgroundColor:"#f0f2f5",padding:"17px 24px",alignItems:"center",gap:16}}>
        <div style={{borderRadius:50,backgroundColor:"#dbe3e5",width:54,height:54,display:"flex",justifyContent:"center",alignItems:"center",fontSize:27,color:"#667781"}}>●</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}><span style={{fontSize:23,fontWeight:700}}>+55 11 99999-0000</span><span style={{fontSize:13,color:"#667781"}}>Contato demonstrativo</span></div>
      </div>
      <div style={{padding:"28px 48px",flexGrow:1,display:"flex",flexDirection:"column",gap:12}}>
        <span style={{alignSelf:"center",backgroundColor:"#fff",padding:"8px 13px",borderRadius:7,fontSize:13,color:"#667781"}}>08/10/2026 · Conversa simulada</span>
        {messages.map((m,i)=><div key={i} style={{display:"flex",flexDirection:"column",alignSelf:m.out?"flex-end":"flex-start",backgroundColor:m.out?"#d9fdd3":"#fff",maxWidth:680,padding:"12px 16px",borderRadius:9,gap:8}}>
          <span style={{fontSize:17,lineHeight:1.4,whiteSpace:"pre-wrap",overflowWrap:"break-word"}}>{m.text}</span>
          <span style={{fontSize:11,color:"#667781",alignSelf:"flex-end"}}>{m.time} {m.out?"✓✓":""}</span>
        </div>)}
      </div>
      <div style={{padding:"15px 24px",display:"flex",flexDirection:"column",gap:5,backgroundColor:"#f0f2f5",color:"#556",fontSize:13}}>
        <span>ALC Atendimento · Roteiro C01 até C04 · Caso DEMO-001</span>
        <span>Exemplo visual fictício, não captura nativa do WhatsApp Web · Sem confirmação de encerramento real da PNR</span>
      </div>
    </div>, {
      width:900,height:1580,
      headers:{"Content-Disposition":'attachment; filename="comprovante-demonstrativo.png"',"Cache-Control":"no-store"}
    });
}
