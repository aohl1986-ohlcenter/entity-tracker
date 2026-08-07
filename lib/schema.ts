import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const entities = pgTable("entities", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // ── SaaS-Tenant-Felder (Pakete: lib/plans.ts) ──
  plan: text("plan").default("radar").notNull(),
  status: text("status").default("active").notNull(),
  /** Empfänger der Kunden-Reports/Digests (Ops-Mails bleiben global). */
  reportEmails: jsonb("report_emails").$type<string[]>().default([]).notNull(),
  /** scrypt-Hash (lib/password.ts); null = Kunden-Login deaktiviert. */
  passwordHash: text("password_hash"),
  company: text("company"),
  notes: text("notes"),
  /** Operator-gepflegte GEO-Empfehlungen (Insights+), Markdown/Plaintext. */
  geoNotes: text("geo_notes"),
});

export const keywords = pgTable(
  "keywords",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .references(() => entities.id, { onDelete: "cascade" })
      .notNull(),
    query: text("query").notNull(),
    cluster: text("cluster").notNull(),
    locale: text("locale").default("de").notNull(),
    location: text("location").default("Germany").notNull(),
    device: text("device").default("desktop").notNull(),
    /** 0 = deaktiviert (z. B. Plan-Downgrade) — Historie bleibt erhalten. */
    active: integer("active").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byEntity: index("keywords_entity_idx").on(t.entityId),
    uniq: uniqueIndex("keywords_uniq").on(t.entityId, t.query, t.locale, t.device),
  }),
);

export const targetUrls = pgTable(
  "target_urls",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .references(() => entities.id, { onDelete: "cascade" })
      .notNull(),
    pattern: text("pattern").notNull(),
    label: text("label").notNull(),
    category: text("category").notNull(),
    topics: jsonb("topics").$type<string[]>().default([]).notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("target_urls_uniq").on(t.entityId, t.pattern),
  }),
);

/** AI-Citation-Prompts pro Tenant (früher hardcoded in data/*.ts). */
export const citationPrompts = pgTable(
  "citation_prompts",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .references(() => entities.id, { onDelete: "cascade" })
      .notNull(),
    query: text("query").notNull(),
    topic: text("topic").notNull(),
    active: integer("active").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byEntity: index("citation_prompts_entity_idx").on(t.entityId),
    uniq: uniqueIndex("citation_prompts_uniq").on(t.entityId, t.query),
  }),
);

/** Wunschlinks (Insights+): Publikationen, die auf Seite 1 ranken sollen. */
export const wantedLinks = pgTable(
  "wanted_links",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .references(() => entities.id, { onDelete: "cascade" })
      .notNull(),
    label: text("label").notNull(),
    pattern: text("pattern").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byEntity: index("wanted_links_entity_idx").on(t.entityId),
    uniq: uniqueIndex("wanted_links_uniq").on(t.entityId, t.pattern),
  }),
);

