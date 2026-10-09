import { currentProfile, HttpError } from "@/lib/auth";
import type { AuthProfile } from "@alc/identity/auth";
import { authorizedEventVersion } from "@/lib/operational-monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const POLL_MS = 5_000;
const MAX_AGE_MS = 5 * 60_000;

export async function GET(request: Request) {
  let profile: AuthProfile;
  try {
    profile = await currentProfile();
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Acesso negado." },
      { status: error instanceof HttpError ? error.status : 503 },
    );
  }
  const encoder = new TextEncoder(), started = Date.now();
  let closed = false, timer: ReturnType<typeof setInterval> | null = null;
  const close = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    request.signal.removeEventListener("abort", onAbort);
    try { controller.close(); } catch { /* Stream already closed by the client. */ }
  };
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const onAbort = () => { if (controllerRef) close(controllerRef); };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      const send = (value: string) => {
        if (!closed) controller.enqueue(encoder.encode(value));
      };
      send("retry: 1000\n: connected\n\n");
      let lastVersion = "";
      let checking = false;
      timer = setInterval(async () => {
        if (closed || checking) return;
        if (Date.now() - started >= MAX_AGE_MS) {
          send("event: close\ndata: reconnect\n\n");
          close(controller);
          return;
        }
        checking = true;
        try {
          profile = await currentProfile();
          const version = await authorizedEventVersion(profile);
          if (version !== lastVersion) {
            lastVersion = version;
            send(`event: invalidate\ndata: ${JSON.stringify({ version })}\n\n`);
          } else send(": keepalive\n\n");
        } catch {
          send("event: close\ndata: unauthorized\n\n");
          close(controller);
        } finally { checking = false; }
      }, POLL_MS);
      request.signal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
      if (timer) clearInterval(timer);
      closed = true;
      request.signal.removeEventListener("abort", onAbort);
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
