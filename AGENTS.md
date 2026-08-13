# AGENTS.md — Arbeitsanleitung für KI-Agenten & IDEs

**entity-tracker** — SERP-Domination- und AI-Citation-Tracker, seit Juli 2026
Multi-Tenant-SaaS. Live: **tracker.pragma-code.de**.

Stack: Next.js 15 (App Router, `force-dynamic`), Drizzle + **Neon-Postgres**,
Serper.dev für SERPs, Citations über die Engine-Module `lib/gemini.ts`,
`lib/tavily.ts`, `lib/brave.ts`, `lib/bedrock.ts`. Eine Engine läuft nur, wenn ihr
Key gesetzt ist.

## ⚠️ Lokale Scripts schreiben in die PRODUKTIONS-DB

`scripts/_env.ts` lädt `.env.local`, dessen `DATABASE_URL` auf die Live-Neon-DB
zeigt — **es gibt kein separates Dev-DB-Setup**, auch der lokale Dev-Server arbeitet
auf Produktivdaten. Vor jedem schreibenden Script bewusst prüfen, was es anfasst.
`seed.ts` ist idempotent und hinter `SEED_ALLOW=1` gegated (kein destruktives Delete).

## Build & Deploy

```sh
# nvm-Hook bricht Shell-Befehle mit `cd` ab (exit 3) → Node-Pfad explizit setzen:
export PATH="/Users/ohlcenter/.nvm/versions/node/v24.13.0/bin:$PATH"
# Scripts ohne `cd` starten:
npx tsx <absoluter-pfad>
# Deploy:
vercel --cwd ~/dev/entity-tracker deploy --prod --yes
```

- **Der Build ist TS-strict.** Lokal `tsc --noEmit` prüfen — `tsx` schluckt
  implicit-any, Vercel nicht. Ein Script, das lokal läuft, beweist nichts über den Build.
- **Vercel-CLI-Falle (v52):** `env add` ohne `--value` setzt im Agent-Modus einen
  leeren Wert. Prod-Werte sind ohne `--no-sensitive` nach dem Anlegen nicht mehr per
  `env pull` lesbar.

## Datenmodell und Gates

- `entities.plan` / `entities.status` steuern Features und Tracking.
  `paused`/`cancelled` = kein Collect, keine Mail. Abrechnung ist manuell, **kein
  Stripe**.
- Feature-Gates und Limits liegen **zentral in `lib/plans.ts`** — nicht in Views
  duplizieren.
- Keyword-Limits werden serverseitig erzwungen. Keywords werden **deaktiviert, nicht
  gelöscht** (erhält die Historie).
- Kunden-Config (Prompts, Wunschlinks) lebt in den DB-Tabellen `citation_prompts` /
  `wanted_links`. Die Dateien unter `data/*.ts` sind nur noch Bootstrap-Fixtures.

## Auth

Tenant-Passwörter liegen als **scrypt-Hash in der DB** (`entities.passwordHash`,
`lib/password.ts`); der Login prüft die DB zuerst. `AUTH_ENTITIES` (Env) ist
**deprecated** — nur noch Login-Fallback, fliegt im nächsten Release; keine neuen
Verwendungen einbauen.

Die Middleware macht **nur** die HMAC-Cookie-Prüfung (Dev-Modus-Gate an
`AUTH_SECRET`); der Existenz- und Status-Check gegen die DB sitzt in `lib/session.ts`.

Der Admin-Bereich `/admin` hat ein eigenes `et_admin`-Cookie und `ADMIN_PASSWORD`
(Env, lokal in `.env.local`). Generierte Kundenpasswörter werden **einmal** angezeigt
und nur als Hash gespeichert.

## Mandantentrennung — schon einmal geleakt

`detectAuthorityCandidatesForEntity` filterte nicht nach `entityId`, dadurch landeten
Authority-Kandidaten aus fremden Tenants im Report eines anderen Kunden. **Jede
Query, die Kandidaten, Alerts oder Snapshots aggregiert, muss explizit nach
`entityId` filtern** — und bei neuen Aggregationen ist das der erste Testfall.

