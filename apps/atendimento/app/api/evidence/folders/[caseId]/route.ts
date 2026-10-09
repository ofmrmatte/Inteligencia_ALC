import { currentProfile, HttpError } from "@/lib/auth";
import { authorizedFolder } from "@/lib/evidence-store";
import { db, audit } from "@/lib/db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{caseId:string}>}){
 try {
  const profile=await currentProfile();
  const folder=await authorizedFolder(profile,(await params).caseId);
  const result=await db().query(
   "SELECT page_number,filename,sha256,octet_length(image_png)::integer AS size FROM alc_atendimento.evidence_images WHERE case_id=$1 ORDER BY page_number",
   [folder.case_id],
  );
  if(result.rows.length!==folder.print_count)
   throw new HttpError(409,"Arquivos da pasta incompletos. A exportação está temporariamente indisponível.");
  const attachments=await db().query(`SELECT a.id,a.filename,a.mime,a.size,e.sha256 FROM alc_atendimento.evidence_media e
   JOIN alc_atendimento.media a ON a.id=e.media_id WHERE e.case_id=$1 ORDER BY a.created_at,a.id`,[folder.case_id]);
  await authorizedFolder(profile,folder.case_id);
  await audit(profile.id,"evidence_folder_viewed",folder.case_id,{prints:result.rows.length});
  return Response.json({folder:{
   case_id:folder.case_id,phone:folder.phone,created_at:folder.created_at,
   message_count:folder.message_count,print_count:folder.print_count,source_hash:folder.source_hash,
  },prints:result.rows,attachments:attachments.rows},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  const status=e instanceof HttpError?e.status:500;
  return Response.json({error:status===500?"Não foi possível abrir a pasta.":(e as Error).message},
   {status,headers:{"Cache-Control":"private, no-store"}});
 }
}
