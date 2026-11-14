import { eq } from "drizzle-orm";

import { withAdminTransaction } from "@/db/transaction";
import {
  platformAdministratorRoles,
  platformAdministrators,
  platformPermissions,
  platformRolePermissions,
  platformRoles,
  productConfigurations,
  productIntegrationConfigs,
  saasProducts,
} from "@/db/schema";

import { writeAudit } from "./audit";
import { INITIAL_SUPER_ADMIN, PLATFORM_PERMISSIONS, SUPER_ADMIN_ROLE } from "./constants";

export type BootstrapResult = {
  administratorCreated: boolean;
  roleAssigned: boolean;
  productCreated: boolean;
};

function clinicUrl(): string | null {
  const value = process.env.CLINIC_APP_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

/**
 * Creates the initial Super Admin in the Admin database. Running it again
 * updates the safe profile fields and keeps the Super Admin role. It does
 * not set a password or print a secret.
 */
export async function bootstrapSuperAdmin(): Promise<BootstrapResult> {
  if (process.env.ADMIN_BOOTSTRAP_CONFIRM !== "yes") {
    throw new Error(
      "Set ADMIN_BOOTSTRAP_CONFIRM=yes to run the Super Admin bootstrap. Nothing was changed.",
    );
  }

  return withAdminTransaction(async (tx) => {
    const permissionIds = new Map<string, string>();
    for (const [key, description] of PLATFORM_PERMISSIONS) {
      const [existing] = await tx
        .select({ id: platformPermissions.id })
        .from(platformPermissions)
        .where(eq(platformPermissions.key, key))
        .limit(1);
      if (existing) {
        permissionIds.set(key, existing.id);
        continue;
      }
      const [created] = await tx
        .insert(platformPermissions)
        .values({ key, description })
        .returning({ id: platformPermissions.id });
      if (!created) {
        throw new Error("A platform permission could not be saved.");
      }
      permissionIds.set(key, created.id);
    }

    const [existingRole] = await tx
      .select({ id: platformRoles.id })
      .from(platformRoles)
      .where(eq(platformRoles.name, SUPER_ADMIN_ROLE))
      .limit(1);
    const roleId = existingRole?.id ?? (await tx
      .insert(platformRoles)
      .values({
        name: SUPER_ADMIN_ROLE,
        description: "Full access to platform administration.",
      })
      .returning({ id: platformRoles.id }))[0]?.id;

    if (!roleId) {
      throw new Error("The Super Admin role could not be saved.");
    }

    for (const permissionId of permissionIds.values()) {
      await tx
        .insert(platformRolePermissions)
        .values({ roleId, permissionId })
        .onConflictDoNothing();
    }

    const email = INITIAL_SUPER_ADMIN.email.toLowerCase();
    const [existingAdministrator] = await tx
      .select({ id: platformAdministrators.id })
      .from(platformAdministrators)
      .where(eq(platformAdministrators.email, email))
      .limit(1);

    let administratorId = existingAdministrator?.id;
    const administratorCreated = !administratorId;
    if (!administratorId) {
      const [created] = await tx
        .insert(platformAdministrators)
        .values({
          email,
          name: INITIAL_SUPER_ADMIN.name,
          displayName: INITIAL_SUPER_ADMIN.displayName,
          timezone: INITIAL_SUPER_ADMIN.timezone,
          locale: INITIAL_SUPER_ADMIN.locale,
          status: "active",
        })
        .returning({ id: platformAdministrators.id });
      administratorId = created?.id;
    } else {
      await tx
        .update(platformAdministrators)
        .set({
          name: INITIAL_SUPER_ADMIN.name,
          displayName: INITIAL_SUPER_ADMIN.displayName,
          timezone: INITIAL_SUPER_ADMIN.timezone,
          locale: INITIAL_SUPER_ADMIN.locale,
          updatedAt: new Date(),
        })
        .where(eq(platformAdministrators.id, administratorId));
    }

    if (!administratorId) {
      throw new Error("The Super Admin account could not be saved.");
    }

    const [existingAssignment] = await tx
      .select({ administratorId: platformAdministratorRoles.administratorId })
      .from(platformAdministratorRoles)
      .where(eq(platformAdministratorRoles.administratorId, administratorId))
      .limit(1);

    let roleAssigned = false;
    const assignmentMatchesRole = existingAssignment
      ? (await tx
        .select({ roleId: platformAdministratorRoles.roleId })
        .from(platformAdministratorRoles)
        .where(eq(platformAdministratorRoles.administratorId, administratorId)))
        .some((row) => row.roleId === roleId)
      : false;

    if (!assignmentMatchesRole) {
      await tx.insert(platformAdministratorRoles).values({
        administratorId,
        roleId,
        assignedBy: administratorId,
      });
      roleAssigned = true;
    }

    const [existingProduct] = await tx
      .select({ id: saasProducts.id, productUrl: saasProducts.productUrl })
      .from(saasProducts)
      .where(eq(saasProducts.slug, "clinic-management"))
      .limit(1);

    let productId = existingProduct?.id;
    const productCreated = !productId;
    const url = clinicUrl();
    if (!productId) {
      const [created] = await tx
        .insert(saasProducts)
        .values({
          name: "Clinic Management",
          slug: "clinic-management",
          description: "Clinic management and healthcare practice administration software.",
          productUrl: url,
          status: "active",
        })
        .returning({ id: saasProducts.id });
      productId = created?.id;
      if (productId) {
        await tx.insert(productConfigurations).values({
          productId,
          availableFeatures: ["invoicing"],
          metadata: {},
        });
        await tx.insert(productIntegrationConfigs).values({
          productId,
          provisioningUrl: url ? `${url}/api/internal/provision` : null,
          entitlementUrl: url ? `${url}/api/internal/entitlements` : null,
          secretEnvVar: "CLINIC_PROVISIONING_SECRET",
        });
      }
    } else if (!existingProduct?.productUrl && url) {
      await tx.update(saasProducts).set({ productUrl: url, updatedAt: new Date() }).where(eq(saasProducts.id, productId));
      await tx
        .update(productIntegrationConfigs)
        .set({
          provisioningUrl: `${url}/api/internal/provision`,
          entitlementUrl: `${url}/api/internal/entitlements`,
          updatedAt: new Date(),
        })
        .where(eq(productIntegrationConfigs.productId, productId));
    }

    await writeAudit(tx, {
      actorAdministratorId: administratorId,
      action: "platform.bootstrap",
      summary: administratorCreated
        ? "Initial Super Admin bootstrap created the account."
        : "Super Admin bootstrap confirmed the existing account.",
      entityType: "administrator",
      entityId: administratorId,
      metadata: { administratorCreated, roleAssigned, productCreated },
    });

    return { administratorCreated, roleAssigned, productCreated };
  });
}