/** API-Nutzung pro Tag/Tenant/Engine — Kapazitätsplanung im Admin. */
export const apiUsage = pgTable(
  "api_usage",
  {
    id: serial("id").primaryKey(),
    /** Kalendertag UTC, Format YYYY-MM-DD. */
    day: text("day").notNull(),
    entityId: integer("entity_id")
      .references(() => entities.id, { onDelete: "cascade" })
      .notNull(),
    engine: text("engine").notNull(),
    calls: integer("calls").default(0).notNull(),
    failures: integer("failures").default(0).notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("api_usage_uniq").on(t.day, t.entityId, t.engine),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// LLM-Observability: Pro-Lauf-Tracing + Kostenzuordnung
//
// `api_usage` (oben) bleibt unangetastet und wird parallel weitergeschrieben —
// die drei Tabellen hier legen sich additiv daneben. Sie beantworten, was das
// Tagesaggregat nicht kann: Was hat EIN Lauf gekostet, welcher Prompt treibt
// die Kosten, wie lange dauert ein Aufruf, und welcher Lauf hat ein bestimmtes
// Citation-Ergebnis erzeugt.
//
// Kosten stehen durchgängig in NANO-USD (1e-9 USD) als bigint. Integer statt
// Float vermeidet Rundungsdrift beim Aufsummieren; Nano statt Mikro, weil ein
// einzelner nova-lite-Aufruf sonst auf wenige Einheiten zusammenschnurrt.
// Umrechnung in EUR passiert erst bei der Anzeige (lib/kosten.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** Ein Lauf (ein Job-Durchgang für einen Mandanten) — Klammer um die Einzelvorgänge. */
export const llmRuns = pgTable(
  "llm_runs",
  {
    id: serial("id").primaryKey(),
    /** Fachliche Lauf-ID, über die `llm_calls` gruppiert werden. */
    runId: text("run_id").notNull(),
    entityId: integer("entity_id")
      .references(() => entities.id, { onDelete: "cascade" })
      .notNull(),
    /** "fetch_serps" | "check_citations" */
    art: text("art").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    /** null = Lauf abgebrochen, bevor er sich abmelden konnte. */
    finishedAt: timestamp("finished_at"),
    ok: integer("ok").default(0).notNull(),
    calls: integer("calls").default(0).notNull(),
    failures: integer("failures").default(0).notNull(),
    costNanoUsd: bigint("cost_nano_usd", { mode: "number" }).default(0).notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("llm_runs_uniq").on(t.runId),
    byEntity: index("llm_runs_entity_idx").on(t.entityId, t.startedAt),
  }),
);

/** Ein einzelner LLM-/SERP-Aufruf. Retention 90 Tage (lib/prune.ts). */
export const llmCalls = pgTable(
  "llm_calls",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id").notNull(),
    /** Laufende Nummer innerhalb des Laufs, ab 1. Zusammen mit runId eindeutig. */
    seq: integer("seq").notNull(),
    /**
     * Verschachtelung über `seq`, nicht über die Serial-ID: Bedrock holt sich
     * sein Grounding selbst über Serper (lib/bedrock.ts). Dieser Abruf wird als
     * eigener Vorgang geführt und hängt über `parentSeq` an seinem Bedrock-
     * Vorgang — sonst wäre er entweder unsichtbar oder fälschlich als
     * eigenständiger Abruf gezählt.
     *
     * Warum `seq` und nicht die `id`: die Zeilen werden gebündelt eingefügt,
     * die Serial-IDs stehen also erst NACH dem Insert fest. `seq` ist vorher
     * bekannt und spart den Nachtrag-Roundtrip.
     */
    parentSeq: integer("parent_seq"),
    entityId: integer("entity_id")
      .references(() => entities.id, { onDelete: "cascade" })
      .notNull(),
    engine: text("engine").notNull(),
    /** null bei reinen Such-APIs (Serper/Tavily/Brave) — dort gibt es kein Modell. */
    model: text("model"),
    /** "serp_keyword" | "citation_prompt" | "grounding_serp" */
    operation: text("operation").notNull(),
    /** Der Anlass: das Keyword bzw. die Prompt-Query. Die Kostenursache. */
    anlass: text("anlass").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    /** Kalendertag UTC YYYY-MM-DD — gleiche Konvention wie api_usage. */
    day: text("day").notNull(),
    /** YYYY-MM, denormalisiert für Monatsauswertung ohne Datumsarithmetik. */
    month: text("month").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    ok: integer("ok").notNull(),
    fehler: text("fehler"),
    /** NULL = die API liefert keine Token-Zahlen. Wird NICHT geschätzt. */
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    /** "api" | "nicht_verfuegbar" — macht die NULLs oben lesbar. */
    tokenQuelle: text("token_quelle").notNull(),
    costNanoUsd: bigint("cost_nano_usd", { mode: "number" }).default(0).notNull(),
    /** "token" | "call" | "unbekannt" — bei "unbekannt" ist der Betrag 0 und bedeutet nicht "gratis". */
    costModell: text("cost_modell").notNull(),
    /** `gueltigAb` der angewandten Preiszeile, auf der Zeile eingefroren. */
    preisStand: text("preis_stand"),
    /**
     * Ergebnis → Lauf. Bewusst OHNE Foreign Key: der Trace soll das Prunen der
     * Ergebnisse überleben und nicht per Cascade mitgelöscht werden.
     */
    aiCitationId: integer("ai_citation_id"),
    serpSnapshotId: integer("serp_snapshot_id"),
  },
  (t) => ({
    byEntityMonth: index("llm_calls_entity_month_idx").on(t.entityId, t.month),
    uniq: uniqueIndex("llm_calls_uniq").on(t.runId, t.seq),
    byRun: index("llm_calls_run_idx").on(t.runId),
    byDay: index("llm_calls_day_idx").on(t.day),
  }),
);

