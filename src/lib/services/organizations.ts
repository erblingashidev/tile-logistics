import type { Client } from "@libsql/client";
import { and, desc, eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import {
  CATEGORY_PRESETS,
  COMPANY_PROFILE_SETTING_KEY,
  DEFAULT_COMPANY_PROFILE,
  parseCompanyProfile,
  profileToFeatureFlags,
  slugifyCompanyName,
  type CompanyCategory,
  type CompanyProfile,
  type OrganizationUnit,
  type ProductFocus,
} from "@/lib/company-profile";
import {
  FEATURE_FLAG_SETTING_KEYS,
  type FeatureFlagId,
} from "@/lib/features/catalog";
import { getAppSetting } from "@/lib/services/app-settings";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  admins,
  organizationApplications,
  organizationOnboarding,
  organizations,
  organizationSettings,
  organizationUnits,
} from "@/lib/db/schema";
import { logActivity } from "@/lib/logger";
import { MIN_ADMIN_PASSWORD_LENGTH } from "@/lib/services/admins";

export const DEFAULT_ORGANIZATION_ID = 1;
/** Primary tenant — existing AGIMI orders, staff, and settings stay on this org. */
export const LEGACY_AGIMI_ORGANIZATION_ID = 1;
export const LEGACY_AGIMI_SLUG = "agimi";
export const LEGACY_AGIMI_NAME = "AGIMI COM SHPK";

function rowsFromExecute(result: unknown): Array<Record<string, unknown>> {
  const rows = (result as { rows?: Array<Record<string, unknown>> })?.rows;
  return rows ?? [];
}

function scalarFromExecute(result: unknown): unknown {
  const rows = rowsFromExecute(result);
  const row = rows[0];
  if (!row) return undefined;
  const firstKey = Object.keys(row)[0];
  return row[firstKey ?? "c"] ?? row[0];
}

export class OrganizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationError";
  }
}

function nowIso() {
  return new Date().toISOString();
}

async function getOrgSetting(orgId: number, key: string) {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({ value: organizationSettings.value })
      .from(organizationSettings)
      .where(
        and(
          eq(organizationSettings.organizationId, orgId),
          eq(organizationSettings.key, key)
        )
      )
  );
  return row?.value ?? null;
}

export async function setOrganizationSetting(
  orgId: number,
  key: string,
  value: string
) {
  await setOrgSetting(orgId, key, value);
}

async function setOrgSetting(orgId: number, key: string, value: string) {
  const db = await getDb();
  const updatedAt = nowIso();
  const existing = await dbOne(
    db
      .select({ key: organizationSettings.key })
      .from(organizationSettings)
      .where(
        and(
          eq(organizationSettings.organizationId, orgId),
          eq(organizationSettings.key, key)
        )
      )
  );
  if (existing) {
    await db
      .update(organizationSettings)
      .set({ value, updatedAt })
      .where(
        and(
          eq(organizationSettings.organizationId, orgId),
          eq(organizationSettings.key, key)
        )
      );
    return;
  }
  await db.insert(organizationSettings).values({
    organizationId: orgId,
    key,
    value,
    updatedAt,
  });
}

export async function getOrganizationProfile(
  organizationId: number
): Promise<CompanyProfile> {
  const raw = await getOrgSetting(organizationId, COMPANY_PROFILE_SETTING_KEY);
  if (!raw) return { ...DEFAULT_COMPANY_PROFILE };
  try {
    return parseCompanyProfile(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_COMPANY_PROFILE };
  }
}

export async function saveOrganizationProfile(
  organizationId: number,
  profile: CompanyProfile
) {
  await setOrgSetting(
    organizationId,
    COMPANY_PROFILE_SETTING_KEY,
    JSON.stringify(profile)
  );
  const flags = profileToFeatureFlags(profile);
  for (const [id, key] of Object.entries(FEATURE_FLAG_SETTING_KEYS)) {
    const flagId = id as keyof typeof FEATURE_FLAG_SETTING_KEYS;
    await setOrgSetting(
      organizationId,
      key,
      flags[flagId] ? "true" : "false"
    );
  }
}

export async function listOrganizationUnits(
  organizationId: number
): Promise<OrganizationUnit[]> {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select()
      .from(organizationUnits)
      .where(eq(organizationUnits.organizationId, organizationId))
      .orderBy(organizationUnits.sortOrder)
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    sortOrder: r.sortOrder ?? 0,
  }));
}

