# Betrieb

Interner Runbook. Die README beschreibt das Projekt, diese Datei den laufenden Betrieb.

## Kunden anlegen und pflegen

`/admin` (Login über die `ADMIN_PASSWORD`-Env). Dort werden gepflegt: Paket und
Status, Keywords (das Plan-Limit wird erzwungen), Ziel-URLs, Citation-Prompts,
Wunschlinks, GEO-Empfehlungen, Report-Empfänger und das Zugangspasswort des
Kunden — letzteres wird nur als scrypt-Hash gespeichert und einmalig angezeigt.

Abrechnung läuft manuell per Rechnung. `plan` und `status` sind reine
Steuerfelder: `paused` und `cancelled` stoppen Tracking und Reports sofort.
Feature-Gates und Limits stehen zentral in `lib/plans.ts`.

## Kapazität und API-Budget

- `/admin/usage` zeigt die gemessene Auslastung (Tabelle `api_usage`).
- Der tägliche Collect läuft sequentiell über alle aktiven Tenants in einem
  Cron mit `maxDuration 300 s`. Ab etwa fünf Kunden mit vollen
  Keyword-Kontingenten muss der Collect gechunkt werden.
- Vor dem dritten Kunden auf bezahlte API-Tarife wechseln. Achtung bei der
  Kalkulation: Serpers 0,30 $/1k gelten erst ab dem 3.750-$-Paket; der kleinste
  Pack kostet 50 $ für 50k Credits (= 1,00 $/1k) und **verfällt nach 6 Monaten**.

## Cronjobs

`vercel.json` registriert zwei Jobs (Vercel Hobby genügt):

- **täglich 06:00 UTC** — `/api/cron/collect`: SERP-Fetch, AI-Citation-Check über
  alle Engines, Alert-Erkennung. Persistiert Alerts mit `emailSent=0` und
  versendet **keine** Mail.
- **montags 07:00 UTC** — `/api/cron/send-digest`: bündelt alle noch nicht
  gemailten Alerts in **einen** Report und verschickt ihn.

So entsteht täglich eine saubere Zeitreihe, aber nur einmal pro Woche eine Mail.

Manueller Sofort-Report (sammeln **und** mailen): `/api/cron/daily-digest` bzw.
`npx tsx scripts/run-daily-digest.ts`. Einzeln: `scripts/run-collect.ts`
(sammeln ohne Mail) und `scripts/run-send-digest.ts` (offene Alerts mailen).

Vercel sendet bei Cron automatisch `Authorization: Bearer $CRON_SECRET`; die
Routes validieren das.

## Monitoring

Drei Ebenen, damit Ausfälle und erschöpfte Limits nicht unbemerkt bleiben:

1. **In-Job-Ops-Mail** — `lib/ops.ts → detectOpsIssues` erkennt gehäufte Fehler
   (≥ 50 % der SERP-Abrufe fehlgeschlagen, eine Citation-Engine bei allen Prompts
   fehlgeschlagen) und ausgeschöpfte Kontingente (Fehlertext enthält
   `credit`/`quota`/`limit`/`429`/`402`/…) und schickt eine Ops-Mail an
   `OPS_EMAIL_TO`, ersatzweise `ALERT_EMAIL_TO`.
2. **Job-Crash** — bricht der Collect komplett ab, sendet die Route eine
   Crash-Mail **und** antwortet mit HTTP 500, sodass auch Vercels eigene
   Cron-Fehlerbenachrichtigung greift.
3. **Heartbeat** — `GET /api/health` (öffentlich, ohne Auth) liefert das Alter des
   jüngsten Snapshots: **200** wenn frisch, **503** wenn älter als 30 Stunden.
   Darauf einen externen Uptime-Monitor zeigen lassen; er alarmiert bei 503 oder
   Timeout. Das ist die Absicherung für den Fall, dass die App gar nicht mehr
   läuft und sich deshalb auch nicht selbst per Mail melden kann.

## Deploy

```bash
vercel login
vercel link --yes --project entity-tracker
bash scripts/vercel-env-push.sh     # Env-Vars aus .env.local nach Vercel
vercel deploy --prod
```

### Subdomain bei Ionos

1. Vercel: Project → Settings → Domains → `tracker.pragma-code.de` hinzufügen.
2. Vercel nennt einen CNAME-Wert (z. B. `cname.vercel-dns.com`).
3. Ionos: DNS → CNAME-Record `tracker` → Vercel-Wert.
4. Nach der DNS-Propagation ist das HTTPS-Zertifikat automatisch live.

## Altlasten

- `AUTH_ENTITIES`-Env ist deprecated (Passwörter liegen in der DB); der
  Login-Fallback darauf entfällt im nächsten Release.
- `lib/gemini.ts` dokumentiert `gemini-3.5-flash-lite` als Default, setzt aber
  `gemini-2.5-flash`; `.env.example` wiederum `gemini-3.5-flash-lite`. Vor der
  nächsten Modellumstellung vereinheitlichen.
