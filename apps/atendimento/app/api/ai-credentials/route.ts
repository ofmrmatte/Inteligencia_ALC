import { createAiCredentialChallenge, verifyAiCredential, executeAiCredential } from "@/lib/ai-credentials";
import { credentialFactors, credentialRequest } from "@/lib/credential-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return credentialFactors(); }
export async function POST(request: Request) {
  return credentialRequest(request, { challenge: createAiCredentialChallenge, verify: verifyAiCredential, execute: executeAiCredential });
}
