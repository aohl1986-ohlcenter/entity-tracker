# Entity Authority Tracker

[![CI](https://github.com/aohl1986-ohlcenter/entity-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/aohl1986-ohlcenter/entity-tracker/actions/workflows/ci.yml)
[![CodeQL](https://github.com/aohl1986-ohlcenter/entity-tracker/actions/workflows/codeql.yml/badge.svg)](https://github.com/aohl1986-ohlcenter/entity-tracker/actions/workflows/codeql.yml)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Postgres](https://img.shields.io/badge/Postgres-Drizzle_ORM-4169E1?logo=postgresql&logoColor=white)](https://orm.drizzle.team)

Wie sichtbar ist eine Person oder Marke — nicht nur bei Google, sondern in den
Antworten der KI-Suchsysteme, die zunehmend davor stehen?

Der Tracker beantwortet das messbar: Er beobachtet täglich die Google-Top-10 zu
einem Keyword-Set **und** prüft, ob dieselbe Entity in den Antworten von Gemini
(mit Search-Grounding), Tavily und Brave zitiert wird. Daraus entstehen ein
Domination-Score, eine Zeitreihe und Alerts bei Veränderungen.

Läuft als Multi-Tenant-Anwendung in Produktion.

**Live:** [tracker.pragma-code.de](https://tracker.pragma-code.de) — Kundenprojekt mit Login, Demo auf Anfrage.
Ein Werkzeug von [Pragma Code](https://www.pragma-code.de).

---

## Was daran technisch interessant ist

**Zeitreihe statt Momentaufnahme.** SERPs schwanken täglich. Gemessen wird
deshalb nicht ein Rang, sondern ein positionsgewichteter Score über die Zeit —
Position 1 zählt 10×, Position 10 zählt 1×, Verdrängungs-Treffer werden
halbgewichtet abgezogen.

**Drei Citation-Engines parallel.** Jeder Prompt läuft gegen jede Engine, deren
API-Key gesetzt ist; eine fehlende Engine wird stillschweigend übersprungen. Pro
Prompt entsteht eine DB-Zeile je Engine — Gemini und Tavily sind damit direkt
vergleichbar, statt sich auf eine Quelle zu verlassen.

**Ein Gate gegen halluzinierte Fakten.** Der interessanteste Teil: LLM-Ausgaben
werden nicht geglaubt, sondern gegen prüfbare Invarianten gestellt.
→ [Verifikations-Gate](#verifikations-gate)

**Testbarkeit als Entwurfsentscheidung.** Getestet werden Mengen-Invarianten
zwischen Prompt-, Zitat- und Marktmenge, nicht konkrete Modellantworten. Ein Test
auf „nennt das Modell Firma X?" wäre in zwei Wochen rot — ohne Regressionsgrund.

---

## Stack

| Bereich | Wahl |
|---|---|
| Framework | Next.js 15 (App Router) auf Vercel |
| Datenbank | Postgres (Neon) via Drizzle ORM |
| SERPs | Serper.dev (echtes Google DE) |
| Citations | Gemini mit `google_search`-Grounding · Tavily · Brave |
| Zeitsteuerung | Vercel Cron (täglich sammeln, wöchentlich berichten) |
| Mail | Resend |

## Datenmodell

| Tabelle | Inhalt |
|---|---|
| `entities` | Personen / Marken, die getrackt werden (ein Tenant je Entity) |
| `keywords` | Suchanfragen, geclustert nach `name` / `name_topic` / `topic` |
| `target_urls` | eigene, Authority- und Displacement-URLs mit Glob-Mustern |
| `serp_snapshots` · `serp_results` | Zeitreihe der Google-Top-10 |
| `ai_citations` | Engine-Antworten samt zitierter Quellen |
| `alerts` | erkannte Veränderungen, gebündelt für den Digest |
| `api_usage` · `llm_runs` · `llm_calls` | Kosten- und Auslastungsmessung |

Jede SERP-URL wird gegen die `target_urls`-Muster klassifiziert: **owned**
(eigene Profile und Beiträge), **authority** (starke Fremdquellen, die die Entity
stützen), **displacement** (Verzeichnisse, die den Platz besetzen) oder
**neutral**.

## Verifikations-Gate

Aus dem Tracking-Kern ist ein zweites Werkzeug entstanden: Es erzeugt aus
denselben Messungen Sichtbarkeits-Befunde. Solche Aussagen gehen an Dritte —
steht eine falsch drin, ist das geschäftsschädigend. Deshalb steht vor jeder
Ausgabe ein Gate aus zehn Regeln, das **fail-closed** arbeitet.

Exit-Codes sind die Schnittstelle:

| Code | Bedeutung |
|---|---|
| `0` | freigegeben |
| `1` | technischer Fehler (Datei fehlt, Schema kaputt, `DATABASE_URL` gesetzt) |
| `2` | mindestens ein Blocker |
| `3` | nur Warnungen — nach manueller Prüfung mit `--warnungen-akzeptiert` |

| ID | prüft |
|---|---|
| `R0_SCHEMA` | Artefakte strukturell gültig, Datum und Branche konsistent |
| `R1_MARKT_UNTERFASSUNG` | Deckung zwischen Markterfassung und zitierten Domains ≥ 80 % |
| `R2_PROMPT_MARKT_MISMATCH` | Suchbegriffe fragen dieselbe Branche ab wie die Prompts |
| `R3_PORTAL_LECKAGE` | keine Verzeichnisportale in Kandidaten oder Ergebnissen |
| `R4_ALIAS_DOMAIN` | kein Treffer, der bloß die Zweitdomain eines zitierten Betriebs ist |
| `R5_SPERRLISTE` | Eintrag steht nicht auf der Sperrliste |
| `R6_KATEGORIE` | Titel passt zum Geschäftsmodell (nur Warnung) |
| `R7_GROUNDING` | Antworten waren gegroundet, Zitate ⊆ gelieferte Quellen |
| `R8_ZAHLEN` | keine `NaN`/`Infinity` in Kennzahlen |
| `R9_WERBEWIDERSPRUCH` | Impressum widerspricht keiner Kontaktaufnahme (**fail-closed**) |

`R7` ist der Kern. Die Grounding-Funktion zieht Zitate per Regex aus dem
**generierten** Antworttext — eine erfundene URL ist dort nicht von einer echten
zu unterscheiden. Seit sie zusätzlich die tatsächlich gelieferten Quellen
zurückgibt, ist `citations ⊆ grounding.links` eine offline prüfbare Invariante.
Sie hat beim ersten Live-Lauf sofort eine halluzinierte URL gefunden.

### Regressionssuite

```bash
npm run akquise:eval   # läuft auch in CI — offline, ohne API-Keys, ohne DB
```

`eval/golden/faelle.json` enthält reale Fehlerfälle aus produktiven Läufen —
jeweils mit **Negativ-Zwilling**, denn ohne den wäre eine Regel, die immer
feuert, grün. `eval/mutation.test.ts` mutiert eine synthetische saubere Basis und
verlangt, dass **genau** die zugehörige Regel anschlägt und keine andere. Neue
Fälle kommen als Eintrag in `faelle.json` dazu, nicht als neuer Testcode.

**Isolation:** `lib/akquise/`, `scripts/akquise-gate.ts` und `eval/` importieren
weder `lib/db` noch `scripts/_env` — per Test zugesichert. Der Gate bricht ab,
wenn `DATABASE_URL` gesetzt ist, weil `_env` sonst die Produktions-DB lädt.

> Die Fixtures unter `eval/` stammen aus echten Läufen, sind aber
> **pseudonymisiert**: Betriebsdomains und -titel sind durch
> `betrieb-NNN.example` ersetzt. Zahlen, Positionen und Mengenverhältnisse sind
> unverändert — nur auf die prüfen die Regeln.

---

## Lokal starten

```bash
npm install

cp .env.example .env.local      # DATABASE_URL, SERPER_API_KEY, GEMINI_API_KEY, CRON_SECRET
$EDITOR .env.local

npm run db:push                 # Schema in die DB
npm run db:seed                 # Beispiel-Entity mit Keywords und Ziel-URLs
npx tsx scripts/smoke.ts        # Smoke-Test: Serper + Gemini live

npm run fetch:serps
npm run fetch:citations

npm run dev                     # http://localhost:3000
```

## Weiter

- **[docs/BETRIEB.md](docs/BETRIEB.md)** — Runbook: Tenants, Cronjobs, Monitoring, Deploy
- **[AGENTS.md](AGENTS.md)** — Konventionen für die Arbeit an diesem Repo

## Lizenz

Kein Open-Source-Release. Der Code liegt öffentlich als Arbeitsprobe; alle Rechte
vorbehalten. Für Nutzung oder Weiterverwendung bitte
[anfragen](mailto:info@pragma-code.de).
