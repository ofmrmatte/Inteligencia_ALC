import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceMessage } from "../lib/evidence";

const mocks=vi.hoisted(()=>({
 queries:[] as {sql:string;params:unknown[]}[],
 images:[] as {caseId:string;part:number;filename:string;bytes:Buffer}[],
 folders:new Map<string,string>(),
 changed:false,
 audit:vi.fn(),
 phone:"5511999990000",
 id:"ccddeeff-0000-4000-8000-000000000001",
}));
const messages:EvidenceMessage[]=[
 {id:"1",provider_id:"wamid:1",direction:"out",body:"Recebeu o produto?",status:"delivered",type:"text",created_at:"2026-10-08T10:00:00Z"},
 {id:"2",provider_id:"wamid:2",direction:"in",body:"Sim, recebi.",status:"received",type:"text",created_at:"2026-10-08T10:02:00Z"},
 {id:"3",provider_id:"wamid:3",direction:"out",body:"Obrigado pela confirmação.",status:"sent",type:"text",created_at:"2026-10-08T10:04:00Z"},
];
function query(sql:string,params:unknown[]=[]){
 mocks.queries.push({sql,params});
 if(sql.includes("FROM alc_atendimento.conversations"))return {rows:[{
   id:mocks.id,case_id:"12345",phone:mocks.phone,channel:"client",status:"resolved",base_key:"BASE",sigla:"BA",
 }],rowCount:1};
 if(sql.includes("FROM alc_atendimento.outbox"))return {rows:[],rowCount:0};
 if(sql.includes("FROM alc_atendimento.cases"))return {rows:[{case_id:"12345",base_key:"BASE",sigla:"BA"}],rowCount:1};
 if(sql.includes("FROM alc_atendimento.messages"))return {rows:messages.map(m=>({...m,body:mocks.changed?m.body+" changed":m.body})),rowCount:3};
 if(sql.includes("SELECT e.*"))return {rows:[{case_id:"12345",base_key:"BASE",sigla:"BA"}],rowCount:1};
 if(sql.includes("SELECT source_hash FROM alc_atendimento.evidence_folders")){
   const hash=mocks.folders.get(String(params[0]));
   return {rows:hash?[{source_hash:hash}]:[],rowCount:hash?1:0};
 }
 if(sql.includes("INSERT INTO alc_atendimento.evidence_folders")){
   mocks.folders.set(String(params[0]),String(params[5]));
   return {rows:[],rowCount:1};
 }
 if(sql.includes("INSERT INTO alc_atendimento.evidence_images")){
   mocks.images.push({caseId:String(params[0]),part:Number(params[1]),filename:String(params[2]),bytes:params[4] as Buffer});
   return {rows:[],rowCount:1};
 }
 return {rows:[],rowCount:1};
}
vi.mock("../lib/db",()=>({
 db:()=>({query:vi.fn(async(sql:string,params:unknown[])=>query(sql,params)),
   connect:async()=>({query:vi.fn(async(sql:string,params:unknown[])=>query(sql,params)),release:vi.fn()})}),
 audit: (...args:unknown[])=>mocks.audit(...args),
}));
vi.mock("../lib/auth",()=>({
 scopeFor:vi.fn(async()=>({full:true,pairs:new Set(),safe:new Set()})),
 visible:vi.fn(()=>true),
 HttpError:class HttpError extends Error {constructor(public status:number,message:string){super(message);}},
}));
vi.mock("next/og",()=>({
 ImageResponse:class {
  async arrayBuffer(){return Uint8Array.from([137,80,78,71,13,10,26,10]).buffer;}
 },
}));
import { createEvidenceFolder } from "../lib/evidence-store";
const profile={id:"22222222-0000-4000-8000-000000000001"} as never;

describe("persistent evidence folders",()=>{
 beforeEach(()=>{mocks.changed=false;mocks.queries=[];mocks.images=[];mocks.folders.clear();mocks.audit.mockClear();});
 it("creates a stable folder with real pages and commits transaction",async()=>{
  const result=await createEvidenceFolder(profile,mocks.id);
  expect(result).toEqual({caseId:"12345",created:true});
  expect(mocks.folders.has("12345")).toBe(true);
  expect(mocks.images.length).toBeGreaterThan(0);
  expect(mocks.images.every(row=>row.caseId==="12345"&&row.filename.startsWith("print-"))).toBe(true);
  expect(mocks.queries.map(x=>x.sql)).toContain("COMMIT");
  expect(mocks.audit).toHaveBeenCalledWith(expect.anything(),"evidence_folder_created","12345",expect.anything(),expect.anything());
 });
 it("does not overwrite folder or print when source hash matches",async()=>{
  await createEvidenceFolder(profile,mocks.id);
  const before=mocks.images.length;
  expect(await createEvidenceFolder(profile,mocks.id)).toEqual({caseId:"12345",created:false});
  expect(mocks.images).toHaveLength(before);
 });
 it("rejects tampering if a stored folder source hash is different",async()=>{
  mocks.folders.set("12345","0".repeat(64));
  await expect(createEvidenceFolder(profile,mocks.id)).rejects.toThrow(/histórico diferente/);
  expect(mocks.images).toHaveLength(0);
 });
});
