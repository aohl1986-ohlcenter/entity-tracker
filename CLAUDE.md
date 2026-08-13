# CLAUDE.md

**Alle verbindlichen Arbeitsregeln stehen tool-neutral in [AGENTS.md](AGENTS.md) —
vor jeder Änderung vollständig lesen.** Diese Datei ist bewusst nur ein Verweis,
damit die Regeln nicht doppelt gepflegt werden.

Die vier kritischsten Punkte (Details dort):

1. **⚠️ Lokale Scripts und der lokale Dev-Server schreiben in die PRODUKTIONS-DB.**
   Es gibt kein Dev-DB-Setup.
2. **Mandantentrennung:** Jede Aggregation über Kandidaten, Alerts oder Snapshots
   muss explizit nach `entityId` filtern — hier gab es schon einen Tenant-Leak.
3. **Build ist TS-strict:** lokal `tsc --noEmit` prüfen, `tsx` schluckt implicit-any.
   Node-Pfad wegen des nvm-Hooks explizit setzen.
4. **Feature-Gates und Limits nur in `lib/plans.ts`**, nicht in Views duplizieren.
