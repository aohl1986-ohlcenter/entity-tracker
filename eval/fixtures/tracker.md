# Akquise-Tracker (Test-Fixture)

> **Synthetische Daten.** Firmen, Personen, Adressen, Telefonnummern und
> E-Mail-Adressen in der Kontakt-Tabelle und unter „Offene Leads" sind frei
> erfunden. Der echte Tracker liegt bewusst außerhalb des Repos unter
> `~/career-ops/akquise/leads-tracker.md`.
>
> Die Abschnitte `## Nicht angeschrieben — …` und `## Sperrliste …` sind das,
> was `parseSperrliste` liest. Ihre Domains sind bewusst unverändert, weil
> Golden Set und Mutationsprobe darauf aufbauen. Die Formateigenheiten
> (Klartext neben der Domain, `~~durchgestrichen~~`, mehrere Domains je Zelle,
> Fettung) sind der eigentliche Testgegenstand — beim Bearbeiten erhalten.

| # | Datum | Firma | Branche/Ort | Kanal | Kontakt | Status | Nächster Schritt | Notizen |
|---|-------|-------|-------------|-------|---------|--------|------------------|---------|
| 1 | 2026-07-31 | Ahrweiler Brandt WP/StB | Steuerberater Musterstadt | E-Mail | info@ahrweiler-brandt.example · GF Ahrweiler, Brandt, Cordes · Musterweg 3, 49000 MS | Kontaktiert | Follow-up ab 2026-08-07 (einmalig, Vorlage C) | Erstkontakt mit KI-Sichtbarkeits-Befund. Zustellung bestätigt. |
| 2 | 2026-07-31 | Dahlmann Ertl Fink StB PartGmbB (DEF) | Steuerberater Musterstadt | E-Mail | info@def-steuerberater.example · Dora Dahlmann, Emil Ertl, Fritz Fink · Am Beispielberg 8, 49001 MS · 0541 0000002 | Kontaktiert | Follow-up ab 2026-08-07 | Erstkontakt mit KI-Sichtbarkeits-Befund. Zustellung bestätigt. |
| 3 | 2026-07-31 | Gerlach & Hoppe StBG mbH | Steuerberater Musterstadt | E-Mail | info@gerlach-hoppe.example · GF'in Greta Gerlach · Beispielstr. 2, 49002 MS | Kontaktiert | Follow-up ab 2026-08-07 | Erstkontakt mit KI-Sichtbarkeits-Befund. Zustellung bestätigt. |
| 4 | 2026-07-31 | rechtskontor00 | Rechtsanwalt Musterstadt | E-Mail | info@rechtskontor00.example · RA Ida Iversen LL.M., Jan Jost, Kai Kunert · Musterwall 19, 49000 MS | Kontaktiert | Follow-up ab 2026-08-07 | Befund: 23 Kanzleien untersucht, 16 KI-sichtbar. Referenz zwei Vergleichskanzleien (5/6). |
| 5 | 2026-07-31 | Sozietät Lindner / Moser / Neubert-Deffner | Rechtsanwalt Musterstadt | E-Mail | info@kanzlei-lmn.example · Beispielstr. 15A, 49003 MS | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. Frau Neubert-Deffner ist zugleich Notarin. |
| 6 | 2026-07-31 | Ostermann Fachanwälte PartmbB | Rechtsanwalt Musterstadt | E-Mail | kanzlei@ostermann-fachanwaelte.example · 8 Partner (u.a. Dr. Otto Ostermann) · Schlossstr. 16, 49003 MS · 0541 0000006 | Kontaktiert | Follow-up ab 2026-08-07 | Größte der angeschriebenen Kanzleien. |
| 7 | 2026-07-31 | Rechtsanwälte Petersen und Partner | Rechtsanwalt Musterstadt | E-Mail | info@pup-rae.test · RA Paul Petersen, RAin Pia Petersen · Musterauer Weg 220, 49004 MS · 05400 000007 | Kontaktiert | Follow-up ab 2026-08-07 | Mailadresse weicht von Domain ab (pup-rae.test). |
| 8 | 2026-07-31 | AnwältehausBeispiel | Rechtsanwalt Musterstadt | E-Mail | info@anwaeltehaus-beispiel.test · 8 Anwälte (Quandt, Reimer, Sattler u.a.) · Kamp 76, 49003 MS | Kontaktiert | Follow-up ab 2026-08-07 | Bürogemeinschaft. |
| 9 | 2026-07-31 | TUV Architekten GmbH | Architektur Musterstadt | E-Mail | info@tuv-architekten.example · GF Timo Tessmer M.A. · Beispielstr. 32, 49002 MS · 0541 0000009 | Kontaktiert | Follow-up ab 2026-08-07 (einmalig, Vorlage C) | Befund: 23 Büros untersucht, 14 KI-sichtbar. Referenz beispiel-architektur.example (6/6). Stärkster Lead der Kohorte. |
| 10 | 2026-07-31 | Planungsbüro Ulrich GmbH (PBU) | Architektur/Planung Musterstadt | E-Mail | musterstadt@pbu.example · GF Dipl.-Ing. Udo Ulrich · Am Tie 1, 49005 MS | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. Beratender Ingenieur Bauwesen — Endkundenbezug etwas schwächer. |
| 11 | 2026-07-31 | Bauplanungsbüro Volker Vahle | Architektur/Planung Musterstadt | E-Mail | info@bauplanung-vahle.example · Dipl.-Ing. Volker Vahle · Beispielhagen 6, 49004 MS · 05400 000011 | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. Kleines Büro, klare Endkundenausrichtung. |
| 12 | 2026-07-31 | Wagner Haustechnik | Sanitär/Heizung Musterstadt | E-Mail | info@wagner-ms.example · GF Werner Wagner · Musterstr. 195, 49006 MS | Kontaktiert | Follow-up ab 2026-08-07 | Gewerk: 10 Betriebe, 7 KI-sichtbar. Referenz haustechnik-beispiel.example (4/4). |
| 13 | 2026-07-31 | Xander GmbH & Co. KG | Sanitär/Heizung Musterstadt | E-Mail | info@xander-SHK.example · GF Xaver Xander · Beispielstr. 70a, 49000 MS | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. |
| 14 | 2026-07-31 | Yilmaz Sanitärtechnik | Sanitär/Heizung Musterstadt | E-Mail | info@heizung-yilmaz.example · GF Anton + Christian Zeller | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. GF-Namen weichen vom Firmennamen ab. |
| 15 | 2026-07-31 | Adler GmbH | Dachdecker Beispieldorf/MS | E-Mail | info@adler-bedachungen.example · GF Arno Adler, Dachdeckermeister · 49200 Beispieldorf | Kontaktiert | Follow-up ab 2026-08-07 | Gewerk: 9 Betriebe, 6 KI-sichtbar. Referenz dach-beispiel.example (4/4). |
| 16 | 2026-07-31 | Dachdeckerei Berger | Dachdecker Musterstadt | E-Mail | info@dachdecker-berger.example | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. **Mail-Domain ≠ Website-Domain** (dachdeckerei-berger.example vs. dachdecker-berger.example). |
| 17 | 2026-07-31 | Claus & Dorn | Dachdecker Musterstadt | E-Mail | info@der-dachdecker-beispiel.example | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. Kein Ansprechpartner im Impressum auffindbar. |
| 18 | 2026-07-31 | Tischlerei Eggers | Tischlerei Beispielhausen/MS | E-Mail | info@tischler-eggers.example · Inh. Erik Eggers, Tischlermeister · 49100 Beispielhausen | Kontaktiert | Follow-up ab 2026-08-07 | Gewerk: 9 Betriebe, 6 KI-sichtbar. Referenz tischlerei-beispiel.example (3/4). Schwerpunkt Parkett. |
| 19 | 2026-07-31 | Malermeister Frey GmbH | Maler Musterstadt | E-Mail | malermeister.frey@beispielnet.example · Frank Frey · Beispielstr. 104, 49007 MS | Kontaktiert | Follow-up ab 2026-08-07 | Gewerk: 9 Betriebe, 6 KI-sichtbar. Referenz malerteam-beispiel.example (4/4). |
| 20 | 2026-07-31 | Maler & Raumausstattung Grote | Maler Musterstadt | E-Mail | grote@beispielnet.example · Musterstr. 52/52a, 49006 MS | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. |
| 21 | 2026-07-31 | Hendrik Haas Malermeister | Maler Musterstadt | E-Mail | info@haas-maler.example | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. |
| 22 | 2026-07-31 | Radio-Elektro-Imhoff | Elektro Musterstadt | E-Mail | info@elektro-imhoff.example · Musterstr. 72a, 49006 MS | Kontaktiert | Follow-up ab 2026-08-07 | Gewerk: 10 Betriebe, 7 KI-sichtbar. Referenz elektro-beispiel.example (4/4). |
| 23 | 2026-07-31 | Zahnarztpraxis Jansen | Zahnarzt Musterstadt | E-Mail | praxis@zahnarzt-jansen.example · Jana + Jens Jansen | Kontaktiert | Follow-up ab 2026-08-07 | Kohorte: 28 Praxen, 11 KI-sichtbar (39 % — beste Lücke bisher). Referenz zahn-beispiel.example (5/6). Impressum enthält Spam-Falle `praxis@remove-this…`. |
| 24 | 2026-07-31 | Moderne Zahnmedizin Beispiel | Zahnarzt Musterstadt/Beispieldorf | E-Mail | praxis@moderne-zahnmedizin-beispiel.example | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. |
| 25 | 2026-07-31 | KRAMER.DENTAL | Zahnarzt Musterstadt | E-Mail | praxis@kramer.dental-beispiel.example · Beispielstr. 11 + Musterstr. 25 | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. **Zwei Domains, ein Verbund** (kramer-zweit.example = Dr. Katja Kramer) → bewusst nur EINE Mail. |
| 26 | 2026-07-31 | Zahnheilkunde Nordfeld | Zahnarzt Musterstadt | E-Mail | info@zahnheilkunde-nordfeld.example | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. ⚠️ Datenschutz-Kontakt läuft über einen Verbundpartner (KI-sichtbar, 2×) — falls gleiche Trägerschaft, Befund prüfen. |
| 27 | 2026-07-31 | Musterstädter Immobilienkontor Lange & Merz eGbR | Immobilienmakler Musterstadt | E-Mail | info@musterstaedter-immobilien-kontor.example · Lena Lange + Mia Merz · Beispielstr. 8, 49004 MS · 0541 0000027 | Kontaktiert | Follow-up ab 2026-08-07 | Kohorte: 7 KI-Prompts, 0 Nennungen. Referenz immo-beispiel.example (6/7) + zwei Franchise-Marken (je 5/7). |
| 28 | 2026-07-31 | N+O Sommer Immobilien GmbH | Immobilienmakler Beispieldorf/MS | E-Mail | office@sommer-immobilien-beispiel.test · GF Nils Norden + Ole Ohm · Beispielstr. 2, 49200 Beispieldorf · 05400 000028 | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. Sitz Beispieldorf, vermarktet nach MS. |
| 29 | 2026-07-31 | Peters Immobilien | Immobilienmakler Musterstadt | E-Mail | info@petersimmobilien.test · Inh. Peter Peters, Dipl.-Immobilienwirt · Musterstr. 40a, 49000 MS · 0541 0000029 | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. Gehobenes Segment. |
| 30 | 2026-07-31 | Quirin Immobilien | Immobilienmakler Musterstadt | E-Mail | info@quirin-immobilien.example · Quirin Quandt · Beispielallee 55, 49002 MS | Kontaktiert | Follow-up ab 2026-08-07 | wie oben. Einzelunternehmer, Schwerpunkt kostenlose Immobilienbewertung. |
| 31 | 2026-08-01 | Zahnarztpraxis Dr. Roth | Zahnarzt **Beispielstadt** | E-Mail | info@zahnarzt-roth.example · Dr. med. dent. Rolf Roth · Beispielweg 105, 44000 BS · 0231 0000031 | Kontaktiert | Follow-up ab 2026-08-08 | Kohorte: 6 Prompts, 0 Nennungen. Referenz praxisklinik-beispiel.example (5/6). |
| 32 | 2026-08-01 | Paropraxis Beispielstadt GbR | Zahnarzt **Beispielstadt** | E-Mail | info@paropraxis-beispielstadt.example · Dr. Sina Sander + Dr. Timo Trautmann · Beispielstr. 599, 44001 BS · 0231 0000032 | Kontaktiert | Follow-up ab 2026-08-08 | wie oben. Schwerpunkte Paro + Implantologie → Implantat-Frage explizit erwähnt. |
| 33 | 2026-08-01 | Praxis für Zahnheilkunde Ulrich Vogt | Zahnarzt **Beispielstadt** | E-Mail | info@praxis-ulrich-vogt.example · Dr. Ulf Ulrich + Dr. Vera Vogt · Musterstr. 71, 44002 BS · 0231 0000033 | Kontaktiert | Follow-up ab 2026-08-08 | wie oben. Stadtteil Beispielberg. |
| 34 | 2026-08-01 | Wieland WP/StB | Steuerberater **Beispielhausen** | E-Mail | info@wieland-stb.example · Walter + Wilhelm Wieland, Wanda Weiß · Beispielstr. 28, 30000 BH · 0511 0000034 | Kontaktiert | Follow-up ab 2026-08-08 | Kohorte: 6 Prompts, 0 Nennungen. Referenz stb-beispiel-bh.example (5/6). |
| 35 | 2026-08-01 | ADLER BERG CONRAD PartG mbB | Steuerberater **Beispielhausen** | E-Mail | kanzlei@adler-partner.example · Bernd Berg + Carl Conrad · Musterstr. 47, 30001 BH · 0511 0000035 | Kontaktiert | Follow-up ab 2026-08-08 | wie oben. |
| 36 | 2026-08-01 | DIETRICH ENGEL PartG mbB | Steuerberater **Beispielhausen** | E-Mail | info@dietrichengel.example · Dirk Dietrich + Dipl.-Kfm. Erik Engel · Beispielgraben 16, 30002 BH · 0511 0000036 | Kontaktiert | Follow-up ab 2026-08-08 | wie oben. Instagram-aktiv → Satz zu Social-vs-Website ergänzt. |
| 37 | 2026-08-01 | Steuerkanzlei Falk | Steuerberater **Beispielhausen** | E-Mail | info@stb-falk.example · Dipl.-Kfm. Frida Falk · Beispielallee 25, 30003 BH · 0511 0000037 | Kontaktiert | Follow-up ab 2026-08-08 | wie oben. Einzelkanzlei → Freiberufler-Frage betont. |

