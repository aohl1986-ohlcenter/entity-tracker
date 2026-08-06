# Entity Authority Tracker

[![CI](https://github.com/aohl1986-ohlcenter/entity-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/aohl1986-ohlcenter/entity-tracker/actions/workflows/ci.yml)
[![CodeQL](https://github.com/aohl1986-ohlcenter/entity-tracker/actions/workflows/codeql.yml/badge.svg)](https://github.com/aohl1986-ohlcenter/entity-tracker/actions/workflows/codeql.yml)

SERP-Domination & AI-Citation-Tracking für Personal-Branding- und Entity-SEO:
Das Tool beobachtet täglich, wie eine Person in den Google-Top-10 rankt **und**
ob KI-Suchsysteme (Gemini mit Search-Grounding, Tavily, Brave) sie zitieren —
inklusive Domination-Score, Zeitreihen-Dashboard und E-Mail-Alerts.

Läuft als Multi-Tenant-SaaS für die Pakete auf
[pragma-code.de/ki-sichtbarkeits-monitoring](https://www.pragma-code.de/ki-sichtbarkeits-monitoring).

## SaaS-Betrieb (Kurzfassung)

| Paket | Preis | Keywords | Features |
|---|---|---|---|
| Radar | 149€/M | 10 | SERP-Tracking, AI-Citations, Dashboard, Alerts/Reports |
| Radar + Insights | 299€/M | 25 | + Verdrängungs-Analyse, Wunschlink-KPI, GEO-Empfehlungen |
| Visibility Suite | 590€/M | 25 | + Hands-on-Services (manuell erbracht) |

- **Kunden anlegen/pflegen:** `/admin` (Login via `ADMIN_PASSWORD`-Env).
  Dort: Paket + Status, Keywords (Plan-Limit wird erzwungen), Ziel-URLs,
  Citation-Prompts, Wunschlinks, GEO-Empfehlungen, Report-E-Mails,
  Zugangs-Passwort (nur scrypt-Hash gespeichert, Einmal-Anzeige).
- **Abrechnung:** manuell per Rechnung — `plan`/`status` sind reine
  Steuerfelder. `paused`/`cancelled` stoppt Tracking + Reports sofort.
- **Feature-Gates & Limits:** zentral in `lib/plans.ts`.
- **API-Auslastung:** `/admin/usage` (gemessen via `api_usage`-Tabelle) —
  vor Kunde Nr. 3 auf bezahlte API-Tarife wechseln (Serper ~0,30$/1k).
- **Kapazität:** täglicher Collect läuft sequentiell über alle aktiven
  Tenants in einem Cron (maxDuration 300 s). Ab ~5+ Kunden mit vollen
  Keyword-Kontingenten den Collect chunken.
- **Deprecated:** `AUTH_ENTITIES`-Env (Passwörter liegen in der DB);
  der Login-Fallback darauf fliegt im nächsten Release.

**Live:** [tracker.pragma-code.de](https://tracker.pragma-code.de) *(Kundenprojekt mit Login — Demo auf Anfrage)*
Erste Entity: **Dana Beispiel** ([Case Study](https://dana-beispiel.example))

Ein Tool von [Pragma Code](https://www.pragma-code.de).

## Stack
- Next.js 15 (App Router) auf Vercel
- Postgres via Vercel Postgres / Neon (Drizzle ORM)
- Serper.dev für Google-SERPs (echtes Google DE)
- Gemini 2.5 Flash mit `google_search`-Grounding für AI-Citations
- Tavily Search API als zweite Citation-Engine (optional, 1000 Calls/Monat free)
- Brave Search API als dritte Citation-Engine (optional, $5 Free-Credits/Monat ≈ 1k Calls)
- Vercel Cron (täglich)

## Lokal starten

```bash
# 1) Node-Version (nvm)
nvm use

# 2) Dependencies
npm install

# 3) .env.local befüllen
#    - DATABASE_URL (Neon free tier, mit ?sslmode=require)
#    - SERPER_API_KEY, GEMINI_API_KEY, CRON_SECRET setzen
cp .env.example .env.local   # falls noch nicht vorhanden
$EDITOR .env.local

# 4) Schema in die DB pushen
npm run db:push

# 5) Beispiel-Seed (Keywords + Target-URLs)
npm run db:seed

# 6) Smoke-Test: Serper + Gemini live
npx tsx scripts/smoke.ts

# 7) Erstes SERP-Fetch + AI-Citation-Check
npm run fetch:serps
npm run fetch:citations

# 8) Dashboard
npm run dev   # http://localhost:3000
```

## Deploy auf Vercel

```bash
cd ~/dev/entity-tracker

# 1) Einmal einloggen (Browser-Flow)
vercel login

# 2) Projekt anlegen / verbinden
vercel link --yes --project entity-tracker

# 3) Env-Vars aus .env.local nach Vercel pushen
bash scripts/vercel-env-push.sh

# 4) Production-Deploy
vercel deploy --prod
```

Die `vercel.json` registriert zwei Cronjobs (Vercel Hobby reicht):
- **täglich 06:00 UTC** `/api/cron/collect` — SERP-Fetch + AI-Citation-Check
  (alle 3 Engines) + Alert-Erkennung. Persistiert Alerts mit `emailSent=0`,
  **versendet KEINE Mail**.
- **alle 5 Tage 07:00 UTC** `/api/cron/send-digest` — bündelt alle noch nicht
  gemailten Alerts (`emailSent=0`) in **einen** Report und mailt ihn.

So wird täglich gesammelt (saubere Zeitreihe für Rank-Vergleiche & Score-Avg),
aber nur alle 5 Tage eine Mail verschickt. `*/5` im Day-of-Month-Feld trifft
Tag 1,6,11,16,21,26,31 — am Monatsende einmal ein kürzerer Abstand.

Manueller Sofort-Report (sammeln **und** sofort mailen): `/api/cron/daily-digest`
bzw. `npx tsx scripts/run-daily-digest.ts`. Einzeln: `scripts/run-collect.ts`
(sammeln, keine Mail) und `scripts/run-send-digest.ts` (offene Alerts mailen).

Vercel sendet bei Cron automatisch `Authorization: Bearer $CRON_SECRET`,
unsere Routes validieren das.

## Monitoring & Ops-Alerts

Drei Ebenen, damit Ausfälle/erschöpfte Limits nicht unbemerkt bleiben:

1. **In-Job-Ops-Mail** — der tägliche Collect (`lib/ops.ts → detectOpsIssues`)
   erkennt gehäufte Fehler (≥50 % SERP-Abrufe fehlgeschlagen, eine Citation-Engine
   bei allen Prompts fehlgeschlagen) und ausgeschöpfte Kontingente (Fehlertext
   enthält `credit/quota/limit/429/402/…`) und schickt eine separate **Ops-Mail**
   an `OPS_EMAIL_TO` (Fallback `ALERT_EMAIL_TO`).
2. **Job-Crash** — bricht der Collect komplett ab, sendet die Route eine
   Crash-Mail **und** gibt HTTP 500 zurück, sodass auch Vercels eigene
   Cron-Fehlerbenachrichtigung greift.
3. **Total-Ausfall / Heartbeat** — `GET /api/health` (öffentlich, ohne Auth)
   liefert das Alter des jüngsten Snapshots: **200** wenn frisch, **503** wenn
   älter als 30 h (Cron läuft nicht / DB-Problem). Einen externen Uptime-Monitor
   (UptimeRobot, cron-job.org, Better Stack — alle mit Free-Tier) auf diese URL
   zeigen lassen; er alarmiert bei 503/Timeout. Das ist die Absicherung für den
   Fall, dass die App gar nicht mehr läuft (dann kann sie sich auch nicht selbst
   per Mail melden).

### Subdomain `tracker.pragma-code.de` bei Ionos

1. In Vercel: Project → Settings → Domains → `tracker.pragma-code.de` hinzufügen.
2. Vercel zeigt einen CNAME-Wert (z. B. `cname.vercel-dns.com`).
3. Bei Ionos: DNS → CNAME-Record `tracker` → Vercel-Wert.
4. Nach DNS-Propagation (~Minuten bis ~1h) ist HTTPS-Zertifikat automatisch live.

## Datenmodell

- `entities` — Personen / zu trackende Entities
- `keywords` — Suchanfragen, geclustert (name / name_topic / topic)
- `target_urls` — eigene + Authority + Displacement-URLs mit Glob-Mustern
- `serp_snapshots` + `serp_results` — Zeitreihe Top-10 Google
- `ai_citations` — Gemini-Antworten + zitierte Quellen
- `alerts` — (Platzhalter v2)

## Scoring

**Domination Score (0–100)** pro Keyword: positionsgewichtete Summe für
`owned` + `authority` in den Top 10, abzüglich halbgewichtete Strafe für
`displacement`. Position 1 zählt 10×, Position 10 zählt 1×.

Ziel: 80–90 % im Schnitt über alle Keywords.

## Klassifikation

Jede SERP-URL wird gegen die `target_urls`-Patterns geprüft (Glob `*`):
- **owned** — LinkedIn-Profil und Posts von Beispiel
- **authority** — PwC / Strategy& / WiWo / SSRN / Die Presse / neuhandeln
- **displacement** — Yasni / 11880 / Telefonbuch / Verzeichnisse
- **neutral** — alles andere

## Roadmap

- v1 (jetzt): Tracking + Dashboard + Cron
- v2: Schema.org sameAs-Validator, Snippet-Diff, Email-Alerts (Resend)
- v3: IndexJump-Integration für schnellere Reindexierung nach Schema-Updates
- v4: Multi-Tenant (Pragma-Code-Service-Produkt)

## Citation-Engines

Jeder Prompt aus `data/beispiel.ts` (`AI_CITATION_PROMPTS`) wird gegen alle
Engines ausgeführt, deren API-Key gesetzt ist:

- `gemini` — `GEMINI_API_KEY` (Grounded Search via `google_search`-Tool)
- `tavily` — `TAVILY_API_KEY` (LLM-optimierte Search-API, free 1k/Monat)
- `brave` — `BRAVE_API_KEY` (Brave Web Search, $5 Free-Credits/Monat)

Eine fehlende Engine wird stillschweigend übersprungen. Pro Prompt entsteht
eine DB-Zeile pro Engine — damit lassen sich Gemini vs. Tavily direkt
vergleichen (`/citations` zeigt das `engine`-Feld im Kopf jeder Karte).

## Akquise-Pipeline & Gate

Die Skripte unter `scripts/akquise-*` erzeugen Kaltakquise-Befunde („Ihre Kanzlei
wird bei keiner von sechs typischen Mandantenfragen genannt"). Solche Aussagen
gehen an fremde Unternehmen — steht eine falsch drin, ist das
geschäftsschädigend und potenziell abmahnbar.

**Reihenfolge:**

```bash
npx tsx scripts/akquise-sweep.ts   "<Branche>" "<Region>" "extra|prompts"
npx tsx scripts/akquise-leads.ts   "<Branche>" "<Region>" "extra|suchen" [datum]
npm run akquise:gate --            "<Branche>" "<Region>" [datum] --online
```

**Kein Anschreiben ohne grünen Gate.** Exit-Codes sind die Schnittstelle:

| Code | Bedeutung |
|------|-----------|
| `0` | freigegeben |
| `1` | technischer Fehler (Datei fehlt, Schema kaputt, `DATABASE_URL` gesetzt) |
| `2` | mindestens ein Blocker — nicht anschreiben |
| `3` | nur Warnungen; nach manueller Prüfung mit `--warnungen-akzeptiert` |

### Die Regeln

| ID | Prüft | Netz |
|---|---|---|
| `R0_SCHEMA` | Artefakte strukturell gültig, Datum/Branche konsistent | – |
| `R1_MARKT_UNTERFASSUNG` | Deckung Markt/zitierte Domains ≥ 80 % | – |
| `R2_PROMPT_MARKT_MISMATCH` | Suchbegriffe fragen dieselbe Branche ab wie die Prompts | – |
| `R3_PORTAL_LECKAGE` | keine Verzeichnisse in Kandidaten oder Leads | – |
| `R4_ALIAS_DOMAIN` | Lead ist keine Zweitdomain eines zitierten Betriebs | – |
| `R5_SPERRLISTE` | Lead steht nicht auf der Sperrliste | – |
| `R6_KATEGORIE` | Lead-Titel passt zum Geschäftsmodell (nur Warnung) | – |
| `R7_GROUNDING` | Antworten waren gegroundet, Zitate ⊆ gelieferte Quellen | – |
| `R8_ZAHLEN` | keine NaN/Infinity in Kennzahlen | – |
| `R9_WERBEWIDERSPRUCH` | Impressum verbietet keine Werbemails (**fail-closed**) | ✅ |

`R7` ist der Kern: `askGroundedBedrock` zieht die `citations` per Regex aus dem
**generierten** Antworttext — eine erfundene URL ist dort nicht von einer echten
zu unterscheiden. Seit die Funktion zusätzlich `grounding.links` zurückgibt
(die tatsächlich gelieferten Quellen), ist `citations ⊆ grounding.links` eine
offline prüfbare Invariante. Sie hat beim ersten Live-Lauf sofort eine
halluzinierte URL gefunden.

### Regressionssuite

```bash
npm run akquise:eval     # läuft auch in CI — offline, ohne Keys, ohne DB
```

`eval/golden/faelle.json` enthält die realen Fehler aus den Läufen im
Juli/August 2026 (Prompt/Markt-Mismatch bei den Kieferorthopäden,
Portal-Leckage, Alias-Domain, Sperrlisten-Treffer) samt **Negativ-Zwillingen** —
ohne die wäre eine Regel, die immer feuert, grün. `eval/mutation.test.ts`
mutiert eine synthetische saubere Basis und verlangt, dass **genau** die
zugehörige Regel anschlägt und keine andere.

Neue Fälle kommen als Eintrag in `faelle.json` dazu, nicht als neuer Testcode.

**Isolation:** `lib/akquise/`, `scripts/akquise-gate.ts` und `eval/` importieren
weder `lib/db` noch `scripts/_env` (per Test zugesichert), und der Gate bricht
ab, wenn `DATABASE_URL` gesetzt ist — `_env` würde sonst die Produktions-DB
laden.
