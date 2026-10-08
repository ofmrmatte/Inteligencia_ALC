import { currentProfile, HttpError } from "@/lib/auth";
import { authorizedFolder } from "@/lib/evidence-store";
import { db } from "@/lib/db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{caseId:string;part:string}>}){
 try{
  const profile=await currentProfile();
  const {caseId,part}=await params;
  await authorizedFolder(profile,caseId);
  if(!/^[1-9]\d{0,1}$/.test(part)||Number(part)>80)
   throw new HttpError(400,"Número do print inválido.");
  const result=await db().query(
   "SELECT image_png FROM alc_atendimento.evidence_images WHERE case_id=$1 AND page_number=$2",
   [caseId,Number(part)],
  );
  const bytes=result.rows[0]?.image_png as Buffer|undefined;
  if(!bytes)throw new HttpError(404,"Print não encontrado.");
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
