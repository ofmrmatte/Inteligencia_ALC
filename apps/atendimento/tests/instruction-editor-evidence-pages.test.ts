import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AGENT_GUARDRAILS, CUSTOMER_STEPS } from "../lib/agent-playbook";
import { effectiveInstructions, stepsFor, editableInstructionSchema, validateEditedScript } from "../lib/agent-instructions";
import { paginateEvidence, splitEvidenceMessage, validateEvidence, type EvidenceMessage } from "../lib/evidence";
import { packZip } from "../lib/zip";

describe("editable instruction model",()=>{
  it("keeps complete scripts grouped and applies persisted editing without changing defaults",()=>{
    const existing=CUSTOMER_STEPS.find(s=>s.code==="C04")!;
    const revised={channel:"client" as const,code:"C04",title:existing.title,
      goal:existing.goal,example:existing.example+"\nObrigado pelo seu tempo."};
    expect(validateEditedScript(editableInstructionSchema.parse(revised))).toEqual(revised);
    const snapshot=effectiveInstructions({revision:1,scripts:{"client:C04":revised},policies:["A instrução é editável."]});
    expect(stepsFor("client",snapshot).find(x=>x.code==="C04")?.example).toContain("Obrigado pelo seu tempo.");
    expect(CUSTOMER_STEPS.find(x=>x.code==="C04")?.example).not.toContain("Obrigado pelo seu tempo.");
    expect(snapshot.policies).toHaveLength(1);
    expect(effectiveInstructions(null).policies).toHaveLength(AGENT_GUARDRAILS.length);
  });
  it("rejects removing or adding delivery/identity placeholders and unrecognized codes",()=>{
    const original=CUSTOMER_STEPS[0];
    expect(()=>validateEditedScript({
      channel:"client",code:"C01",title:original.title,goal:original.goal,
      example:original.example.replace("[Valor]","sem valor"),
    })).toThrow(/Preserve/);
    expect(()=>validateEditedScript({
      channel:"client",code:"C99",title:"Outro",goal:"Outra orientação",
      example:"Outra instrução válida",
    })).toThrow(/inexistente/);
  });
});

const row=(id:string,body:string):EvidenceMessage=>({
 id,provider_id:"wamid:"+id,direction:id==="2"?"in":"out",
 body,type:"text",status:id==="2"?"received":"delivered",
 created_at:"2026-10-08T12:00:00Z",
});
describe("WhatsApp-style proof split into safe prints",()=>{
  it("splits long transcript into multiple bounded pages without removing message text",async()=>{
    const messages=[row("1","Abertura ".repeat(100)),row("2","Sim. \n".repeat(20)),row("3","Encerramento ".repeat(100))];
    const pages=await paginateEvidence(messages,400);
    expect(pages.length).toBeGreaterThan(2);
    const all=pages.flatMap(p=>p.segments);
    for(const m of messages)expect(all.filter(s=>s.message.id===m.id).map(s=>s.text).join("")).toEqual(m.body);
    expect(all.every(s=>s.lines<=10)).toBe(true);
    expect(validateEvidence({status:"resolved",phone:"5511999990000"},messages)).toBeNull();
  });
  it("rejects incomplete or uncertain evidence and very long histories",async()=>{
    expect(validateEvidence({status:"bot",phone:"5511999990000"},[row("1","a"),row("2","b"),row("3","c")])).toMatch(/Resolva/);
    expect(validateEvidence({status:"resolved",phone:"5511999990000"},Array.from({length:501},(_,i)=>row(String(i),"texto")),true)).toMatch(/integral/);
    expect((await splitEvidenceMessage(row("1","linha sem cortes")))[0].text).toBe("linha sem cortes");
  });
  it("packs a per-case folder with screenshot parts and manifest in a valid ZIP",()=>{
    const zip=packZip([
      {path:"123456/print-01.png",data:Buffer.from("A")},
      {path:"123456/print-02.png",data:Buffer.from("B")},
      {path:"123456/manifesto.json",data:Buffer.from("{}")},
    ]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.subarray(zip.length-22).readUInt32LE(0)).toBe(0x06054b50);
    expect(zip.subarray(zip.length-22).readUInt16LE(10)).toBe(3);
    expect(zip.toString("utf8")).toContain("123456/print-01.png");
    expect(zip.toString("utf8")).toContain("123456/print-02.png");
    expect(zip.toString("utf8")).toContain("123456/manifesto.json");
    expect(()=>packZip([{path:"../unsafe.png",data:Buffer.from("bad")}])).toThrow(/inválido/);
  });
});
