/**
 * Isolationsprobe: Der Gate und seine Bibliothek dürfen die Produktions-DB
 * niemals berühren.
 *
 * Hintergrund: `scripts/_env.ts` lädt `.env.local`, dessen DATABASE_URL auf die
 * LIVE-Neon-Datenbank zeigt. Ein versehentlicher Import würde reichen. Statt
 * sich darauf zu verlassen, dass niemand ihn hinzufügt, ist es hier zugesichert.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { EVAL_DIR } from "./hilfen";

const WURZEL = join(EVAL_DIR, "..");
/**
 * Nur import-förmige Muster — ein bloßes Vorkommen des Wortes darf nicht
 * anschlagen, sonst meldet diese Datei sich selbst (sie nennt die Namen ja).
 */
const VERBOTEN: [string, RegExp][] = [
  ["lib/db", /\bfrom\s+["'][^"']*lib\/db["']/],
  ["drizzle", /\bfrom\s+["'][^"']*drizzle[^"']*["']/],
  ["_env", /\bimport\s+["'][^"']*_env["']/],
];

/**
 * Kommentare entfernen, bevor nach Imports gesucht wird.
 * Sonst schlägt der Scanner beim Gate an, der in seinem Kopfkommentar
 * ausdrücklich festhält, dass er `_env` NICHT importiert.
 */
function ohneKommentare(quelltext: string): string {
  return quelltext.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, " ");
}

function tsDateien(ordner: string): string[] {
  const treffer: string[] = [];
  for (const name of readdirSync(ordner)) {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) {
      if (name === "fixtures" || name === "node_modules") continue;
      treffer.push(...tsDateien(pfad));
    } else if (name.endsWith(".ts")) {
      treffer.push(pfad);
    }
  }
  return treffer;
}

describe("Isolation gegen die Produktions-DB", () => {
  const dateien = [...tsDateien(join(WURZEL, "lib", "akquise")), ...tsDateien(EVAL_DIR), join(WURZEL, "scripts", "akquise-gate.ts")];

  for (const datei of dateien) {
    it(`${datei.replace(WURZEL + "/", "")} importiert weder DB noch _env`, () => {
      const inhalt = ohneKommentare(readFileSync(datei, "utf8"));
      for (const [name, muster] of VERBOTEN) {
        assert.ok(
          !muster.test(inhalt),
          `Verbotener Import von „${name}" — der Gate darf nie in die Nähe der Produktionsdatenbank kommen.`,
        );
      }
    });
  }

  it("der Gate hat einen harten DATABASE_URL-Guard", () => {
    const gate = readFileSync(join(WURZEL, "scripts", "akquise-gate.ts"), "utf8");
    assert.match(gate, /process\.env\.DATABASE_URL/);
    assert.match(gate, /process\.exit\(1\)/);
  });
});
