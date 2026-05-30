# Entity Authority Tracker

SERP-Domination & AI-Citation-Tracking für Personal-Branding-SEO.
Erste Entity: **Jens Langkammer**.

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
#    - SERPER_API_KEY, GEMINI_API_KEY, CRON_SECRET sind schon gesetzt
cp .env.example .env.local   # falls noch nicht vorhanden
$EDITOR .env.local

# 4) Schema in die DB pushen
npm run db:push

# 5) Langkammer-Seed (Keywords + Target-URLs)
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
- 06:00 UTC SERP-Fetch
- 06:30 UTC AI-Citation-Check

Vercel sendet bei Cron automatisch `Authorization: Bearer $CRON_SECRET`,
unsere Routes validieren das.

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
- **owned** — LinkedIn-Profil und Posts von Langkammer
- **authority** — PwC / Strategy& / WiWo / SSRN / Die Presse / neuhandeln
- **displacement** — Yasni / 11880 / Telefonbuch / Verzeichnisse
- **neutral** — alles andere

## Roadmap

- v1 (jetzt): Tracking + Dashboard + Cron
- v2: Schema.org sameAs-Validator, Snippet-Diff, Email-Alerts (Resend)
- v3: IndexJump-Integration für schnellere Reindexierung nach Schema-Updates
- v4: Multi-Tenant (Pragma-Code-Service-Produkt)

## Citation-Engines

Jeder Prompt aus `data/langkammer.ts` (`AI_CITATION_PROMPTS`) wird gegen alle
Engines ausgeführt, deren API-Key gesetzt ist:

- `gemini` — `GEMINI_API_KEY` (Grounded Search via `google_search`-Tool)
- `tavily` — `TAVILY_API_KEY` (LLM-optimierte Search-API, free 1k/Monat)
- `brave` — `BRAVE_API_KEY` (Brave Web Search, $5 Free-Credits/Monat)

Eine fehlende Engine wird stillschweigend übersprungen. Pro Prompt entsteht
eine DB-Zeile pro Engine — damit lassen sich Gemini vs. Tavily direkt
vergleichen (`/citations` zeigt das `engine`-Feld im Kopf jeder Karte).

## Key-Rotation

Alle API-Keys (Serper, Gemini, Tavily) wurden initial im Chat geteilt — bitte
nach erfolgreichem Smoke-Test rotieren:
- Serper: https://serper.dev → Settings → Regenerate
- Gemini: https://aistudio.google.com/apikey → Delete & Create
- Tavily: https://app.tavily.com → API Keys → Rotate
- Brave: https://api.search.brave.com → API Keys → Regenerate
