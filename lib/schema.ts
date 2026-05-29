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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byEntity: index("keywords_entity_idx").on(t.entityId),
    uniq: uniqueIndex("keywords_uniq").on(t.entityId, t.query, t.locale, t.device),
  }),
);

export const targetUrls = pgTable("target_urls", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id")
    .references(() => entities.id, { onDelete: "cascade" })
    .notNull(),
  pattern: text("pattern").notNull(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  topics: jsonb("topics").$type<string[]>().default([]).notNull(),
});

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

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id")
    .references(() => entities.id, { onDelete: "cascade" })
    .notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export type Entity = typeof entities.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type TargetUrl = typeof targetUrls.$inferSelect;
export type SerpSnapshot = typeof serpSnapshots.$inferSelect;
export type SerpResult = typeof serpResults.$inferSelect;
export type AiCitation = typeof aiCitations.$inferSelect;
