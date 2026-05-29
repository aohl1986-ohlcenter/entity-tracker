export type SeedKeyword = {
  query: string;
  cluster: "name" | "name_topic" | "topic";
};

export type SeedTarget = {
  pattern: string;
  label: string;
  category: "owned" | "authority" | "displacement";
  topics?: string[];
};

export const ENTITY = {
  slug: "jens-langkammer",
  name: "Jens Langkammer",
};

export const KEYWORDS: SeedKeyword[] = [
  // 1) reiner Name
  { query: "Jens Langkammer", cluster: "name" },
  { query: '"Jens Langkammer"', cluster: "name" },
  { query: "Jens Langkammer LinkedIn", cluster: "name" },

  // 2) Name + Fachgebiet
  { query: "Jens Langkammer e-Grocery", cluster: "name_topic" },
  { query: "Jens Langkammer Strategy&", cluster: "name_topic" },
  { query: "Jens Langkammer PwC", cluster: "name_topic" },
  { query: "Jens Langkammer Consumer Markets", cluster: "name_topic" },
  { query: "Jens Langkammer Retail Media", cluster: "name_topic" },
  { query: "Jens Langkammer Lieferdienste", cluster: "name_topic" },

  // 3) Fachthemen ohne Namen (Entity-Visibility / Topic-Authority)
  { query: "e-Grocery Markt Deutschland Studie", cluster: "topic" },
  { query: "future of grocery shopping", cluster: "topic" },
  { query: "Retail Media Strategie B2B", cluster: "topic" },
  { query: "Quick Commerce Frankreich Gesetz", cluster: "topic" },
  { query: "Embedded Insurance Loyalty", cluster: "topic" },
  { query: "ROI of Customer Data", cluster: "topic" },
];

