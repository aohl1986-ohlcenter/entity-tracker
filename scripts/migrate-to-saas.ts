// Einmalige, idempotente SaaS-Migration: hardcodete Config (data/*.ts) → DB.
// - Citation-Prompts + Wunschlinks in die neuen Tabellen
// - Tenant-Backfill (plan/status/reportEmails) NUR wo noch Default
// - Passwörter aus AUTH_ENTITIES → scrypt-Hash (Login funktioniert unverändert)
// Lauf: npx tsx scripts/migrate-to-saas.ts

import "./_env";
import { db } from "../lib/db";
import { entities, citationPrompts, wantedLinks } from "../lib/schema";
import { SEED_ENTITIES } from "../data/entities";
import { hashPassword } from "../lib/password";
import { eq, and, sql } from "drizzle-orm";

/** AUTH_ENTITIES-Parser (gleiche Logik wie lib/auth.ts entityPasswordMap). */
function parseAuthEntities(): Record<string, string> {
  const raw = process.env.AUTH_ENTITIES?.trim();
  if (!raw) return {};
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
    } catch {
      return {};
    }
  }
  const map: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const i = pair.indexOf(":");
    if (i <= 0) continue;
    const slug = pair.slice(0, i).trim();
    const pw = pair.slice(i + 1).trim();
    if (slug && pw) map[slug] = pw;
  }
  return map;
}

/** Backfill-Zielwerte pro bestehendem Tenant. */
const TENANT_BACKFILL: Record<
  string,
  { plan: string; status: string; reportEmails: string[]; notes?: string }
> = {
  // Jens nutzt heute Verdrängungs-Analyse + Wunschlink-KPI → insights,
  // sonst würden Features wegfallen.
  "jens-langkammer": {
    plan: "insights",
    status: "active",
    reportEmails: process.env.ALERT_EMAIL_TO ? [process.env.ALERT_EMAIL_TO] : [],
  },
  "alexander-ohl": {
    plan: "suite",
    status: "active",
    reportEmails: [],
    notes: "intern/Operator",
  },
};

async function main() {
  let failures = 0;
  const passwords = parseAuthEntities();

  for (const bundle of SEED_ENTITIES) {
    const slug = bundle.entity.slug;
    const entity = (
      await db.select().from(entities).where(eq(entities.slug, slug)).limit(1)
    )[0];
    if (!entity) {
      console.error(`✗ Entity ${slug} existiert nicht in der DB — Abbruch für diesen Eintrag.`);
      failures++;
      continue;
    }
    console.log(`\n=== ${slug} (#${entity.id}) ===`);

    // 1) Citation-Prompts
    if (bundle.citationPrompts.length > 0) {
      await db
        .insert(citationPrompts)
        .values(
          bundle.citationPrompts.map((p) => ({
            entityId: entity.id,
            query: p.query,
            topic: p.topic,
          })),
        )
        .onConflictDoNothing();
    }
    const promptCount = (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(citationPrompts)
        .where(eq(citationPrompts.entityId, entity.id))
    )[0].n;
    console.log(`  Prompts:     Code=${bundle.citationPrompts.length}  DB=${promptCount}`);
    if (promptCount < bundle.citationPrompts.length) failures++;

    // 2) Wunschlinks
    if (bundle.wantedLinks.length > 0) {
      await db
        .insert(wantedLinks)
        .values(
          bundle.wantedLinks.map((w) => ({
            entityId: entity.id,
            label: w.label,
            pattern: w.pattern,
          })),
        )
        .onConflictDoNothing();
    }
    const linkCount = (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(wantedLinks)
        .where(eq(wantedLinks.entityId, entity.id))
    )[0].n;
    console.log(`  Wunschlinks: Code=${bundle.wantedLinks.length}  DB=${linkCount}`);
    if (linkCount < bundle.wantedLinks.length) failures++;

    // 3) Tenant-Backfill — nur wo noch Default (idempotent, überschreibt
    //    keine späteren Admin-Änderungen)
    const target = TENANT_BACKFILL[slug];
    if (target) {
      const updates: Partial<typeof entities.$inferInsert> = {};
      if (entity.plan === "radar" && target.plan !== "radar") updates.plan = target.plan;
      if ((entity.reportEmails ?? []).length === 0 && target.reportEmails.length > 0)
        updates.reportEmails = target.reportEmails;
      if (!entity.notes && target.notes) updates.notes = target.notes;
      if (Object.keys(updates).length > 0) {
        await db.update(entities).set(updates).where(eq(entities.id, entity.id));
        console.log(`  Backfill:    ${JSON.stringify(updates)}`);
      } else {
        console.log(`  Backfill:    nichts zu tun (bereits gesetzt)`);
      }
    }

    // 4) Passwort-Hash aus AUTH_ENTITIES (nur wenn noch keiner existiert)
    if (!entity.passwordHash && passwords[slug]) {
      await db
        .update(entities)
        .set({ passwordHash: hashPassword(passwords[slug]) })
        .where(and(eq(entities.id, entity.id), sql`password_hash IS NULL`));
      console.log(`  Passwort:    aus AUTH_ENTITIES gehasht → DB`);
    } else if (entity.passwordHash) {
      console.log(`  Passwort:    Hash existiert bereits`);
    } else {
      console.log(`  Passwort:    ⚠ kein Eintrag in AUTH_ENTITIES — Login bleibt deaktiviert`);
    }
  }

  // Abschluss-Summary
  console.log(`\n=== Summary ===`);
  const all = await db
    .select({
      slug: entities.slug,
      plan: entities.plan,
      status: entities.status,
      reportEmails: entities.reportEmails,
      hasPassword: sql<boolean>`password_hash IS NOT NULL`,
    })
    .from(entities);
  for (const e of all) {
    console.log(
      `  ${e.slug.padEnd(18)} plan=${e.plan.padEnd(9)} status=${e.status.padEnd(7)} mails=${(e.reportEmails ?? []).length} pw=${e.hasPassword ? "✓" : "—"}`,
    );
  }

  if (failures > 0) {
    console.error(`\n✗ ${failures} Problem(e) — bitte prüfen.`);
    process.exit(1);
  }
  console.log("\n✓ Migration ok.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
