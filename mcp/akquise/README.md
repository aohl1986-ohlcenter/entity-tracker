# akquise-mcp

Die Akquise-Pipeline als MCP-Server: KI-Sichtbarkeit einer Branche in einer
Region messen, daraus Leads ableiten, und — das ist der eigentliche Punkt —
vor dem Anschreiben eine Freigabe erzwingen.

Der Server implementiert nichts Eigenes. Er exponiert die Funktionen aus
`lib/akquise/` (reine Prüf- und Rechenlogik) und `lib/akquise-lauf/` (Ablauf
und Dateien) als Tools. Dieselben Funktionen bedienen die CLI-Skripte unter
`scripts/akquise-*.ts`, damit beide Wege nicht auseinanderlaufen können.

## Wozu das gut ist

Sprachmodelle beantworten Fragen wie „Wer ist der beste Dachdecker in X?"
zunehmend selbst, mit einer Handvoll zitierter Quellen. Wer dort nicht
vorkommt, bei Google aber sehr wohl, hat ein konkretes, technisch benennbares
Problem — und ist damit ein Gesprächsanlass. Die Pipeline misst genau diese
Lücke:

1. **Sweep** — typische Kundenfragen an ein Modell mit Live-Websuche, mitschreiben, wer zitiert wird.
2. **Leads** — dieselbe Branche über Google abfragen und abgleichen: wer ist bei Google da, in der KI nicht?
3. **Gate** — prüfen, ob das Ergebnis überhaupt belastbar ist und wer angeschrieben werden *darf*.
4. **Auswertung** — für einen einzelnen Lead eine 1-Seiten-Analyse mit belegbaren technischen Befunden.

## Tools

| Tool | Zweck | Netz |
|---|---|---|
| `akquise_status` | Welche Artefakte liegen vor, welcher Schritt ist dran? | nein |
| `akquise_sweep` | KI-Sichtbarkeit erheben | Modell + Suche |
| `akquise_leads` | Marktabgleich, Lead-Liste | Suche |
| `akquise_gate` | **Freigabe vor dem Anschreiben** | nur mit `online` |
| `akquise_auswertung` | 1-Seiten-Analyse für einen Lead | Website des Leads |

### Der Gate ist kein Vorschlag

`akquise_gate` antwortet mit einem Tool-**Fehler**, solange Blocker vorliegen
oder Warnungen ungeprüft sind. Das ist Absicht: eine Ablehnung, die aussieht
wie ein normales Ergebnis, wird überlesen.

- **Blocker** müssen behoben werden. Sie lassen sich nicht akzeptieren.
- **Warnungen** halten den Lauf ebenfalls auf. Erst wenn ein Mensch sie gelesen
  hat, darf mit `warnungenAkzeptiert: true` erneut aufgerufen werden — das ist
  eine Bestätigung, kein Parameter zum Mitschicken.

Geprüft wird unter anderem: Schema und Datumskonsistenz der Artefakte,
Marktabdeckung, Verzeichnisportale in der Lead-Liste, Zweitdomains desselben
Betreibers, die Sperrliste aus dem Tracker, Grounding (hat das Modell frei
geantwortet oder aus Quellen?), und mit `online` der Werbewiderspruch im
Impressum jedes Leads.

Der Werbewiderspruch ist **fail-closed**: Ist ein Impressum nicht abrufbar,
gilt das als Blocker, nicht als „unauffällig".

## Grenzen

- **Keine Datenbank.** Der Server liest und schreibt nur Dateien. Er hat keinen
  DB-Zugang und darf keinen bekommen — siehe unten.
- **Artefakte liegen außerhalb des Repos**, unter `~/career-ops/akquise/`. Dieses
  Repo ist öffentlich; Lead- und Kundendaten gehören nicht hinein.
- **Momentaufnahme, keine Wahrheit.** Modellantworten schwanken, SERPs ändern
  sich täglich. Die Zahlen gelten für den Tag der Erhebung.
- **Der Gate ersetzt kein Urteil.** Er prüft Mengen-Invarianten und formale
  Zulässigkeit, nicht ob ein Anschreiben inhaltlich sinnvoll ist.
- **Kein Versand.** Der Server schreibt niemanden an; er erzeugt nur Grundlagen.

## Isolation gegen die Produktionsdatenbank

Das Repo enthält eine `.env.local` mit der Live-`DATABASE_URL`. Ein
langlaufender Serverprozess, der fremde Anfragen ausführt, darf sie nicht
sehen. Deshalb:

- `mcp/akquise/umgebung.ts` lädt **keine** `.env`-Datei pauschal, sondern parst
  sie selbst und übernimmt nur eine Allowlist (`BEDROCK_*`, `SERPER_API_KEY`).
- `DATABASE_URL` und Verwandte werden aus der ererbten Umgebung **entfernt**;
  sind sie danach noch gesetzt, startet der Server nicht. Vor jedem Tool-Aufruf
  wird erneut geprüft.
- `eval/isolation.test.ts` scannt den Quelltext von `lib/akquise/`,
  `lib/akquise-lauf/` und `mcp/akquise/` auf Importe von `lib/db`, drizzle oder
  `scripts/_env` — und stellt sicher, dass der Guard hier stehen bleibt.

Der Scan ist nicht transitiv: **neue Ordner müssen in `eval/isolation.test.ts`
eingetragen werden**, sonst sind sie ungeprüft.

## Einrichtung

Keys (nur für Sweep und Leads; Gate und Status brauchen keine):

- `BEDROCK_API_KEY`, optional `BEDROCK_MODEL`, `BEDROCK_REGION`
- `SERPER_API_KEY`

Sie werden aus `.env.local` / `.env` im Repo gelesen oder von der
MCP-Konfiguration übergeben. Bereits gesetzte Werte gewinnen.

Start:

```bash
npm run akquise:mcp
```

Eintrag im MCP-Client: siehe `beispiel.mcp.json`. Trägst du Keys direkt dort
ein, gehört die Datei **nicht** ins Repo.

## Test

```bash
npm run akquise:eval
```

Deckt die Regeln, die Parser, den Gate-Ablauf und die Isolation ab.
