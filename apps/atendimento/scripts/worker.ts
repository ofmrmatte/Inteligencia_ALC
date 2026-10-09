import { db, audit } from "../lib/db";
import { syncCore } from "../lib/source";
import { processEvents, processOutbox } from "../lib/worker";
import { archiveIncomingMedia } from "../lib/media-service";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
let lastSync = 0;
let archiving: Promise<void> | null = null;
async function tick() {
  const client = await db().connect();
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtext('alc_atendimento_worker')) AS locked",
    );
    if (!lock.rows[0].locked) return;
    try {
      if (Date.now() - lastSync >= 30 * 60 * 1000) {
        try {
          await syncCore();
          lastSync = Date.now();
        } catch {
          lastSync = Date.now();
          await audit(null, "source_sync_failed", "core", {
            reason: "Fonte indisponível; nova consulta em 30 minutos.",
          });
        }
      }
      await processEvents();
      await processOutbox();
      // Private object storage/scanning must not stall text replies or start overlapping local scans.
      if (!archiving)
        archiving = archiveIncomingMedia()
          .catch(() => {
            console.error(
              "Atendimento: arquivamento de anexos temporariamente indisponível.",
            );
          })
          .finally(() => {
            archiving = null;
          });
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('alc_atendimento_worker'))",
      );
    }
  } finally {
    client.release();
  }
}
while (!stopping) {
  try {
    await tick();
  } catch {
    console.error("Atendimento: processamento temporariamente indisponível.");
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
await archiving;
await db().end();