/**
 * Monatsverdichtung pro Mandant × Engine × Modell.
 *
 * Überlebt die 90-Tage-Retention der Einzelvorgänge und trägt damit die
 * Monatsberichte. Wird beim Laufende fortgeschrieben; weil neon-http keine
 * Transaktionen kennt, ist sie jederzeit aus `llm_calls` neu berechenbar —
 * siehe scripts/rebuild-cost-rollup.ts.
 */
export const llmCostMonthly = pgTable(
  "llm_cost_monthly",
  {
    id: serial("id").primaryKey(),
    /** YYYY-MM */
    month: text("month").notNull(),
    entityId: integer("entity_id")
      .references(() => entities.id, { onDelete: "cascade" })
      .notNull(),
    engine: text("engine").notNull(),
    /** "" statt NULL — NULL würde im Unique-Index nicht deduplizieren. */
    model: text("model").default("").notNull(),
    calls: integer("calls").default(0).notNull(),
    failures: integer("failures").default(0).notNull(),
    tokensIn: integer("tokens_in").default(0).notNull(),
    tokensOut: integer("tokens_out").default(0).notNull(),
    costNanoUsd: bigint("cost_nano_usd", { mode: "number" }).default(0).notNull(),
    /** Aufrufe ohne bezifferbaren Preis — macht Lücken sichtbar statt sie zu verstecken. */
    unbekannteKosten: integer("unbekannte_kosten").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("llm_cost_monthly_uniq").on(t.month, t.entityId, t.engine, t.model),
    byEntity: index("llm_cost_monthly_entity_idx").on(t.entityId, t.month),
  }),
);

export const serpSnapshots = pgTable(
  "serp_snapshots",
  {
    id: serial("id").primaryKey(),
    keywordId: integer("keyword_id")
      .references(() => keywords.id, { onDelete: "cascade" })
      .notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    dominationScore: integer("domination_score").notNull(),
    ownedCount: integer("owned_count").notNull(),
    authorityCount: integer("authority_count").notNull(),
    displacementCount: integer("displacement_count").notNull(),
    raw: jsonb("raw").notNull(),
  },
  (t) => ({
    byKeyword: index("snapshots_keyword_idx").on(t.keywordId, t.fetchedAt),
  }),
);

export const serpResults = pgTable("serp_results", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id")
    .references(() => serpSnapshots.id, { onDelete: "cascade" })
    .notNull(),
  position: integer("position").notNull(),
  url: text("url").notNull(),
  domain: text("domain").notNull(),
  title: text("title"),
  snippet: text("snippet"),
  classification: text("classification").notNull(),
  matchedLabel: text("matched_label"),
});

export const aiCitations = pgTable("ai_citations", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id")
    .references(() => entities.id, { onDelete: "cascade" })
    .notNull(),
  engine: text("engine").notNull(),
  query: text("query").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  responseText: text("response_text"),
  citedUrls: jsonb("cited_urls")
    .$type<{ url: string; title?: string; classification: string }[]>()
    .notNull(),
  ownedHits: integer("owned_hits").notNull(),
  authorityHits: integer("authority_hits").notNull(),
  totalCitations: integer("total_citations").notNull(),
});

export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .references(() => entities.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    dedupKey: text("dedup_key").notNull(),
    subject: text("subject").notNull(),
    payload: jsonb("payload").notNull(),
    emailSent: integer("email_sent").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => ({
    byEntity: index("alerts_entity_idx").on(t.entityId, t.createdAt),
    byDedup: index("alerts_dedup_idx").on(t.entityId, t.dedupKey, t.createdAt),
  }),
);

export type Entity = typeof entities.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type TargetUrl = typeof targetUrls.$inferSelect;
export type CitationPromptRow = typeof citationPrompts.$inferSelect;
export type WantedLinkRow = typeof wantedLinks.$inferSelect;
export type ApiUsageRow = typeof apiUsage.$inferSelect;
export type SerpSnapshot = typeof serpSnapshots.$inferSelect;
export type SerpResult = typeof serpResults.$inferSelect;
export type AiCitation = typeof aiCitations.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type LlmRun = typeof llmRuns.$inferSelect;
export type LlmCall = typeof llmCalls.$inferSelect;
export type LlmCostMonthlyRow = typeof llmCostMonthly.$inferSelect;