## Nicht angeschrieben — Maklerkohorte (mit Grund)

| Domain | Grund |
|--------|-------|
| ecd-immo.de | Impressum weist eine **ImmobilienVERWALTUNGS GmbH** aus. Verwaltung ≠ Vermittlung — meine Prompts fragten nach Maklern. Nach eigener Regel nicht anschreiben. |
| fk-immobilien.net · mein-makler.com | Geschäftsmodell vor Kontakt ungeklärt (Verwaltung/Franchise?). |
| 5× Hausverwaltungen · 6× Portale | siehe Übersicht. |

## Nicht angeschrieben — Zahnarzt-Kohorte (mit Grund)

| Domain | Grund |
|--------|-------|
| osnabrueck-implantologe.de | Impressum verweist auf **lamek.de** — und lamek.de wird von der KI genannt (4×). Gleiche Praxis, zweite Domain → Befund wäre falsch. |
| zahnarzt-familie-osnabrueck.de | Keine E-Mail im Impressum/Kontakt auffindbar (Baukasten-Seite, nur Formular). Telefonisch erreichbar. |
| burockmartin.de | Keine E-Mail auffindbar, nur Kontaktformular. Telefonisch erreichbar. |
| gausfrau.dental | Teil eines Praxisverbunds → über #25 mitabgedeckt, keine Doppelmail. |
| 7× kfo-*.de u.a. | Kieferorthopäden — **KFO-Sweep vom 31.07. erledigt: alle sieben sind KI-sichtbar** (3–7 von 7 Prompts). Kein Lead, nie anschreiben. |
| doctolib.de · 2te-zahnarztmeinung.de | Portale. |

