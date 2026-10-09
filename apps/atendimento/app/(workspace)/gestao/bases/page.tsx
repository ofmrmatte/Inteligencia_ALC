import { AgentManagement } from "@/components/agent-management";
import { requireAdmin, requireProfile } from "@/lib/auth";
export default async function Page() { requireAdmin(await requireProfile()); return <AgentManagement section="bases" />; }
