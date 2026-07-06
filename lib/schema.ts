import {
  pgTable,
  serial,
  text,
  integer,
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
