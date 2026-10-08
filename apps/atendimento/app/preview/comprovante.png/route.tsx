import { ImageResponse } from "next/og";
export const runtime = "nodejs";
const messages = [
  { out: true, time:"09:01",text:"Olá! Estamos acompanhando uma ocorrência relacionada à entrega demonstrativa DEMO-ENV-101. Você recebeu o produto?" },
  { out: false,time:"09:03",text:"Sim, recebi o produto." },
  { out: true,time:"09:04",text:"Obrigado! Em qual data recebeu? O produto estava correto?" },
  { out: false,time:"09:05",text:"Recebi no dia 07/10, e o produto estava correto." },
  { out: true,time:"09:06",text:"Obrigado pela confirmação. As informações foram registradas para análise da equipe." },
];
export async function GET() {
  return new ImageResponse(
    <div style={{width:900,height:940,display:"flex",flexDirection:"column",backgroundColor:"#efeae2",fontFamily:"Arial, sans-serif",color:"#111b21"}}>
      <div style={{backgroundColor:"#ad1c23",color:"#fff",padding:"12px 20px",fontSize:17,fontWeight:700,display:"flex",justifyContent:"center"}}>
        AMOSTRA DEMONSTRATIVA · DADOS FICTÍCIOS · SEM VALOR PROBATÓRIO
      </div>
      <div style={{display:"flex",backgroundColor:"#f0f2f5",padding:"17px 24px",alignItems:"center",gap:16}}>
        <div style={{borderRadius:50,backgroundColor:"#dbe3e5",width:54,height:54,display:"flex",justifyContent:"center",alignItems:"center",fontSize:27,color:"#667781"}}>●</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}><span style={{fontSize:23,fontWeight:700}}>+55 11 99999-0000</span><span style={{fontSize:13,color:"#667781"}}>Contato demonstrativo</span></div>
      </div>
      <div style={{padding:"30px 48px",flexGrow:1,display:"flex",flexDirection:"column",gap:15}}>
        <span style={{alignSelf:"center",backgroundColor:"#fff",padding:"8px 13px",borderRadius:7,fontSize:13,color:"#667781"}}>08/10/2026 · Simulação</span>
        {messages.map((m,i)=><div key={i} style={{display:"flex",flexDirection:"column",alignSelf:m.out?"flex-end":"flex-start",backgroundColor:m.out?"#d9fdd3":"#fff",maxWidth:670,padding:"13px 17px",borderRadius:9,gap:9}}>
          <span style={{fontSize:18,lineHeight:1.35,whiteSpace:"pre-wrap"}}>{m.text}</span>
          <span style={{fontSize:12,color:"#667781",alignSelf:"flex-end"}}>{m.time} {m.out?"✓✓":""}</span>
        </div>)}
      </div>
      <div style={{padding:"15px 24px",display:"flex",flexDirection:"column",gap:5,backgroundColor:"#f0f2f5",color:"#556",fontSize:13}}>
        <span>ALC Atendimento · Modelo visual da PR #70 · Caso DEMO-001</span>
        <span>Reconstrução ilustrativa, não captura nativa do WhatsApp Web</span>
      </div>
    </div>,{
      width:900,height:940,headers:{"Content-Disposition":'attachment; filename="comprovante-demonstrativo.png"',"Cache-Control":"public,max-age=60"}
    });
}
