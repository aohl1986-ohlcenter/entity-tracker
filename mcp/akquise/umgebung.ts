/**
 * Umgebung des Akquise-MCP-Servers — der Riegel vor der Produktionsdatenbank.
 *
 * Das Problem: Sweep und Leads brauchen API-Keys, die in `.env.local` liegen —
 * derselben Datei wie die LIVE-Neon-DATABASE_URL. `scripts/_env.ts` lädt alles
 * daraus nach `process.env`. Für ein kurzlebiges CLI-Skript ist das vertretbar,
 * für einen langlaufenden Serverprozess, der fremde Anfragen ausführt, nicht.
 *
 * Deshalb wird hier NICHT `_env` importiert und NICHT `dotenv.config` benutzt
 * (das setzt alles). Stattdessen: selbst parsen, nur die Allowlist übernehmen,
 * DATABASE_URL aktiv entfernen und danach prüfen, dass sie wirklich weg ist.
 *
 * eval/isolation.test.ts sichert zu, dass diese Datei den Guard behält.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Nur diese Variablen dürfen aus einer .env-Datei in den Serverprozess. */
export const ERLAUBTE_KEYS = [
  "BEDROCK_API_KEY",
  "BEDROCK_MODEL",
  "BEDROCK_REGION",
  "SERPER_API_KEY",
] as const;

/** Variablen, die im Serverprozess nichts verloren haben. */
const VERBOTENE_KEYS = ["DATABASE_URL", "POSTGRES_URL", "NEON_DATABASE_URL"];

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, "..", "..");

/** Minimaler .env-Parser: KEY=WERT, Kommentare und Anführungszeichen. */
function parseEnv(inhalt: string): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const zeile of inhalt.split("\n")) {
    const t = zeile.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim().replace(/^export\s+/, "");
    let wert = t.slice(i + 1).trim();
    if (
      (wert.startsWith('"') && wert.endsWith('"')) ||
      (wert.startsWith("'") && wert.endsWith("'"))
    ) {
      wert = wert.slice(1, -1);
    }
    werte[key] = wert;
  }
  return werte;
}

export type UmgebungsBericht = {
  /** Key-Name → vorhanden. Niemals der Wert. */
  keys: Record<string, boolean>;
  /** Verbotene Variablen, die aus der ererbten Umgebung entfernt wurden. */
  entfernt: string[];
  quelle: string | null;
};

/**
 * Räumt die Prozessumgebung auf und lädt die erlaubten Keys nach.
 * Muss vor allem anderen laufen. Wirft, wenn der Riegel nicht hält.
 */
export function bereiteUmgebungVor(): UmgebungsBericht {
  // 1) Was der Client durchgereicht hat, fliegt raus — bevor irgendein Modul
  //    es lesen könnte.
  const entfernt: string[] = [];
  for (const key of VERBOTENE_KEYS) {
    if (process.env[key]) {
      delete process.env[key];
      entfernt.push(key);
    }
  }

  // 2) Nur die Allowlist aus der .env-Datei übernehmen.
  let quelle: string | null = null;
  for (const basis of [process.cwd(), WURZEL]) {
    for (const name of [".env.local", ".env"]) {
      const pfad = join(basis, name);
      if (!existsSync(pfad)) continue;
      const werte = parseEnv(readFileSync(pfad, "utf8"));
      for (const key of ERLAUBTE_KEYS) {
        // Bereits gesetzte Werte gewinnen (wie dotenv mit override:false).
        if (!process.env[key] && werte[key]) process.env[key] = werte[key];
      }
      quelle ??= pfad;
    }
  }

  // 3) Der Riegel: nichts darf die DB-URL wieder hereingebracht haben.
  for (const key of VERBOTENE_KEYS) {
    if (process.env[key]) {
      throw new Error(
        `${key} ist im Akquise-Server gesetzt — der Server darf die Produktionsdatenbank nie berühren. Start abgebrochen.`,
      );
    }
  }

  const keys: Record<string, boolean> = {};
  for (const key of ERLAUBTE_KEYS) keys[key] = Boolean(process.env[key]);

  return { keys, entfernt, quelle };
}

/**
 * Läuft beim Import dieses Moduls — nicht erst, wenn der Server es aufruft.
 *
 * ESM wertet importierte Module in Reihenfolge der Imports aus. Steht dieser
 * Import in server.ts an erster Stelle, ist die Umgebung bereinigt, bevor der
 * Rumpf irgendeines anderen Moduls überhaupt läuft.
 */
export const UMGEBUNG: UmgebungsBericht = bereiteUmgebungVor();

/**
 * Erneute Prüfung zur Laufzeit, vor jedem Tool-Aufruf.
 * Ein Serverprozess lebt lange; der Startcheck allein sagt nichts über die
 * Umgebung eine Stunde später aus.
 */
export function pruefeUmgebung(): void {
  for (const key of VERBOTENE_KEYS) {
    if (process.env[key]) {
      delete process.env[key];
      throw new Error(
        `${key} war zur Laufzeit gesetzt und wurde entfernt — der Aufruf wird sicherheitshalber abgebrochen.`,
      );
    }
  }
}
