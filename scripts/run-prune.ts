import "./_env";
import { pruneOldSnapshotRaw, DEFAULT_RETENTION_DAYS } from "../lib/prune";

// Optionales Argument: Retention in Tagen (Default 90).
const days = Number(process.argv[2] ?? DEFAULT_RETENTION_DAYS);

pruneOldSnapshotRaw(days)
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
