/**
 * Werbewiderspruchs-Erkennung.
 *
 * Bewusst mit synthetischen Textbausteinen statt echtem Fremd-HTML: Impressen
 * Dritter gehören nicht ins Repo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enthaeltWerbewiderspruch } from "../lib/akquise/impressum";

describe("enthaeltWerbewiderspruch", () => {
  it("erkennt die Standardformel im Passiv", () => {
    const html = `<p>Der Nutzung von im Rahmen der Impressumspflicht veröffentlichten Kontaktdaten
      durch Dritte zur Übersendung von nicht ausdrücklich angeforderter Werbung wird hiermit
      widersprochen.</p>`;
    assert.equal(enthaeltWerbewiderspruch(html), true);
  });

  it("erkennt den Vorbehalt rechtlicher Schritte gegen Spam", () => {
    const html = `<div>Rechtliche Schritte gegen die Versender von sogenannten Spam-Mails bei
      Verstößen gegen dieses Verbot sind ausdrücklich vorbehalten.</div>`;
    assert.equal(enthaeltWerbewiderspruch(html), true);
  });

  it("erkennt die Aktivformel", () => {
    assert.equal(
      enthaeltWerbewiderspruch("<p>Unaufgeforderte Zusendung von Werbung widersprechen wir hiermit.</p>"),
      true,
    );
  });

  it("schlägt NICHT bei einem normalen Impressum an", () => {
    const html = `<p>Angaben gemäß § 5 DDG. Fliesenleger Mustermann, Musterstraße 1,
      49074 Osnabrück. Telefon 0541 12345. Umsatzsteuer-ID DE123456789.</p>`;
    assert.equal(enthaeltWerbewiderspruch(html), false);
  });

  it("schlägt NICHT bei bloßer Erwähnung von Werbung an", () => {
    const html = `<p>Wir setzen keine Cookies für Werbung ein und geben Ihre Daten nicht weiter.</p>`;
    assert.equal(enthaeltWerbewiderspruch(html), false);
  });

  it("ignoriert Skript- und Style-Inhalte", () => {
    const html = `<script>var t = "hiermit widersprochen werbung";</script><p>Impressum</p>`;
    assert.equal(enthaeltWerbewiderspruch(html), false);
  });
});
