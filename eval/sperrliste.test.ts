/**
 * Sperrlisten-Parser über den handgepflegten Tracker-Markdown.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSperrliste, SperrlistenFehler } from "../lib/akquise/sperrliste";
import { ladeSperrliste } from "./hilfen";

describe("parseSperrliste", () => {
  it("findet die Domain trotz Klartext in derselben Zelle", () => {
    const liste = ladeSperrliste();
    assert.ok(
      liste.has("zahnarztpraxis-beispiel.example"),
      "Die Zelle lautet 'zahnarztpraxis-beispiel.example (Dr. C. Beispiel, Musterstadt)' — der Parser muss die Domain herauslösen.",
    );
  });

  it("übernimmt auch die bewusst ausgelassenen Domains", () => {
    const liste = ladeSperrliste();
    assert.ok(liste.has("betrieb-093.example") || liste.has("betrieb-088.example"));
    assert.ok(
      liste.has("betrieb-014.example"),
      "Bewusst nicht angeschrieben (Verwaltung statt Vermittlung) — zählt ebenfalls als Sperre.",
    );
  });

  it("liefert einen Grund mit", () => {
    const grund = ladeSperrliste().get("zahnarztpraxis-beispiel.example") ?? "";
    assert.match(grund, /Werbewiderspruch/i);
  });

  it("bricht LAUT ab, wenn der Sperrlisten-Abschnitt fehlt", () => {
    assert.throws(
      () => parseSperrliste("# Tracker\n\n## Irgendwas\n\n| A | B |\n"),
      SperrlistenFehler,
      "Ein still leeres Ergebnis würde den Gate alles durchwinken lassen.",
    );
  });

  it("verwechselt Kopf- und Trennzeilen nicht mit Daten", () => {
    const md = "## Sperrliste (kein Kontakt mehr)\n\n| Domain | Grund |\n|--------|-------|\n| beispiel.de | Testgrund |\n";
    const liste = parseSperrliste(md);
    assert.deepEqual([...liste.keys()], ["beispiel.de"]);
  });
});
