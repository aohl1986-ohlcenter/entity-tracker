/**
 * Fehlertyp der Ablauf-Schicht.
 *
 * Die Skripte beendeten sich früher direkt mit `process.exit(1)`, wenn eine
 * Datei fehlte. Als aufrufbare Funktion geht das nicht mehr: ein MCP-Server
 * darf am fehlenden Sweep einer einzelnen Anfrage nicht sterben. Stattdessen
 * wird geworfen, und der jeweilige Aufrufer entscheidet — die CLI mappt auf
 * Exit-Code 1, der Server auf eine Fehlerantwort.
 */
export class AblaufFehler extends Error {
  constructor(meldung: string) {
    super(meldung);
    this.name = "AblaufFehler";
  }
}
