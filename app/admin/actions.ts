"use server";

// Alle Admin-Mutationen. Jede Action beginnt mit requireAdmin()
// (Defense-in-Depth zusätzlich zur Middleware).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  entities,
  keywords,
  targetUrls,
  citationPrompts,
  wantedLinks,
} from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-session";
import { hashPassword, generatePassword } from "@/lib/password";
import { isValidTenantSlug, RESERVED_SLUGS } from "@/lib/auth";
import { planFor, PLAN_IDS, TENANT_STATUSES } from "@/lib/plans";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

async function activeKeywordCount(entityId: number): Promise<number> {
  return (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(keywords)
      .where(and(eq(keywords.entityId, entityId), eq(keywords.active, 1)))
  )[0].n;
}

// ── Tenants ──────────────────────────────────────────────────────────────────

export async function createTenant(formData: FormData) {
  await requireAdmin();
  const name = str(formData, "name");
  const slug = str(formData, "slug").toLowerCase();
  const plan = str(formData, "plan");
  const status = str(formData, "status");
  const company = str(formData, "company");
  const reportEmails = parseEmails(str(formData, "reportEmails"));

  if (!name) redirect("/admin/tenants/new?error=name");
  if (!isValidTenantSlug(slug))
    redirect(`/admin/tenants/new?error=slug&hint=${RESERVED_SLUGS.has(slug) ? "reserved" : "format"}`);
  if (!PLAN_IDS.includes(plan as (typeof PLAN_IDS)[number])) redirect("/admin/tenants/new?error=plan");
  if (!TENANT_STATUSES.includes(status as (typeof TENANT_STATUSES)[number]))
    redirect("/admin/tenants/new?error=status");

  let created: { id: number };
  try {
    [created] = await db
      .insert(entities)
      .values({ name, slug, plan, status, company: company || null, reportEmails })
      .returning({ id: entities.id });
  } catch (err) {
    // unique violation auf slug
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
      redirect("/admin/tenants/new?error=slug-taken");
    }
    throw err;
  }
  revalidatePath("/admin");
  redirect(`/admin/tenants/${created.id}`);
}

