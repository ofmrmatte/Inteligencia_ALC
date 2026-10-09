"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Save, X } from "lucide-react";
import { api, useData } from "./data";
import { AGENT_GUARDRAILS } from "../lib/agent-playbook";
import type { AgentAiConfig } from "../lib/agent-instructions";
import { AGENT_DISPLAY_NAME } from "../lib/agent-brand";

type Channel = "client" | "driver";
type Entry = {channel:Channel;code:string;title:string;goal:string;example:string};
type Snapshot = {revision:number;client:Entry[];driver:Entry[];policies:string[]};
export function AgentPanel(){
  const {data,error,refresh} = useData<Snapshot>("agent-instructions");
  const {data:ai,error:aiError,refresh:refreshAi} = useData<{config:AgentAiConfig;used:number;remaining:number;credentialEnv:string}>("ai-config");
  const [aiDraft,setAiDraft] = useState<AgentAiConfig|null>(null);
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
  async function saveAi() {
    if(!aiDraft)return;
    setBusy(true);setNotice("");
    try{
      await api("ai-config",aiDraft);
      await refreshAi();setAiDraft(null);
      setNotice("Configuração de IA salva.");
    }catch(err){setNotice(err instanceof Error?err.message:"Erro ao salvar configuração de IA.");}
    finally{setBusy(false);}
  }
  return <section className="settings-section">
    <p className="eyebrow">MODELO DE INSTRUÇÕES</p>
    <h2>Instruções da {AGENT_DISPLAY_NAME}</h2>
    <p className="muted">Edite as respostas e regras operacionais sem alterar o código. Cada alteração fica registrada na auditoria. As regras de segurança, permissões, elegibilidade e encerramento da PNR são fixas.</p>
    <p className="notice" style={{overflowWrap:"anywhere"}}>Motor atual: <strong>{!ai?"Configuração não verificada":ai.config.enabled?`${ai.config.provider === "openai"?"OpenAI":"Gemini"} · ${ai.config.model}`:"Regras determinísticas"}.</strong></p>
    {aiError?<p className="notice error" role="alert">{aiError}</p>:null}
    {ai&&<div className="stack" style={{marginBottom:20}}>
      <div className="agent-instruction-top">
        <div><h3>Inteligência artificial</h3><p className="muted">Chamadas hoje (UTC): {ai.used} / {ai.config.dailyCallLimit} · Disponíveis: {ai.remaining}</p></div>
        <button type="button" disabled={busy} onClick={()=>{setAiDraft({...ai.config});setNotice("");}}><Pencil size={15}/> Configurar IA</button>
      </div>
      {aiDraft&&<form className="stack" onSubmit={event=>{event.preventDefault();void saveAi();}}>
        <label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" style={{width:16,height:16}} checked={aiDraft.enabled} onChange={e=>setAiDraft({...aiDraft,enabled:e.target.checked})}/> IA habilitada</label>
        <label>Provedor<select value={aiDraft.provider} onChange={e=>setAiDraft({...aiDraft,provider:e.target.value as AgentAiConfig["provider"]})}><option value="openai">OpenAI</option><option value="gemini">Gemini</option></select></label>
        <label>Modelo<input value={aiDraft.model} required={aiDraft.enabled} maxLength={120} onChange={e=>setAiDraft({...aiDraft,model:e.target.value})}/></label>
        <label>Limite diário de chamadas<input type="number" min={1} max={1000} step={1} required value={aiDraft.dailyCallLimit} onChange={e=>setAiDraft({...aiDraft,dailyCallLimit:Number(e.target.value)})}/></label>
        <label>Timeout (segundos)<input type="number" min={0.1} max={8} step={0.1} required value={aiDraft.timeoutMs/1000} onChange={e=>setAiDraft({...aiDraft,timeoutMs:Math.round(Number(e.target.value)*1000)})}/></label>
        <div className="actions"><button type="submit" className="primary" disabled={busy}><Save size={15}/> Salvar configuração</button><button type="button" disabled={busy} onClick={()=>setAiDraft(null)}><X size={15}/> Cancelar</button></div>
      </form>}
    </div>}
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
