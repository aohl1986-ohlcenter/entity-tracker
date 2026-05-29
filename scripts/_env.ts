import { config } from "dotenv";
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) config({ path: file, override: false });
}
