import { z } from "zod";
import { currentProfile, HttpError } from "@/lib/auth";
import { createEvidenceFolder } from "@/lib/evidence-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Creates permanent records; never downloads a ZIP implicitly. */
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}) {
 try{
  const profile=await currentProfile();
  const id=z.string().uuid().parse((await params).id);
  const result=await createEvidenceFolder(profile,id);
  return Response.json(result,{status:result.created?201:200,headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  const status=e instanceof HttpError?e.status:e instanceof z.ZodError?400:500;
  return Response.json({error:status===500?"Falha ao criar pasta de comprovantes.":(e as Error).message},{status,headers:{"Cache-Control":"private, no-store"}});
 }
}
