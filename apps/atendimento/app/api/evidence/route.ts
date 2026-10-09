import { currentProfile, scopeFor } from "@/lib/auth";
import { inboxScopeSql, conversationScopeSql } from "@/lib/inbox";
import { db } from "@/lib/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
 const profile=await currentProfile();
 const scope=await scopeFor(profile);
 const folderParams:unknown[]=[];
 const folderScope=inboxScopeSql(scope,folderParams,"e");
 const folderConversationScope=await conversationScopeSql(profile,folderParams,"c");
 const folderResult=await db().query(
   `SELECT e.case_id,e.conversation_id,e.phone,e.print_count,e.message_count,e.created_at,
    e.source_hash,e.base_key,e.sigla
    FROM alc_atendimento.evidence_folders e
    LEFT JOIN alc_atendimento.conversations c ON c.id=e.conversation_id
    WHERE ${folderScope} AND ${folderConversationScope}
    ORDER BY e.created_at DESC,e.case_id ASC LIMIT 200`,folderParams,
 );
 const pendingParams:unknown[]=[];
 const pendingScope=await conversationScopeSql(profile,pendingParams,"c");
 const pendingResult=await db().query(
   `SELECT c.id,c.case_id,c.phone,c.updated_at,c.base_key,c.sigla
    FROM alc_atendimento.conversations c
    WHERE ${pendingScope} AND c.channel='client' AND c.status='resolved'
      AND c.case_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM alc_atendimento.evidence_folders f WHERE f.case_id=c.case_id)
    ORDER BY c.updated_at DESC,c.id DESC LIMIT 100`,pendingParams,
 );
 return Response.json({
   folders:folderResult.rows, pending:pendingResult.rows,
   folderLimit:200,pendingLimit:100,
 },{headers:{"Cache-Control":"private, no-store"}});
}