## Offene Leads aus dem Sweep (noch nicht kontaktiert)

| Domain | Bemerkung |
|--------|-----------|
| stb-beispiel-a.example | Einzelkanzlei, gute Zielgröße |
| stb-beispiel-b.example | Einzelkanzlei |
| stb-beispiel-c.example | überregionale Gruppe, eher nachrangig |
| unklar-a.example | Titel unklar, vor Kontakt manuell prüfen |
| unklar-b.example | Titel unklar, vor Kontakt manuell prüfen |
| netzwerk-beispiel.example | Impressum-Adresse ist Spam-Falle; internationales Netzwerk → kein KMU-Lead |
| weltkonzern-beispiel.example | Weltkonzern → kein Lead |
| ing-beispiel-a.example · ing-beispiel-b.example · ing-beispiel-c.example | Ingenieurbüros Industriebau → Argument trägt nicht, **nicht anschreiben** |
| grossbuero-beispiel.example · auswaerts-beispiel.example | Großbüro bzw. außerhalb MS → nachrangig |

## Statusdefinitionen
`Kontaktiert` → `Geantwortet` → `Auswertung geschickt` → `Gespräch` → `Angebot` → `Kunde` / `Abgelehnt` / `Kein Interesse`

## Regeln
- Nach Erstkontakt genau **ein** Follow-up (7 Tage), danach Kontakt schließen.
- Bei Widerspruch: sofort in Sperrliste, nie wieder kontaktieren.
- Wöchentlicher Rhythmus: Mo 5 Bestandskontakte · Di Sweep + 3 Neukontakte · Do Follow-ups · Fr Pipeline sichten.

## Sperrliste (kein Kontakt mehr)

| Domain | Grund |
|--------|-------|
| zahnarztpraxis-beispiel.example (Praxis in Dortmund, Impressum geprüft) | **Werbewiderspruch im Impressum** — untersagt ausdrücklich unaufgeforderte Werbe-E-Mails. Vor dem Versand entdeckt, nie kontaktiert. Nie anschreiben. |
| ~~alte-domain-beispiel.example~~ | Betrieb aufgegeben, Domain abgelaufen — durchgestrichen statt gelöscht, damit die Sperre nicht durch einen Neu-Sweep zurückkommt. |
