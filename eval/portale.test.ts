/**
 * Portal-Erkennung.
 *
 * Der frühere Substring-Match (`host.includes("kammer")`) sortierte echte
 * Betriebe wie `kammermeier-steuer.de` als Portal aus. Die Negativfälle unten
 * sind der eigentliche Zweck dieser Datei.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { istPortal } from "../lib/akquise/portale";

describe("istPortal — erkennt Verzeichnisse", () => {
  const portale = [
    "gelbeseiten.de",
    "www.gelbeseiten.de",
    "doctolib.de",
    "jameda.de",
    "unternehmen.focus.de",
    "de.linkedin.com",
    "tischler-schreiner.org",
    "typisch-osnabrueck.de",
    "bauen.osnabrueck.de",
    "immobilienscout24.de",
    "my-hammer.de",
    "superprof.de",
    "kammer.de",
  ];
  for (const host of portale) {
    it(`${host} ist ein Portal`, () => assert.equal(istPortal(host), true));
  }
});

describe("istPortal — echte Betriebe bleiben verschont", () => {
  const betriebe = [
    // Der historische Fehlalarm: enthält "kammer" als Substring
    "kammermeier-steuer.de",
    // Enthält "jobs" bzw. "anwalt" als Substring, ist aber kein Portal
    "jobsen-fliesenleger.de",
    "hellmann-fachanwaelte.de",
    "anwaeltehaus.net",
    // Echte Betriebe aus den Sweeps
    "zacp.de",
    "soekeland-leimbrink.de",
    "praxisklinik-dr-stein.de",
    "ask-steuerberater-hannover.de",
    "kfo-am-neumarkt.de",
    "zahnarzt-nils-schmidt.de",
    "immobilisimo.de",
  ];
  for (const host of betriebe) {
    it(`${host} ist KEIN Portal`, () => assert.equal(istPortal(host), false));
  }
});