export async function replaceOrganizationUnits(
  organizationId: number,
  units: OrganizationUnit[]
) {
  const db = await getDb();
  await db
    .delete(organizationUnits)
    .where(eq(organizationUnits.organizationId, organizationId));
  if (!units.length) return;
  await db.insert(organizationUnits).values(
    units.map((unit, index) => ({
      organizationId,
      code: unit.code.trim().toLowerCase(),
      label: unit.label.trim(),
      sortOrder: unit.sortOrder ?? index,
    }))
  );
}

export async function isOnboardingComplete(organizationId: number) {
  const profile = await getOrganizationProfile(organizationId);
  return profile.onboardingComplete;
}

export async function getOrganizationById(id: number) {
  const db = await getDb();
  return dbOne(db.select().from(organizations).where(eq(organizations.id, id)));
}

export async function submitOrganizationApplication(input: {
  orgName: string;
  slug?: string;
  contactName: string;
  contactEmail: string;
  adminUsername: string;
  adminPassword: string;
  companyCategory?: CompanyCategory;
  message?: string;
}) {
  const orgName = input.orgName.trim();
  const contactName = input.contactName.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();
  const username = input.adminUsername.trim().toLowerCase();
  const password = input.adminPassword;

  if (!orgName) throw new OrganizationError("Company name is required.");
  if (!contactName) throw new OrganizationError("Your name is required.");
  if (!contactEmail.includes("@")) {
    throw new OrganizationError("A valid email is required.");
  }
  if (!username) throw new OrganizationError("Username is required.");
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new OrganizationError(
      `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`
    );
  }

  const slug = (input.slug?.trim() || slugifyCompanyName(orgName)).toLowerCase();
  if (!slug || slug.length < 2) {
    throw new OrganizationError("Company URL slug is too short.");
  }

  const db = await getDb();
  const existingOrg = await dbOne(
    db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug))
  );
  if (existingOrg) {
    throw new OrganizationError("This company URL is already taken.");
  }

  const pendingApp = await dbOne(
    db
      .select({ id: organizationApplications.id })
      .from(organizationApplications)
      .where(
        and(
          eq(organizationApplications.slug, slug),
          eq(organizationApplications.status, "pending")
        )
      )
  );
  if (pendingApp) {
    throw new OrganizationError("An application for this company is already pending.");
  }

  const existingAdmin = await dbOne(
    db.select({ id: admins.id }).from(admins).where(eq(admins.username, username))
  );
  if (existingAdmin) {
    throw new OrganizationError("Username is already taken.");
  }

  const now = nowIso();
  const inserted = await dbOne(
    db
      .insert(organizationApplications)
      .values({
        orgName,
        slug,
        contactName,
        contactEmail,
        adminUsername: username,
        adminPasswordHash: hashPassword(password),
        companyCategory: input.companyCategory ?? "general",
        message: input.message?.trim() || null,
        status: "pending",
        createdAt: now,
      })
      .returning({ id: organizationApplications.id })
  );

  await logActivity(
    "create",
    "organization_application",
    inserted!.id,
    `Signup application: ${orgName}`,
    { category: "system", details: { slug, contactEmail } }
  );

  return { applicationId: inserted!.id, slug };
}

export async function listPendingApplications() {
  const db = await getDb();
  return dbAll(
    db
      .select()
      .from(organizationApplications)
      .where(eq(organizationApplications.status, "pending"))
      .orderBy(desc(organizationApplications.createdAt))
  );
}

