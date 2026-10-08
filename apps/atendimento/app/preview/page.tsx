"use client";
import { useMemo, useState } from "react";
import {
  Bot, ChevronDown, ChevronRight, ClipboardList, FileCheck2,
  LayoutDashboard, MessageCircle, ShieldCheck, UserCircle2,
} from "lucide-react";
import { Brand } from "@alc/ui/brand";
import { groupCasesByDriver } from "@/lib/driver-groups";
import { CUSTOMER_STEPS, DRIVER_STEPS, AGENT_GUARDRAILS } from "@/lib/agent-playbook";
import { driverNotificationEligible, clientOpening, clientReply, type CaseRecord } from "@/lib/domain";

type Item = {
  case_id: string;
  competence: string;
  classification: string;
  record: {
    driverId: string; driverPhone: string; driverName: string;
    baseKey: string; sigla: string; shipmentId: string;
  };
};
const samples: Item[] = [
  { case_id:"DEMO-001", competence:"202610Q1", classification:"aguardando_comprovante", record:{driverId:"DRV-001",driverPhone:"5511999990000",driverName:"Motorista Exemplo A",baseKey:"RIBEIRÃO PRETO",sigla:"RP",shipmentId:"DEMO-ENV-101"}},
  { case_id:"DEMO-002", competence:"202610Q1", classification:"penalidade", record:{driverId:"DRV-001",driverPhone:"5511999990000",driverName:"Motorista Exemplo A",baseKey:"RIBEIRÃO PRETO",sigla:"RP",shipmentId:"DEMO-ENV-102"}},
  { case_id:"DEMO-003", competence:"202610Q1", classification:"aberta", record:{driverId:"DRV-001",driverPhone:"5511999990000",driverName:"Motorista Exemplo A",baseKey:"RIBEIRÃO PRETO",sigla:"RP",shipmentId:"DEMO-ENV-103"}},
  { case_id:"DEMO-004", competence:"202610Q1", classification:"encerrada", record:{driverId:"DRV-002",driverPhone:"5511999990001",driverName:"Motorista Exemplo B",baseKey:"UBERLÂNDIA",sigla:"UDI",shipmentId:"DEMO-ENV-201"}},
  { case_id:"DEMO-005", competence:"202610Q1", classification:"aberta", record:{driverId:"DRV-003",driverPhone:"5511999990002",driverName:"Motorista Exemplo C",baseKey:"RIO VERDE",sigla:"RV",shipmentId:"DEMO-ENV-301"}},
];
const cases: Record<string,string> = {
  aguardando_comprovante:"Aguardando comprovante",
  penalidade:"Com penalidade",
  aberta:"Em aberto / revisão",
  encerrada:"Encerrada",
};
const demoClient = {
  customerVerified:true, customerName:"Cliente Exemplo", customerPhone:"5511999990000",
  products:[{title:"Produto demonstrativo"}], purchaseValue:285.5,
  deliveryAt:"2026-10-07T17:00:00Z",shipmentId:"DEMO-ENV-101",
} as CaseRecord;
const demoMessages = [
  {direction:"out",time:"09:01",body:clientOpening(demoClient,"Equipe ALC")},
  {direction:"in",time:"09:03",body:"Sim, recebi o produto."},
  {direction:"out",time:"09:04",body:clientReply({step:"receipt"},"Sim","Cliente Exemplo").reply},
  {direction:"in",time:"09:05",body:"07/10"},
  {direction:"out",time:"09:06",body:clientReply({step:"date"},"07/10","Cliente Exemplo").reply},
  {direction:"in",time:"09:07",body:"Sim, o produto estava correto."},
  {direction:"out",time:"09:08",body:clientReply({step:"product",receivedAt:"07/10"},"Sim, correto","Cliente Exemplo").reply},
];
const navigation = [
  {id:"overview",name:"Visão Geral",icon:LayoutDashboard},
  {id:"pnrs",name:"Motoristas e PNRs",icon:ClipboardList},
  {id:"agent",name:"Agente virtual",icon:Bot},
  {id:"proof",name:"Comprovantes",icon:FileCheck2},
] as const;
type Tab = typeof navigation[number]["id"];

