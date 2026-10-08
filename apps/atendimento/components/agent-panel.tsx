"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Save, X } from "lucide-react";
import { api, useData } from "./data";
import { AGENT_GUARDRAILS } from "../lib/agent-playbook";

type Channel = "client" | "driver";
type Entry = {channel:Channel;code:string;title:string;goal:string;example:string};
type Snapshot = {revision:number;client:Entry[];driver:Entry[];policies:string[]};
export function AgentPanel(){
  const {data,error,refresh} = useData<Snapshot>("agent-instructions");
  const [channel,setChannel] = useState<Channel>("client");
  const [expanded,setExpanded] = useState<string[]>([]);
  const [editing,setEditing] = useState<string|null>(null);
  const [draft,setDraft] = useState<Entry|null>(null);
  const [policiesDraft,setPoliciesDraft] = useState("");
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [instructionGroup,setInstructionGroup] = useState(true);
  const entries = (channel==="client"?data?.client:data?.driver)||[];
  function begin(entry:Entry) {
    setEditing(entry.code); setDraft({...entry}); setNotice("");
    setExpanded(previous=>[...new Set([...previous,entry.code])]);
  }
  async function save(entry:Entry) {
    if(!data)return;
    setBusy(true);setNotice("");
    try{
      await api("agent-instructions",{kind:"script",revision:data.revision,entry});
      await refresh();
      setEditing(null);setDraft(null);
      setNotice(`Instrução ${entry.code} salva e registrada na auditoria.`);
    }catch(err){setNotice(err instanceof Error?err.message:"Erro ao salvar instrução.");}
    finally{setBusy(false);}
  }
  async function savePolicies() {
    if(!data)return;
    const policies=policiesDraft.split("\n").map(s=>s.trim()).filter(Boolean);
    setBusy(true);setNotice("");
    try{
      await api("agent-instructions",{kind:"policies",revision:data.revision,policies});
      await refresh();setEditing(null);
      setNotice("Modelo de restrições atualizado. As proteções obrigatórias do sistema permanecem ativas.");
    }catch(err){setNotice(err instanceof Error?err.message:"Erro ao salvar restrições.");}
    finally{setBusy(false);}
  }
  return <section className="settings-section">
    <p className="eyebrow">MODELO DE INSTRUÇÕES</p>
    <h2>Instruções do agente virtual</h2>
    <p className="muted">Edite as respostas e regras operacionais sem alterar o código. Cada alteração fica registrada na auditoria. As regras de segurança, permissões, elegibilidade e encerramento da PNR são fixas.</p>
    <p className="notice">Motor atual: <strong>Regras determinísticas.</strong> OpenAI/Gemini não estão habilitados. Mudanças no primeiro contato C01 também precisam de aprovação do modelo correspondente na Meta antes de qualquer disparo.</p>
    {error?<p className="notice error" role="alert">{error}</p>:null}
    {notice?<p className="notice" role="status">{notice}</p>:null}
    <div className="tabs" role="tablist" aria-label="Grupo de tratativas">
      <button type="button" className={channel==="client"?"active":""} onClick={()=>{setChannel("client");setEditing(null);}} role="tab" aria-selected={channel==="client"}>Tratativas com clientes ({data?.client.length||15})</button>
      <button type="button" className={channel==="driver"?"active":""} onClick={()=>{setChannel("driver");setEditing(null);}} role="tab" aria-selected={channel==="driver"}>Tratativas com motoristas ({data?.driver.length||14})</button>
    </div>
    <div className="agent-instruction-grid">
      {entries.map(entry=>{
        const open = expanded.includes(entry.code);
        const edit = editing===entry.code && draft;
        return <article key={entry.code} className="card agent-instruction-card">
          <div className="agent-instruction-top">
            <div>
              <small className="eyebrow">{entry.code}</small>
              <h3>{entry.title}</h3>
              <p className="muted">{entry.goal}</p>
            </div>
            <div className="actions">
              <button type="button" disabled={busy} onClick={()=>setExpanded(v=>open?v.filter(x=>x!==entry.code):[...v,entry.code])}>
                {open?<ChevronUp size={15}/>:<ChevronDown size={15}/>} {open?"Ver menos":"Ver mais"}
              </button>
              <button type="button" disabled={busy} onClick={()=>begin(entry)}><Pencil size={15}/> Editar</button>
            </div>
          </div>
          {open&&<div className="agent-instruction-details">
            {edit ? <div className="stack">
              <label>Título <input value={draft.title} maxLength={140} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
              <label>Orientação <textarea rows={3} maxLength={800} value={draft.goal} onChange={e=>setDraft({...draft,goal:e.target.value})}/></label>
              <label>Texto de resposta <textarea rows={8} maxLength={6000} value={draft.example} onChange={e=>setDraft({...draft,example:e.target.value})}/></label>
              <p className="muted">Campos entre colchetes devem permanecer inalterados. As respostas C01 dependem de template Meta aprovado.</p>
              <div className="actions">
                <button type="button" className="primary" disabled={busy} onClick={()=>void save(draft)}><Save size={15}/> Salvar instrução</button>
                <button type="button" disabled={busy} onClick={()=>{setEditing(null);setDraft(null);}}><X size={15}/> Cancelar</button>
              </div>
            </div>:<div className="agent-instruction-text">{entry.example}</div>}
          </div>}
        </article>;
      })}
      {!data&& !error?<p className="muted">Carregando instruções...</p>:null}
    </div>
    <section className="card" style={{marginTop:20}}>
      <div className="agent-instruction-top">
        <div><p className="eyebrow">MODELO DE INSTRUÇÕES</p><h3>Restrições de atendimento</h3>
          <p className="muted">Orienta o comportamento do agente. As proteções de segurança continuam obrigatórias mesmo com estas instruções alteradas.</p></div>
        <div className="actions">
          <button type="button" onClick={()=>setInstructionGroup(v=>!v)}>{instructionGroup?<ChevronUp size={15}/>:<ChevronDown size={15}/>} {instructionGroup?"Ver menos":"Ver mais"}</button>
          <button type="button" disabled={busy} onClick={()=>{setEditing("restrictions");setPoliciesDraft((data?.policies||[...AGENT_GUARDRAILS]).join("\n"));setInstructionGroup(true);}}><Pencil size={15}/> Editar</button>
        </div>
      </div>
      {instructionGroup&&(editing==="restrictions" ?
        <div className="stack">
          <label>Uma restrição por linha
            <textarea rows={13} value={policiesDraft} onChange={e=>setPoliciesDraft(e.target.value)}/>
          </label>
          <div className="actions"><button type="button" className="primary" disabled={busy} onClick={()=>void savePolicies()}><Save size={15}/> Salvar restrições</button><button type="button" onClick={()=>setEditing(null)}>Cancelar</button></div>
        </div>:
        <ol className="agent-guardrail-list">{(data?.policies||AGENT_GUARDRAILS).map((text,index)=><li key={index}>{text}</li>)}</ol>)}
    </section>
  </section>;
}
