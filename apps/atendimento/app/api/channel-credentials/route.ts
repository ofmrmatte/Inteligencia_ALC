import { createChannelCredentialChallenge, verifyChannelCredential, executeChannelCredential } from "@/lib/channel-credentials";
import { credentialFactors, credentialRequest } from "@/lib/credential-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return credentialFactors(); }
export async function POST(request: Request) {
  return credentialRequest(request, { challenge: createChannelCredentialChallenge, verify: verifyChannelCredential, execute: executeChannelCredential });
}
