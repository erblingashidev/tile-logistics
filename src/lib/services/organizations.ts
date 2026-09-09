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
import { FEATURE_FLAG_SETTING_KEYS } from "@/lib/features/catalog";
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
    const flagId = id as keyof typeof FEATURE_FLAG_SETTING_KEYS;
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
    if (row?.value === "true") flags[flagId] = true;
    if (row?.value === "false") flags[flagId] = false;
  }
  return flags;
}

export async function ensureDefaultOrganization(client: Client) {
  const count = await client.execute(
    "SELECT COUNT(*) AS c FROM organizations"
  );
  const rows = (count as { rows: Array<Record<string, unknown>> }).rows;
  const n = Number(rows[0]?.c ?? rows[0]?.[0] ?? 0);
  if (n > 0) return;

  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO organizations (id, slug, name, status, created_at, activated_at)
          VALUES (1, 'default', 'Default company', 'active', ?, ?)`,
    args: [now, now],
  });
  await client.execute({
    sql: `INSERT INTO organization_onboarding (organization_id, current_step, completed_at, updated_at)
          VALUES (1, 'complete', ?, ?)`,
    args: [now, now],
  });

  const profile = {
    ...DEFAULT_COMPANY_PROFILE,
    onboardingComplete: true,
    modules: {
      vehicles: true,
      dispatch: true,
      warehouse: true,
      returns: true,
      employeePortal: true,
      useInvoices: true,
    },
  };
  await client.execute({
    sql: `INSERT INTO organization_settings (organization_id, key, value, updated_at)
          VALUES (1, ?, ?, ?)`,
    args: [COMPANY_PROFILE_SETTING_KEY, JSON.stringify(profile), now],
  });
}