export async function approveOrganizationApplication(
  applicationId: number,
  reviewerAdminId: number
) {
  const db = await getDb();
  const app = await dbOne(
    db
      .select()
      .from(organizationApplications)
      .where(eq(organizationApplications.id, applicationId))
  );
  if (!app) throw new OrganizationError("Application not found.");
  if (app.status !== "pending") {
    throw new OrganizationError("Application is no longer pending.");
  }

  const now = nowIso();
  const org = await dbOne(
    db
      .insert(organizations)
      .values({
        slug: app.slug,
        name: app.orgName,
        status: "active",
        createdAt: now,
        activatedAt: now,
      })
      .returning()
  );
  if (!org) throw new OrganizationError("Could not create organization.");

  const category = (app.companyCategory as CompanyCategory) || "general";
  const preset = CATEGORY_PRESETS[category] ?? CATEGORY_PRESETS.general;
  const profile: CompanyProfile = {
    companyCategory: preset.companyCategory ?? "general",
    productFocus: preset.productFocus ?? "general",
    modules: { ...DEFAULT_COMPANY_PROFILE.modules, ...preset.modules },
    onboardingComplete: false,
  };

  await saveOrganizationProfile(org.id, profile);
  await replaceOrganizationUnits(org.id, preset.suggestedUnits ?? []);

  await db.insert(organizationOnboarding).values({
    organizationId: org.id,
    currentStep: "company",
    updatedAt: now,
  });

  const admin = await dbOne(
    db
      .insert(admins)
      .values({
        organizationId: org.id,
        isPlatformAdmin: 0,
        name: app.contactName,
        username: app.adminUsername,
        passwordHash: app.adminPasswordHash,
        title: "Owner",
        email: app.contactEmail,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: admins.id })
  );

  await db
    .update(organizationApplications)
    .set({
      status: "approved",
      reviewedByAdminId: reviewerAdminId,
      reviewedAt: now,
      organizationId: org.id,
    })
    .where(eq(organizationApplications.id, applicationId));

  await logActivity(
    "update",
    "organization_application",
    applicationId,
    `Approved signup: ${app.orgName}`,
    {
      category: "system",
      details: { organizationId: org.id, adminId: admin?.id },
    }
  );

  return { organizationId: org.id, adminId: admin?.id };
}

export async function rejectOrganizationApplication(
  applicationId: number,
  reviewerAdminId: number,
  reason?: string
) {
  const db = await getDb();
  const app = await dbOne(
    db
      .select()
      .from(organizationApplications)
      .where(eq(organizationApplications.id, applicationId))
  );
  if (!app) throw new OrganizationError("Application not found.");
  if (app.status !== "pending") {
    throw new OrganizationError("Application is no longer pending.");
  }

  const now = nowIso();
  await db
    .update(organizationApplications)
    .set({
      status: "rejected",
      reviewedByAdminId: reviewerAdminId,
      reviewedAt: now,
      rejectionReason: reason?.trim() || null,
    })
    .where(eq(organizationApplications.id, applicationId));

  return { ok: true as const };
}

export async function completeOnboarding(input: {
  organizationId: number;
  companyCategory: CompanyCategory;
  productFocus: ProductFocus;
  modules: CompanyProfile["modules"];
  units: OrganizationUnit[];
}) {
  const profile: CompanyProfile = {
    companyCategory: input.companyCategory,
    productFocus: input.productFocus,
    modules: input.modules,
    onboardingComplete: true,
  };
  await saveOrganizationProfile(input.organizationId, profile);
  await replaceOrganizationUnits(input.organizationId, input.units);

  const db = await getDb();
  const now = nowIso();
  await db
    .update(organizationOnboarding)
    .set({ currentStep: "complete", completedAt: now, updatedAt: now })
    .where(eq(organizationOnboarding.organizationId, input.organizationId));

  return profile;
}

export async function getFeatureFlagsForOrganization(
  organizationId: number
): Promise<import("@/lib/features/catalog").FeatureFlags> {
  const db = await getDb();
  const flags = { ...profileToFeatureFlags(await getOrganizationProfile(organizationId)) };
  for (const [id, key] of Object.entries(FEATURE_FLAG_SETTING_KEYS)) {
    const flagId = id as FeatureFlagId;
    const row = await dbOne(
      db
        .select({ value: organizationSettings.value })
        .from(organizationSettings)
        .where(
          and(
            eq(organizationSettings.organizationId, organizationId),
            eq(organizationSettings.key, key)
          )
        )
    );
    if (row?.value === "true") {
      flags[flagId] = true;
      continue;
    }
    if (row?.value === "false") {
      flags[flagId] = false;
      continue;
    }
    // Legacy AGIMI: fall back to global app_settings until org copy exists.
    if (organizationId === LEGACY_AGIMI_ORGANIZATION_ID) {
      const legacy = await getAppSetting(key);
      if (legacy === "true") flags[flagId] = true;
      if (legacy === "false") flags[flagId] = false;
    }
  }
  return flags;
}

async function readClientSetting(
  client: Client,
  orgId: number,
  key: string
): Promise<string | null> {
  const result = await client.execute({
    sql: `SELECT value FROM organization_settings
          WHERE organization_id = ? AND key = ? LIMIT 1`,
    args: [orgId, key],
  });
  const value = scalarFromExecute(result);
  return typeof value === "string" ? value : null;
}

