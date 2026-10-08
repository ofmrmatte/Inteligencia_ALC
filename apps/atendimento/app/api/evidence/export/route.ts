import { z } from "zod";
import { currentProfile, HttpError } from "@/lib/auth";
import { authorizedFolder } from "@/lib/evidence-store";
import { db, audit } from "@/lib/db";
import { packZip, type ZipEntry } from "@/lib/zip";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const schema=z.object({
 caseIds:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).min(1).max(10).refine(
  ids=>new Set(ids).size===ids.length,"Não repita a mesma pasta.",
 ),
}).strict();
export async function POST(request:Request){
 try{
  const profile=await currentProfile();
  const body=await request.text();
  if(body.length>3000)throw new HttpError(413,"Seleção excessiva.");
  const {caseIds}=schema.parse(JSON.parse(body));
  const entries:ZipEntry[]=[];
  let bytesCount=0;
  for(const id of caseIds){
   const folder=await authorizedFolder(profile,id);
   const images=await db().query(
    "SELECT page_number,filename,sha256,image_png FROM alc_atendimento.evidence_images WHERE case_id=$1 ORDER BY page_number",
    [id],
   );
   if(images.rows.length!==folder.print_count)
    throw new HttpError(409,`Arquivos incompletos na pasta ${id}.`);
   for(const image of images.rows){
    const bytes=image.image_png as Buffer;
    bytesCount+=bytes.byteLength;
    if(bytesCount>30*1024*1024 || entries.length>90)
     throw new HttpError(422,"Selecione menos pastas: limite de 30 MB ou 90 imagens por pacote.");
    entries.push({path:`${id}/${image.filename}`,data:bytes});
   }
   entries.push({path:`${id}/manifesto.json`,data:Buffer.from(JSON.stringify(folder.manifest,null,2),"utf8")});
  }
  if(entries.length>100)throw new HttpError(422,"Muitas imagens para um único ZIP.");
  const zip=packZip(entries);
  await audit(profile.id,"evidence_folders_exported",caseIds.join(","),{
   caseIds,folders:caseIds.length,files:entries.length,bytes:zip.byteLength,
  });
  return new Response(new Uint8Array(zip),{headers:{
   "Content-Type":"application/zip",
   "Content-Disposition":`attachment; filename="comprovantes-${caseIds.length}-pastas.zip"`,
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
 }catch(e){
  const status=e instanceof HttpError?e.status:e instanceof z.ZodError?400:e instanceof SyntaxError?400:500;
  return Response.json({error:status===500?"Falha ao preparar ZIP.":(e as Error).message},{status,
   headers:{"Cache-Control":"private, no-store"}});
 }
}
