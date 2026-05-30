import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

for (const file of [".env.local", ".env"]) {
  for (const base of [process.cwd(), projectRoot]) {
    const path = resolve(base, file);
    if (existsSync(path)) {
      config({ path, override: false });
      break;
    }
  }
}
