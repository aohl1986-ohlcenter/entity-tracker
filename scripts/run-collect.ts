import "./_env";
import { runDailyCollectionForEntity } from "../lib/jobs";

const slug = process.env.DEFAULT_ENTITY_SLUG ?? "jens-langkammer";
runDailyCollectionForEntity(slug)
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
