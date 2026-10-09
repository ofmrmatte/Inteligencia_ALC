import { currentProfile, HttpError } from "@/lib/auth";
import { evidencePrint } from "@/lib/evidence-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{caseId:string;part:string}>}){
 try{
  const profile=await currentProfile();
  const {caseId,part}=await params;
  if(!/^[1-9]\d{0,1}$/.test(part)||Number(part)>80)
   throw new HttpError(400,"Número do print inválido.");
  const {bytes}=await evidencePrint(profile,caseId,Number(part));
  return new Response(new Uint8Array(bytes),{
   headers:{"Content-Type":"image/png","Content-Disposition":`inline; filename="print-${part.padStart(2,"0")}.png"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex,noarchive"},
  });
 }catch(e){
  const status=e instanceof HttpError?e.status:500;
  return Response.json({error:status===500?"Erro ao abrir print.":(e as Error).message},
   {status,headers:{"Cache-Control":"private, no-store"}});
 }
}
