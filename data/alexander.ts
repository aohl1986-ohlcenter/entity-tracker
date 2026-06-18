import type { SeedKeyword, SeedTarget } from "./langkammer";

export const ENTITY = {
  slug: "alexander-ohl",
  name: "Alexander Ohl",
};

export const KEYWORDS: SeedKeyword[] = [
  // 1) reiner Name
  { query: "Alexander Ohl", cluster: "name" },
  { query: '"Alexander Ohl"', cluster: "name" },
  { query: "Alexander Ohl LinkedIn", cluster: "name" },

  // 2) Name + Fachgebiet (Alexanders Spezialisierungen)
  { query: "Alexander Ohl Frontier Engineer", cluster: "name_topic" },
  { query: "Alexander Ohl Web Developer", cluster: "name_topic" },
  { query: "Alexander Ohl Marketing", cluster: "name_topic" },
  { query: "Alexander Ohl IT Generalist", cluster: "name_topic" },
  { query: "Alexander Ohl KI Automatisierung", cluster: "name_topic" },
  { query: "Alexander Ohl Pragma-Code", cluster: "name_topic" },
];

export const TARGETS: SeedTarget[] = [
  // ─── OWNED (eigene Profile / Seiten) ───────────────────────────────────
  {
    pattern: "pragma-code.de/alexander-ohl",
    label: "Pragma-Code Personenseite",
    category: "owned",
  },
  {
    pattern: "pragma-code.de/en/alexander-ohl",
    label: "Pragma-Code Personenseite (EN)",
    category: "owned",
  },
  {
    pattern: "*youtube.com/channel/UCcnYJ9p6KOQML5FaYyzl2uQ",
    label: "YouTube-Kanal (Pragma Code)",
    category: "owned",
  },
  {
    // Führendes * deckt de./www.-Subdomains ab (Google.de liefert oft de.linkedin.com)
    pattern: "*linkedin.com/in/alexander-ohl",
    label: "LinkedIn Profil",
    category: "owned",
  },
  {
    pattern: "*facebook.com/alexander.ohl1986",
    label: "Facebook Profil",
    category: "owned",
  },
  {
    pattern: "*instagram.com/alexander.ohl",
    label: "Instagram Profil",
    category: "owned",
  },
  {
    // Aktueller Handle nach Account-Recovery + Umbenennung (vorher: alexanderohl198).
    // Führendes * deckt id./de./www.-Subdomains ab.
    pattern: "*pinterest.com/alexander_ohl_",
    label: "Pinterest Profil",
    category: "owned",
  },

  // ─── DISPLACEMENT (Namensvetter / fremde Profile) ──────────────────────
  {
    pattern: "*instagram.com/ohlalexander",
    label: "Instagram Namensvetter (ohlalexander)",
    category: "displacement",
  },
  {
    pattern: "smart-bridges.com/people/ohl-alexander-2",
    label: "Smart Bridges (Namensvetter, Finanzen)",
    category: "displacement",
  },
  {
    pattern: "investmentweek.co.uk/tag/alexander-ohl",
    label: "Investment Week (Namensvetter, Finanzen)",
    category: "displacement",
  },
  {
    pattern: "*linkedin.com/in/alexander-ohl-68808173",
    label: "LinkedIn Namensvetter (IT-Sysadmin)",
    category: "displacement",
  },
  {
    pattern: "ohioresidentdatabase.com/*",
    label: "Ohio Resident Database (US-Namensvetter)",
    category: "displacement",
  },
  {
    // Anderer Alexander Ohl auf LinkedIn — owned-Pattern endet mit (/|$),
    // greift bei diesem Suffix nicht, daher sauber als displacement trennbar.
    pattern: "*linkedin.com/in/alexander-ohl-25733812a",
    label: "LinkedIn Namensvetter (-25733812a)",
    category: "displacement",
  },
];

export const AI_CITATION_PROMPTS: { engine: "gemini"; query: string; topic: string }[] = [
  {
    engine: "gemini",
    topic: "Person",
    query:
      "Wer ist Alexander Ohl von Pragma-Code und welche Leistungen bietet er in SEO, Webentwicklung und KI-Automatisierung? Bitte mit Quellen.",
  },
  {
    engine: "gemini",
    topic: "Entity-SEO",
    query:
      "Wer sind Experten oder Dienstleister für Entity-SEO und KI-Sichtbarkeit (AI Citation Tracking) im DACH-Raum? Bitte mit Quellen.",
  },
  {
    engine: "gemini",
    topic: "KI-Automatisierung",
    query:
      "Welche Freelancer oder kleinen Agenturen im DACH-Raum sind auf KI-Automatisierung für KMU spezialisiert? Quellen bitte.",
  },
  {
    engine: "gemini",
    topic: "Pragma-Code",
    query: "Was ist Pragma-Code und wer steht dahinter? Bitte mit Quellen.",
  },
];