export async function updateTenant(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const name = str(formData, "name");
  const plan = str(formData, "plan");
  const status = str(formData, "status");
  const company = str(formData, "company");
  const notes = str(formData, "notes");
  const reportEmails = parseEmails(str(formData, "reportEmails"));

  if (!id || !name) redirect(`/admin/tenants/${id}?error=invalid`);
  if (!PLAN_IDS.includes(plan as (typeof PLAN_IDS)[number])) redirect(`/admin/tenants/${id}?error=plan`);
  if (!TENANT_STATUSES.includes(status as (typeof TENANT_STATUSES)[number]))
    redirect(`/admin/tenants/${id}?error=status`);

  await db
    .update(entities)
    .set({ name, plan, status, company: company || null, notes: notes || null, reportEmails })
    .where(eq(entities.id, id));
  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${id}`);
  redirect(`/admin/tenants/${id}?saved=1`);
}

export async function saveGeoNotes(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const geoNotes = String(formData.get("geoNotes") ?? "").trim();
  if (!id) redirect("/admin");
  await db.update(entities).set({ geoNotes: geoNotes || null }).where(eq(entities.id, id));
  revalidatePath(`/admin/tenants/${id}`);
  redirect(`/admin/tenants/${id}?saved=1`);
}

export async function deleteTenant(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const confirmSlug = str(formData, "confirmSlug");
  const entity = (await db.select().from(entities).where(eq(entities.id, id)).limit(1))[0];
  if (!entity) redirect("/admin");
  if (confirmSlug !== entity.slug) redirect(`/admin/tenants/${id}?error=confirm`);
  await db.delete(entities).where(eq(entities.id, id)); // FK-Cascade räumt alles ab
  revalidatePath("/admin");
  redirect("/admin?deleted=1");
}

// ── Passwort (via useActionState — Einmal-Anzeige ohne URL-Leak) ─────────────

export type PasswordActionState = { password?: string; error?: string; saved?: boolean };

export async function generateTenantPassword(
  _prev: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  if (!id) return { error: "Ungültige Tenant-ID." };
  const password = generatePassword();
  await db.update(entities).set({ passwordHash: hashPassword(password) }).where(eq(entities.id, id));
  // Klartext wird NICHT gespeichert — nur diese eine Response zeigt ihn.
  return { password };
}

export async function setTenantPassword(
  _prev: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const password = String(formData.get("password") ?? "");
  if (!id) return { error: "Ungültige Tenant-ID." };
  if (password.length < 10) return { error: "Mindestens 10 Zeichen." };
  await db.update(entities).set({ passwordHash: hashPassword(password) }).where(eq(entities.id, id));
  return { saved: true };
}

// ── Keywords ─────────────────────────────────────────────────────────────────

export async function addKeyword(formData: FormData) {
  await requireAdmin();
  const entityId = Number(str(formData, "entityId"));
  const query = str(formData, "query");
  const cluster = str(formData, "cluster") || "topic";
  const entity = (await db.select().from(entities).where(eq(entities.id, entityId)).limit(1))[0];
  if (!entity || !query) redirect(`/admin/tenants/${entityId}?error=invalid`);

  const limit = planFor(entity.plan).maxKeywords;
  const active = await activeKeywordCount(entityId);
  if (active >= limit) redirect(`/admin/tenants/${entityId}?error=kw-limit`);

  await db.insert(keywords).values({ entityId, query, cluster }).onConflictDoNothing();
  revalidatePath(`/admin/tenants/${entityId}`);
  redirect(`/admin/tenants/${entityId}?saved=1`);
}

export async function toggleKeyword(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const entityId = Number(str(formData, "entityId"));
  const kw = (await db.select().from(keywords).where(eq(keywords.id, id)).limit(1))[0];
  if (!kw) redirect(`/admin/tenants/${entityId}`);

  if (kw.active === 0) {
    // Aktivieren nur, wenn Plan-Limit nicht überschritten würde
    const entity = (await db.select().from(entities).where(eq(entities.id, entityId)).limit(1))[0];
    const limit = planFor(entity?.plan).maxKeywords;
    const active = await activeKeywordCount(entityId);
    if (active >= limit) redirect(`/admin/tenants/${entityId}?error=kw-limit`);
  }
  await db.update(keywords).set({ active: kw.active === 1 ? 0 : 1 }).where(eq(keywords.id, id));
  revalidatePath(`/admin/tenants/${entityId}`);
  redirect(`/admin/tenants/${entityId}`);
}

export async function deleteKeyword(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const entityId = Number(str(formData, "entityId"));
  await db.delete(keywords).where(eq(keywords.id, id)); // Cascade löscht Snapshot-Historie!
  revalidatePath(`/admin/tenants/${entityId}`);
  redirect(`/admin/tenants/${entityId}`);
}

// ── Ziel-URLs ────────────────────────────────────────────────────────────────

export async function addTarget(formData: FormData) {
  await requireAdmin();
  const entityId = Number(str(formData, "entityId"));
  const pattern = str(formData, "pattern");
  const label = str(formData, "label");
  const category = str(formData, "category");
  if (!entityId || !pattern || !label || !["owned", "authority", "displacement"].includes(category))
    redirect(`/admin/tenants/${entityId}?error=invalid`);
  await db
    .insert(targetUrls)
    .values({ entityId, pattern, label, category, topics: [] })
    .onConflictDoNothing();
  revalidatePath(`/admin/tenants/${entityId}`);
  redirect(`/admin/tenants/${entityId}?saved=1`);
}

export async function deleteTarget(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const entityId = Number(str(formData, "entityId"));
  await db.delete(targetUrls).where(eq(targetUrls.id, id));
  revalidatePath(`/admin/tenants/${entityId}`);
  redirect(`/admin/tenants/${entityId}`);
}

// ── Citation-Prompts ─────────────────────────────────────────────────────────

export async function addPrompt(formData: FormData) {
  await requireAdmin();
  const entityId = Number(str(formData, "entityId"));
  const query = str(formData, "query");
  const topic = str(formData, "topic") || "allgemein";
  if (!entityId || !query) redirect(`/admin/tenants/${entityId}?error=invalid`);
  await db.insert(citationPrompts).values({ entityId, query, topic }).onConflictDoNothing();
  revalidatePath(`/admin/tenants/${entityId}`);
  redirect(`/admin/tenants/${entityId}?saved=1`);
}

export async function togglePrompt(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const entityId = Number(str(formData, "entityId"));
  const row = (await db.select().from(citationPrompts).where(eq(citationPrompts.id, id)).limit(1))[0];
  if (row)
    await db
      .update(citationPrompts)
      .set({ active: row.active === 1 ? 0 : 1 })
      .where(eq(citationPrompts.id, id));
  revalidatePath(`/admin/tenants/${entityId}`);
  redirect(`/admin/tenants/${entityId}`);
}

export async function deletePrompt(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const entityId = Number(str(formData, "entityId"));
  await db.delete(citationPrompts).where(eq(citationPrompts.id, id));
  revalidatePath(`/admin/tenants/${entityId}`);
  redirect(`/admin/tenants/${entityId}`);
}

// ── Wunschlinks ──────────────────────────────────────────────────────────────

export async function addWantedLink(formData: FormData) {
  await requireAdmin();
  const entityId = Number(str(formData, "entityId"));
  const label = str(formData, "label");
  const pattern = str(formData, "pattern");
  if (!entityId || !label || !pattern) redirect(`/admin/tenants/${entityId}?error=invalid`);
  await db.insert(wantedLinks).values({ entityId, label, pattern }).onConflictDoNothing();
  revalidatePath(`/admin/tenants/${entityId}`);
  redirect(`/admin/tenants/${entityId}?saved=1`);
}

export async function deleteWantedLink(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const entityId = Number(str(formData, "entityId"));
  await db.delete(wantedLinks).where(eq(wantedLinks.id, id));
  revalidatePath(`/admin/tenants/${entityId}`);
  redirect(`/admin/tenants/${entityId}`);
}
