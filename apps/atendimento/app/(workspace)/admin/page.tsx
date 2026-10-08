import { requireProfile, requireAdmin } from "@/lib/auth";
import { Administration } from "@/components/administration";
export default async function Page() {
  requireAdmin(await requireProfile());
  return <Administration />;
}
