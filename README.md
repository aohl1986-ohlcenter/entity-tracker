# Entity Authority Tracker

SERP-Domination & AI-Citation-Tracking für Personal-Branding-SEO.
Erste Entity: **Jens Langkammer**.

## Stack
- Next.js 15 (App Router) auf Vercel
- Postgres via Vercel Postgres / Neon (Drizzle ORM)
- Serper.dev für Google-SERPs (echtes Google DE)
- Gemini 2.5 Flash mit `google_search`-Grounding für AI-Citations
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

1. `vercel link` (neues Projekt `entity-tracker`, Domain `tracker.pragma-code.de`)
2. Env-Vars in Vercel setzen: `DATABASE_URL`, `SERPER_API_KEY`, `GEMINI_API_KEY`,
   `GEMINI_MODEL`, `CRON_SECRET`, `DEFAULT_ENTITY_SLUG=jens-langkammer`.
3. Vercel Postgres / Neon Integration → injects `DATABASE_URL` automatisch.
4. `vercel deploy --prod`. Die `vercel.json` registriert zwei Cronjobs:
   - 06:00 UTC SERP-Fetch
   - 06:30 UTC AI-Citation-Check
5. Vercel sendet bei Cron automatisch `Authorization: Bearer $CRON_SECRET`.

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

## Key-Rotation

Beide API-Keys (Serper, Gemini) wurden initial im Chat geteilt — bitte
nach erfolgreichem Smoke-Test rotieren:
- Serper: https://serper.dev → Settings → Regenerate
- Gemini: https://aistudio.google.com/apikey → Delete & Create