export const TARGETS: SeedTarget[] = [
  // ─── OWNED (eigene Profile / Posts) ────────────────────────────────────
  {
    pattern: "linkedin.com/in/jens-langkammer",
    label: "LinkedIn Profil",
    category: "owned",
  },
  {
    pattern: "linkedin.com/in/jens-langkammer/details/featured",
    label: "LinkedIn Featured",
    category: "owned",
  },
  {
    pattern: "linkedin.com/feed/update/urn:li:activity:7061766765919236097",
    label: "LinkedIn Post 2023",
    category: "owned",
  },
  {
    pattern: "linkedin.com/feed/update/urn:li:activity:7186995974907527168",
    label: "LinkedIn Post 2024",
    category: "owned",
  },
  {
    pattern: "linkedin.com/feed/update/urn:li:activity:7315259711858049026",
    label: "LinkedIn Post 2025 a",
    category: "owned",
  },
  {
    pattern: "linkedin.com/feed/update/urn:li:activity:7312369440891850752",
    label: "LinkedIn Post 2025 b",
    category: "owned",
  },

  // ─── AUTHORITY (PwC / Strategy& / WiWo / SSRN / Fachpresse) ────────────
  {
    pattern: "strategyand.pwc.com/de/en/industries/consumer-markets/the-state-of-the-egrocery-market.html",
    label: "Strategy&: State of e-Grocery",
    category: "authority",
    topics: ["e-Grocery", "Consumer Markets"],
  },
  {
    pattern: "strategyand.pwc.com/de/en/industries/consumer-markets/future-of-grocery-shopping.html",
    label: "Strategy&: Future of Grocery",
    category: "authority",
    topics: ["e-Grocery", "Consumer Markets"],
  },
  {
    pattern: "strategyand.pwc.com/de/en/industries/consumer-markets/roi-of-customer-data.html",
    label: "Strategy&: ROI of Customer Data",
    category: "authority",
    topics: ["Retail Media", "Customer Data"],
  },
  {
    pattern: "strategyand.pwc.com/de/en/functions/sustainability-strategy/metaverse-after-the-hype.html",
    label: "Strategy&: Metaverse after the Hype",
    category: "authority",
    topics: ["Sustainability"],
  },
  {
    pattern: "strategyand.pwc.com/de/en/industries/financial-services/embedded-insurance-with-loyalty-leaders.html",
    label: "Strategy&: Embedded Insurance",
    category: "authority",
    topics: ["Embedded Insurance"],
  },
  {
    pattern: "strategyand.pwc.com/de/en/*",
    label: "Strategy& (sonstige)",
    category: "authority",
    topics: ["Consumer Markets"],
  },
  {
    pattern: "pwc.com/co/es/prensa/Articulos/strategy-and-future-of-health.pdf",
    label: "PwC: Future of Health",
    category: "authority",
    topics: ["Health"],
  },
  {
    pattern: "pwc.de/de/pressemitteilungen/2025/lebensmittel-per-klick-jeder-sechste-euro-landet-im-online-einkaufswagen.html",
    label: "PwC PM: Lebensmittel per Klick 2025",
    category: "authority",
    topics: ["e-Grocery"],
  },
  {
    pattern: "pwc.de/de/handel-und-konsumguter/voice-of-the-consumer-survey-2025.pdf",
    label: "PwC: Voice of the Consumer 2025",
    category: "authority",
    topics: ["Consumer Markets"],
  },
  {
    pattern: "pwc.de/de/pressemitteilungen/*",
    label: "PwC PM (sonstige)",
    category: "authority",
  },
  {
    pattern: "wiwo.de/unternehmen/dienstleister/lieferdienst-warenlager-in-frankreich-vor-dem-aus-dieses-neue-gesetz-stellt-gorillas-und-flink-vor-probleme-in-frankreich/28677718.html",
    label: "WiWo: Gorillas/Flink Frankreich",
    category: "authority",
    topics: ["Quick Commerce", "Lieferdienste"],
  },
  {
    pattern: "wiwo.de/*",
    label: "WiWo (sonstige)",
    category: "authority",
  },
  {
    pattern: "papers.ssrn.com/sol3/papers.cfm",
    label: "SSRN Paper",
    category: "authority",
    topics: ["Research"],
  },
  {
    pattern: "diepresse.com/18706002",
    label: "Die Presse: Streetwear",
    category: "authority",
  },
  {
    pattern: "neuhandeln.de/beitraege/*",
    label: "neuhandeln Beitrag",
    category: "authority",
    topics: ["e-Commerce"],
  },
  {
    pattern: "linkedin.com/posts/andreas-spaene_strategy-the-future-of-grocery-shopping-activity-6976193400203059200-uLg3",
    label: "LinkedIn-Repost Spaene (Future of Grocery)",
    category: "authority",
  },

  // ─── DISPLACEMENT (zu verdrängen) ──────────────────────────────────────
  { pattern: "yasni.de/*", label: "Yasni", category: "displacement" },
  { pattern: "yasni.com/*", label: "Yasni .com", category: "displacement" },
  { pattern: "11880.com/*", label: "11880", category: "displacement" },
  { pattern: "dasoertliche.de/*", label: "Das Örtliche", category: "displacement" },
  { pattern: "dastelefonbuch.de/*", label: "Das Telefonbuch", category: "displacement" },
  { pattern: "namepedia.org/*", label: "Namepedia", category: "displacement" },
  { pattern: "verwandt.de/*", label: "Verwandt.de", category: "displacement" },
  { pattern: "moneyhouse.de/*", label: "Moneyhouse (Privat)", category: "displacement" },
  { pattern: "northdata.de/*", label: "Northdata", category: "displacement" },
];

export const AI_CITATION_PROMPTS: { engine: "gemini"; query: string; topic: string }[] = [
  {
    engine: "gemini",
    topic: "e-Grocery DE",
    query:
      "Wer sind die führenden Strategieberater und Analysten zum Thema e-Grocery in Deutschland? Bitte mit Quellen.",
  },
  {
    engine: "gemini",
    topic: "Future of Grocery Shopping",
    query:
      "Was sind die zentralen Studien und Autoren zum Thema 'Future of Grocery Shopping'? Bitte konkrete Quellen nennen.",
  },
  {
    engine: "gemini",
    topic: "Quick Commerce Frankreich",
    query:
      "Welche aktuellen Analysen gibt es zu Quick Commerce Anbietern wie Gorillas und Flink in Frankreich und der neuen Regulierung? Quellen bitte.",
  },
  {
    engine: "gemini",
    topic: "Retail Media",
    query:
      "Wer sind anerkannte Experten und welche Studien gibt es zu Retail Media Strategien im DACH-Raum? Quellen bitte.",
  },
  {
    engine: "gemini",
    topic: "Person",
    query: "Wer ist Jens Langkammer und welche Fachthemen vertritt er? Bitte mit Quellen.",
  },
];