## Cron und Alerts

- Täglich 06:00 UTC `/api/cron/collect` — sammelt und persistiert Alerts mit
  `emailSent=0`, **verschickt keine Mail**.
- Alle 5 Tage 07:00 UTC `/api/cron/send-digest` — bündelt alle `emailSent=0`-Alerts
  in eine Report-Mail. Dashboard bleibt dadurch täglich aktuell, Mail bleibt selten.
- 6 Alert-Typen: `displacement_top3`, `rank_drop`, `rank_gain`, `score_drop`,
  `citation_loss`, `authority_candidate`.
- Rank-Gain/Drop feuern erst nach Bestätigung über **zwei aufeinanderfolgende
  Snapshots** gegenüber der Baseline (also ab dem dritten). Der Digest verdichtet
  Rank-Alerts pro Keyword×URL zur Netto-Bewegung (`collapseForDigest` in
  `lib/alerts.ts`), übrige Typen werden per `dedupKey` dedupliziert. Diese Dämpfung
  nicht wegoptimieren — sie ist der Grund, warum die Reports lesbar sind.

## Klassifikations-Pattern-Falle

`lib/classify.ts` matcht `^`-verankert nach dem www-Strip. Subdomains wie
`de.linkedin.com` — was Google.de fast immer liefert — werden **nicht** getroffen,
wenn das Pattern kein führendes `*` hat. Deshalb LinkedIn-Patterns als
`*linkedin.com/in/...` schreiben. Sonst wird das eigene Profil eines Kunden beim
Ranken nicht als `owned` erkannt.

## E-Mail-Versand

Reports gehen über Resend von `Pragma-Code Tracker <tracker@pragma-code.de>`
(`ALERT_EMAIL_FROM`). Die Domain `pragma-code.de` ist verifiziert (DKIM/SPF/DMARC
pass); eine zweite Domain ginge nur im bezahlten Plan. Der Send-only-Key darf von
jeder verifizierten Account-Domain senden, aber **keine Domains anlegen** →
Domain-Setup nur im Resend-Dashboard.

**Offen:** `Reply-To: info@pragma-code.de` in `lib/resend.ts` ergänzen, bevor
Kunden-Reports rausgehen — `tracker@` hat kein Postfach.

## Engines

- **Gemini läuft über AI Studio** (`GEMINI_API_KEY`), nicht mehr über Vertex;
  `lib/vertex.ts` existiert nicht mehr.
- Der Gemini-Free-Tier (20 Requests/Tag) ist im Alltag oft erschöpft → Citations
  tragen dann Tavily + Brave allein. **Ein Gemini-429 ist normal, kein Bug.**
- `/admin/usage` zeigt das API-Call-Metering (Tabelle `api_usage`). Vor Kunde Nr. 3
  müssen bezahlte API-Tarife stehen.
- **Zahlendifferenz beachten:** Die öffentliche Produktseite
  `/ki-sichtbarkeits-monitoring` auf pragma-code.de nennt bewusst **3 KI-Engines**
  (Gemini, Tavily, Brave). Wer hier Engines ändert, muss die Produktseite mitdenken —
  und umgekehrt nie mehr behaupten, als real läuft.

## robots.txt bei Kunden-Assets

Für `jens-langkammer.de` (Quelle `~/AntiGravity/jens-langkammer-hub/`, hinter
Cloudflare) wird die robots.txt / AI-Crawler-Steuerung **im Cloudflare-Dashboard**
verwaltet („KI-Crawler kontrollieren"), nicht über die Repo-Datei — solange das aktiv
ist, überschreibt Cloudflare die Repo-`robots.txt` am Edge. Beides steht auf „nicht
blockieren", damit Gemini/Google-Extended die Seite zitieren dürfen; `ai-train=no`
und Gemini-Zitate schließen sich bei Google gegenseitig aus. Weicht eine live
ausgelieferte robots.txt von der Repo-Datei ab, ist immer zuerst Cloudflare die
Ursache.
