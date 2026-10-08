"use client";
import { useState } from "react";
import { CheckSquare2, ChevronDown, ChevronRight, Download, Folder, FolderOpen, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { api, useData, when } from "./data";

type Folder = {
 case_id:string;conversation_id:string;phone:string;print_count:number;message_count:number;
 created_at:string;source_hash:string;
};
type Pending = {id:string;case_id:string;phone:string;updated_at:string};
type Index={folders:Folder[];pending:Pending[];folderLimit:number;pendingLimit:number};
type Page={page_number:number;filename:string;sha256:string;size:number};
type Detail={folder:Folder;prints:Page[]};
function triggerDownload(blob:Blob,name:string){
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10_000);
}
export function EvidenceList(){
 const {data,error,refresh}=useData<Index>("evidence");
 const [expanded,setExpanded]=useState<string|null>(null);
 const [detail,setDetail]=useState<Detail|null>(null);
 const [selection,setSelection]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const folders=data?.folders||[];
 async function openFolder(caseId:string){
  if(expanded===caseId){setExpanded(null);setDetail(null);return;}
  setExpanded(caseId);setDetail(null);setNotice("");
  try{
   const response=await api<Detail>(`evidence/folders/${encodeURIComponent(caseId)}`);
   setDetail(response);
  }catch(e){setExpanded(null);setNotice(e instanceof Error?e.message:"Não foi possível abrir a pasta.");}
 }
 async function createFolder(row:Pending){
  setBusy(true);setNotice("");
  try{
   const response=await fetch(`/api/evidence/${encodeURIComponent(row.id)}`,{
    method:"POST",credentials:"same-origin",cache:"no-store",
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"Falha ao gerar comprovantes.");
   await refresh();
   setNotice(`Pasta ${result.caseId} criada com os prints da tratativa.`);
   await openFolder(result.caseId);
  }catch(e){setNotice(e instanceof Error?e.message:"Falha ao criar pasta.");}
  finally{setBusy(false);}
 }
 async function downloadSelected(){
  if(!selection.length)return;
  setBusy(true);setNotice("");
  try{
   const response=await fetch("/api/evidence/export",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({caseIds:selection}),credentials:"same-origin",cache:"no-store",
   });
   if(!response.ok){
    const data=await response.json().catch(()=>null);
    throw new Error(data?.error||"Falha ao baixar as pastas.");
   }
   triggerDownload(await response.blob(),`comprovantes-${selection.length}-pastas.zip`);
   setNotice(`${selection.length} pasta(s) incluída(s) no ZIP selecionado.`);
  }catch(e){setNotice(e instanceof Error?e.message:"Falha ao gerar ZIP.");}
  finally{setBusy(false);}
 }
 function toggle(caseId:string,checked:boolean){
  setSelection(current=>checked?[...new Set([...current,caseId])]:current.filter(x=>x!==caseId));
 }
 return <main className="page evidence-page">
  <div className="page-tools">
   <div>
    <h2>Arquivo de comprovantes</h2>
    <p className="muted">Uma pasta permanente por ID de PNR. Abra para visualizar cada print separadamente.</p>
   </div>
   <span className="badge"><Folder size={14}/> {folders.length} pasta(s)</span>
  </div>
  <p className="notice">Os arquivos ficam salvos no banco do Atendimento e permanecem nesta aba. Cada print utiliza o visual de conversa do WhatsApp Web, mas é identificado como reconstrução do histórico real. O ZIP é opcional, apenas para pastas que você selecionar.</p>
  {error?<p role="alert" className="notice error">{error}</p>:null}
  {notice?<p role="status" className="notice">{notice}</p>:null}
  <section className="card">
   <div className="evidence-section-head">
    <div><h3>Pastas de PNRs</h3><p className="muted">Selecione as pastas desejadas somente se precisar baixar um ZIP.</p></div>
    <div className="actions">
     <button type="button" disabled={!folders.length||busy} onClick={()=>setSelection(selection.length===folders.length?[]:folders.map(f=>f.case_id))}>
      <CheckSquare2 size={15}/> {selection.length===folders.length&&folders.length?"Desmarcar todas":"Selecionar todas"}
     </button>
     <button type="button" className="primary" disabled={!selection.length||busy} onClick={()=>void downloadSelected()}>
      <Download size={16}/> Baixar ZIP ({selection.length})
     </button>
    </div>
   </div>
   <div className="evidence-folders">
    {folders.map(folder=><section className="evidence-folder" key={folder.case_id}>
     <div className="evidence-folder-row">
      <input type="checkbox" aria-label={`Selecionar pasta ${folder.case_id}`} checked={selection.includes(folder.case_id)}
       onChange={e=>toggle(folder.case_id,e.target.checked)}/>
      <button className="evidence-folder-open" type="button" onClick={()=>void openFolder(folder.case_id)}
       aria-expanded={expanded===folder.case_id}>
       {expanded===folder.case_id?<FolderOpen size={23}/>:<Folder size={23}/>}
       <span><strong>{folder.case_id}</strong>
        <small>{folder.print_count} print(s) · {folder.message_count} mensagens · {when(folder.created_at)}</small>
       </span>
       {expanded===folder.case_id?<ChevronDown size={17}/>:<ChevronRight size={17}/>}
      </button>
     </div>
     {expanded===folder.case_id&&<div className="evidence-folder-content">
       {!detail?<p className="muted">Abrindo pasta...</p>:
        <div className="evidence-print-grid">
         {detail.prints.map(print=>{
          const src=`/api/evidence/folders/${encodeURIComponent(folder.case_id)}/parts/${print.page_number}`;
          return <article className="evidence-print" key={print.page_number}>
           <a href={src} target="_blank" rel="noreferrer" aria-label={`Abrir ${print.filename}`}>
            {/* Authorized, authenticated same-origin PNG bytes; not a remote image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Print ${print.page_number} da tratativa ${folder.case_id}`} loading="lazy"/>
           </a>
           <div><ImageIcon size={14}/><strong>{print.filename}</strong>
            <a href={src} download={print.filename}>Baixar PNG</a></div>
          </article>;
         })}
        </div>}
      </div>}
    </section>)}
    {!folders.length?<div className="empty"><Folder size={26}/><h3>Nenhuma pasta arquivada</h3>
     <p>Quando uma tratativa elegível for concluída, use “Criar pasta” abaixo. Ela ficará disponível aqui depois de gerada.</p></div>:null}
   </div>
   {data&&data.folders.length>=data.folderLimit?<p className="notice">Exibindo as 200 pastas mais recentes.</p>:null}
  </section>
  <section className="card" style={{marginTop:18}}>
   <h3>Tratativas prontas para arquivamento</h3>
   <p className="muted">Uma nova pasta só é criada após validar o histórico completo. Conversas com mídia, template não preservado ou entrega não confirmada são bloqueadas, sem fabricar evidências.</p>
   <div className="table-wrap"><table>
    <thead><tr><th>PNR</th><th>Telefone</th><th>Concluído</th><th>Ação</th></tr></thead>
    <tbody>{(data?.pending||[]).map(p=><tr key={p.id}>
     <td><strong>{p.case_id}</strong></td><td>+{p.phone}</td><td>{when(p.updated_at)}</td>
     <td><button type="button" disabled={busy} onClick={()=>void createFolder(p)}><Folder size={15}/> {busy?"Processando…":"Criar pasta"}</button></td>
    </tr>)}</tbody>
   </table></div>
   {data&&!data.pending.length?<p className="muted">Nenhuma tratativa concluída aguardando arquivamento.</p>:null}
   {data&&data.pending.length>=data.pendingLimit?<p className="notice">Lista limitada às 100 tratativas recentes.</p>:null}
  </section>
  <p className="muted" style={{marginTop:14}}><ShieldCheck size={14}/> Acesso restrito por autenticação e escopo operacional; exportações registradas em auditoria.</p>
 </main>;
}
