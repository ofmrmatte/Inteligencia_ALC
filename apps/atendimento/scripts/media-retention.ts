import { db } from "../lib/db";
import { purgeExpiredMedia } from "../lib/media-service";
if (process.argv.slice(2).some((value) => !["--apply"].includes(value)))
  throw new Error(
    "Use media:retention para simular ou media:retention -- --apply após aprovação da política.",
  );
try {
  console.log(
    JSON.stringify(await purgeExpiredMedia(process.argv.includes("--apply"))),
  );
} finally {
  await db().end();
}