async function copyLegacyAppSettingsToOrganization(
  client: Client,
  orgId: number,
  updatedAt: string
) {
  for (const key of Object.values(FEATURE_FLAG_SETTING_KEYS)) {
    const existing = await readClientSetting(client, orgId, key);
    if (existing != null) continue;

    const global = await client.execute({
      sql: "SELECT value FROM app_settings WHERE key = ? LIMIT 1",
      args: [key],
    });
    const value = scalarFromExecute(global);
    if (typeof value !== "string" || !value.trim()) continue;

    await client.execute({
      sql: `INSERT INTO organization_settings (organization_id, key, value, updated_at)
            VALUES (?, ?, ?, ?)`,
      args: [orgId, key, value.trim(), updatedAt],
    });
  }
}

async function ensureLegacyAgimiProfile(client: Client, orgId: number, updatedAt: string) {
  const existing = await readClientSetting(client, orgId, COMPANY_PROFILE_SETTING_KEY);
  if (existing) return;

  const preset = CATEGORY_PRESETS.tile_dealer;
  const profile = {
    companyCategory: preset.companyCategory ?? "tile_dealer",
    productFocus: preset.productFocus ?? "tiles",
    modules: {
      vehicles: true,
      dispatch: true,
      warehouse: true,
      returns: true,
      employeePortal: true,
      useInvoices: true,
      ...preset.modules,
    },
    onboardingComplete: true,
  };

  await client.execute({
    sql: `INSERT INTO organization_settings (organization_id, key, value, updated_at)
          VALUES (?, ?, ?, ?)`,
    args: [orgId, COMPANY_PROFILE_SETTING_KEY, JSON.stringify(profile), updatedAt],
  });
}

async function ensureLegacyAgimiUnits(client: Client, orgId: number) {
  const count = await client.execute({
    sql: "SELECT COUNT(*) AS c FROM organization_units WHERE organization_id = ?",
    args: [orgId],
  });
  const n = Number(scalarFromExecute(count) ?? 0);
  if (n > 0) return;

  const units = CATEGORY_PRESETS.tile_dealer.suggestedUnits ?? [];
  for (const [index, unit] of units.entries()) {
    await client.execute({
      sql: `INSERT INTO organization_units (organization_id, code, label, sort_order)
            VALUES (?, ?, ?, ?)`,
      args: [orgId, unit.code, unit.label, unit.sortOrder ?? index],
    });
  }
}

/**
 * Idempotent: keeps org #1 as AGIMI, copies legacy app_settings, and marks setup complete.
 * Does not modify orders, employees, vehicles, or other operational data.
 */
export async function ensureDefaultOrganization(client: Client) {
  const orgId = LEGACY_AGIMI_ORGANIZATION_ID;
  const now = new Date().toISOString();

  const existing = await client.execute(
    "SELECT id FROM organizations WHERE id = 1 LIMIT 1"
  );
  const hasOrg = rowsFromExecute(existing).length > 0;

  if (!hasOrg) {
    await client.execute({
      sql: `INSERT INTO organizations (id, slug, name, status, created_at, activated_at)
            VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [orgId, LEGACY_AGIMI_SLUG, LEGACY_AGIMI_NAME, now, now],
    });
  } else {
    await client.execute({
      sql: `UPDATE organizations
            SET slug = ?, name = ?, status = 'active', activated_at = COALESCE(activated_at, ?)
            WHERE id = ?`,
      args: [LEGACY_AGIMI_SLUG, LEGACY_AGIMI_NAME, now, orgId],
    });
  }

  await client.execute({
    sql: `INSERT OR IGNORE INTO organization_onboarding
          (organization_id, current_step, completed_at, updated_at)
          VALUES (?, 'complete', ?, ?)`,
    args: [orgId, now, now],
  });
  await client.execute({
    sql: `UPDATE organization_onboarding
          SET current_step = 'complete', completed_at = COALESCE(completed_at, ?), updated_at = ?
          WHERE organization_id = ?`,
    args: [now, now, orgId],
  });

  await copyLegacyAppSettingsToOrganization(client, orgId, now);
  await ensureLegacyAgimiProfile(client, orgId, now);
  await ensureLegacyAgimiUnits(client, orgId);
}
