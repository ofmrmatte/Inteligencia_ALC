// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const data=vi.hoisted(()=>({api:vi.fn(),refresh:vi.fn()}));
vi.mock("../components/data",()=>({api:data.api,when:()=>"Synthetic date",useData:()=>({error:null,refresh:data.refresh,
  data:{folders:["case-a","case-b"].map(case_id=>({case_id,conversation_id:"synthetic",phone:"5500000000000",print_count:1,message_count:3,created_at:"2026-10-08",source_hash:"0".repeat(64)})),pending:[],folderLimit:200,pendingLimit:100}})}));
import {EvidenceList} from "../components/evidence-list";
let root:Root,container:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);data.api.mockReset();container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it("ignores a stale folder response and exposes only the active PNR's print and originals",async()=>{
  let first!:(value:unknown)=>void,second!:(value:unknown)=>void;
  data.api.mockReturnValueOnce(new Promise(resolve=>{first=resolve;})).mockReturnValueOnce(new Promise(resolve=>{second=resolve;}));
  await act(async()=>root.render(<EvidenceList/>));
  const buttons=container.querySelectorAll<HTMLButtonElement>(".evidence-folder-open");
  await act(async()=>buttons[0].click());
  await act(async()=>buttons[1].click());
  await act(async()=>second({folder:{case_id:"case-b"},prints:[{page_number:1,filename:"active.png",sha256:"0".repeat(64),size:1}],attachments:[{id:"synthetic-media",filename:"original.png",mime:"image/png",size:1,sha256:"0".repeat(64)}]}));
  await act(async()=>first({folder:{case_id:"case-a"},prints:[{page_number:1,filename:"stale.png"}]}));
  expect(container.textContent).toContain("active.png");
  expect(container.textContent).not.toContain("stale.png");
  expect(container.querySelector(".evidence-print img")?.getAttribute("src")).toBe("/api/evidence/folders/case-b/parts/1");
  expect(container.querySelector(".evidence-attachments a")?.getAttribute("href")).toBe("/api/media/synthetic-media");
  expect(container.querySelector<HTMLButtonElement>("button.primary")?.disabled).toBe(true);
});