export default function Preview() {
  const [tab,setTab]=useState<Tab>("overview");
  const [open,setOpen]=useState<string[]>(["id:DRV-001"]);
  const [term,setTerm]=useState("");
  const [filter,setFilter]=useState("all");
  const [caseSelected,setCaseSelected]=useState<Item|null>(null);
  const filtered=useMemo(()=>samples.filter(x=>(filter==="all"||filter===x.classification)&&
    [x.record.driverName,x.record.baseKey,x.record.shipmentId,x.case_id].join(" ").toLowerCase().includes(term.toLowerCase())),[term,filter]);
  const groups=useMemo(()=>groupCasesByDriver(filtered),[filtered]);
  const current=navigation.find(x=>x.id===tab)!;
  return <div className="workspace preview-workspace">
    <aside className="app-sidebar">
      <div className="sidebar-brand"><Brand application="atendimento" /></div>
      <nav aria-label="Navegação da prévia">
        <p className="nav-label">PRÉVIA TEMPORÁRIA</p>
        {navigation.map(({id,name,icon:Icon})=><button
          key={id} className={"preview-nav-button "+(tab===id?"active":"")}
          aria-current={tab===id?"page":undefined} type="button"
          onClick={()=>setTab(id)}><Icon size={19}/><span>{name}</span></button>)}
      </nav>
      <div className="sidebar-bottom"><p style={{fontSize:11,color:"#ddd",marginBottom:4}}>Demonstração PR #70</p><small>Dados inteiramente simulados</small></div>
    </aside>
    <div className="app-main">
      <header className="app-header">
        <div className="header-title"><span>AMBIENTE DE VISUALIZAÇÃO</span><h1>{current.name}</h1></div>
        <div className="header-actions"><span className="badge pending">Preview isolado</span><span className="user-chip"><ShieldCheck size={15}/> Demonstração</span></div>
      </header>
      <main className="page">
        <p className="notice preview-warning" role="status">Ambiente de demonstração da PR #70. Números, motoristas, mensagens, PNRs e comprovantes são fictícios. Sem conexão aos bancos ou WhatsApp de produção.</p>
        {tab==="overview"&&<section>
          <p className="muted">Visão ilustrativa das regras preparadas nesta entrega.</p>
          <div className="stats preview-stats">
            <article className="kpi-card kpi-card--red"><small>PNRs demonstrativas</small><strong>5</strong></article>
            <article className="kpi-card kpi-card--amber"><small>Elegíveis para notificação</small><strong>2</strong></article>
            <article className="kpi-card"><small>Em revisão (somente consulta)</small><strong>2</strong></article>
            <article className="kpi-card"><small>Comprovantes simulados</small><strong>1</strong></article>
          </div>
          <div className="preview-duo">
            <article className="card"><h2>Notificações aos motoristas</h2><p>Somente <strong>Aguardando comprovante</strong> e <strong>Com penalidade</strong> podem originar disparos, sujeitos à validação e modelo Meta aprovado.</p><p>Casos em revisão e encerrados ficam disponíveis para consulta do motorista identificado.</p><button onClick={()=>setTab("pnrs")}>Ver PNRs demonstrativas <ChevronRight size={15}/></button></article>
            <article className="card"><h2>Atendimento e comprovante</h2><p>O motor atual usa regras determinísticas. OpenAI e Gemini não estão conectados; a Meta é o canal de transporte.</p><p>O comprovante visual é derivado de mensagens confirmadas e mostra apenas o número do contato.</p><div className="actions"><button onClick={()=>setTab("agent")}>Ver agente virtual</button><button onClick={()=>setTab("proof")}>Ver comprovante</button></div></article>
          </div>
        </section>}
        {tab==="pnrs"&&<section>
          <div className="page-tools"><p>Motoristas agrupados; abra cada grupo para consultar os envios.</p><span className="badge">202610Q1 · Simulação</span></div>
          <div className="toolbar">
            <input aria-label="Pesquisar PNRs simuladas" placeholder="Envio, motorista, base ou caso" value={term} onChange={e=>setTerm(e.target.value)}/>
            <select aria-label="Filtrar por classificação" value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="all">Todas as classificações</option>{Object.entries(cases).map(([k,v])=><option value={k} key={k}>{v}</option>)}
            </select><span>{groups.length} motoristas · {filtered.length} PNRs</span>
          </div>
          <div className="driver-groups">{groups.map(group=>{
            const expanded=open.includes(group.key);
            return <section className="card driver-group" key={group.key}>
              <button className="driver-group-header" aria-expanded={expanded} onClick={()=>setOpen(previous=>previous.includes(group.key)?previous.filter(x=>x!==group.key):[...previous,group.key])}>
                <span className="driver-group-name"><strong>{group.name}</strong><small>{group.bases.join(", ")}</small></span>
                <span className="driver-group-count"><strong>{group.rows.length}</strong><small>PNRs</small></span>
                <span className="driver-group-status">{Object.entries(group.counts).filter(([,n])=>n>0).map(([type,n])=><span className={"badge "+type} key={type}>{n} {cases[type]?.toLowerCase()}</span>)}</span>
                {expanded?<ChevronDown size={18}/>:<ChevronRight size={18}/>}
              </button>
              {expanded&&<div className="table-wrap driver-case-table"><table><thead><tr><th>Envio / caso</th><th>Base</th><th>Classificação</th><th>Notificação</th><th/></tr></thead><tbody>{group.rows.map(r=><tr key={r.case_id}><td><strong>{r.record.shipmentId}</strong><small>{r.case_id}</small></td><td>{r.record.baseKey}</td><td><span className={"badge "+r.classification}>{cases[r.classification]}</span></td><td>{driverNotificationEligible(r.classification)?"Elegível*":"Somente consulta"}</td><td><button onClick={()=>setCaseSelected(r)}>Detalhes <ChevronRight size={15}/></button></td></tr>)}</tbody></table></div>}
            </section>
          })}</div>
          <p className="muted" style={{marginTop:14}}>* Elegibilidade sujeita a condições adicionais. Não há conexão com Meta nesta prévia.</p>
          {caseSelected&&<div className="preview-modal" role="dialog" aria-modal="true" aria-label="Detalhes da PNR fictícia"><div className="card"><h2>Envio {caseSelected.record.shipmentId}</h2><p>Motorista: {caseSelected.record.driverName}</p><p>Base: {caseSelected.record.baseKey}</p><p>Classificação: {cases[caseSelected.classification]}</p><p><strong>Disparo:</strong> {driverNotificationEligible(caseSelected.classification)?"Elegível, condicionado a validações":"Bloqueado, apenas consulta"}</p><button onClick={()=>setCaseSelected(null)}>Fechar</button></div></div>}
        </section>}
        {tab==="agent"&&<section>
          <p className="notice">Motor ativo em produção: <strong>regras determinísticas</strong>. Esta página mostra o roteiro de atendimento da PR #70. Nenhuma IA externa ou envio de mensagens está ativado no preview.</p>
          <h2>Instruções para atender clientes</h2><div className="preview-step-grid">{CUSTOMER_STEPS.map((step,i)=><article className="card" key={step.id}><small>ETAPA {i+1}</small><h3>{step.title}</h3><p>{step.goal}</p>{"example" in step&&<blockquote style={{whiteSpace:"pre-wrap"}}>{step.example}</blockquote>}</article>)}</div>
          <h2>Fluxos para motoristas</h2><div className="preview-step-grid">{DRIVER_STEPS.map(s=><article className="card" key={s.id}><h3>{s.title}</h3><p>{s.goal}</p>{"example" in s && <blockquote style={{whiteSpace:"pre-wrap"}}>{s.example}</blockquote>}</article>)}</div>
          <h2>Restrições de atendimento</h2><div className="card"><ul>{AGENT_GUARDRAILS.map(s=><li key={s}>{s}</li>)}</ul></div>
        </section>}
        {tab==="proof"&&<section>
          <div className="page-tools"><p>Modelo visual com a abertura C01 e o encerramento C04 aprovados; não é histórico real.</p><span className="badge">Caso DEMO-001</span></div>
          <div className="preview-chat">
            <header className="preview-chat-head"><span className="preview-contact-icon"><UserCircle2 size={35}/></span><div><strong>+55 11 99999-0000</strong><small>Cliente · Atendimento demonstrativo</small></div></header>
            <div className="preview-chat-body"><small className="preview-chat-date">08/10/2026 · Conversa fictícia</small>{demoMessages.map((m,i)=><div key={i} className={"preview-bubble "+m.direction}><p>{m.body}</p><small>{m.time} {m.direction==="out"?"✓✓":""}</small></div>)}</div>
            <footer className="preview-chat-foot"><MessageCircle size={17}/> Modelo ilustrativo do ALC Atendimento · Não é captura original do WhatsApp Web · DEMONSTRAÇÃO</footer>
          </div>
          <div className="actions"><a className="primary" href="/preview/comprovante.png" download="comprovante-demonstrativo.png"><FileCheck2 size={17}/> Baixar amostra PNG</a><button onClick={()=>setTab("agent")}><Bot size={16}/> Voltar ao agente virtual</button></div>
          <p className="muted" style={{marginTop:12}}>No sistema real, o PNG só é permitido após encerramento, com histórico integral e mensagens confirmadas; o exemplo acima não serve para comprovação no Case Center.</p>
        </section>}
      </main>
    </div>
  </div>;
}
