import { receivePnrEnrichment } from "@/lib/pnr-enrichment-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return receivePnrEnrichment(request);
}
