import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  businessIsolationPolicy,
  createdAtColumn,
  idColumn,
  sameBusinessForeignKey,
  updatedAtColumn,
} from "./common";
import {
  branchStatusEnum,
  clinicBusinessStatusEnum,
  clinicUserStatusEnum,
  membershipStatusEnum,
} from "./enums";

export const businesses = pgTable("businesses", {
  id: idColumn(),
  platformBusinessId: uuid("platform_business_id").notNull(),
  legalName: text("legal_name").notNull(),
  displayName: text("display_name").notNull(),
  status: clinicBusinessStatusEnum("status").notNull().default("active"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("businesses_platform_business_unique").on(table.platformBusinessId),
  index("businesses_status_idx").on(table.status),
  pgPolicy("businesses_tenant_isolation", {
    for: "all",
    using: sql`${table.id} = nullif(current_setting('app.current_business_id', true), '')::uuid`,
    withCheck: sql`${table.id} = nullif(current_setting('app.current_business_id', true), '')::uuid`,
  }),
]).enableRLS();

/**
 * Product-wide accounts. A person may belong to more than one clinic, so this
 * table has no business_id. Login looks up an email before a business is
 * chosen, which is why row level security is not applied here.
 */
export const users = pgTable("users", {
  id: idColumn(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  mobile: text("mobile"),
  status: clinicUserStatusEnum("status").notNull().default("active"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
  index("users_status_idx").on(table.status),
]);

/** Global permission catalog. It contains no tenant data. */
export const permissions = pgTable("permissions", {
  id: idColumn(),
  key: text("key").notNull(),
  description: text("description").notNull(),
  createdAt: createdAtColumn(),
}, (table) => [
  uniqueIndex("permissions_key_unique").on(table.key),
]);

export const roles = pgTable("roles", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("roles_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("roles_business_name_unique").on(table.businessId, table.name),
  index("roles_business_idx").on(table.businessId),
  businessIsolationPolicy("roles", table.businessId),
]).enableRLS();

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionId] }),
  index("role_permissions_business_idx").on(table.businessId),
  sameBusinessForeignKey(
    "role_permissions_role_business_fk",
    [table.roleId, table.businessId],
    [roles.id, roles.businessId],
  ),
  businessIsolationPolicy("role_permissions", table.businessId),
]).enableRLS();

export const businessMemberships = pgTable("business_memberships", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: membershipStatusEnum("status").notNull().default("invited"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("business_memberships_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("business_memberships_business_user_unique").on(table.businessId, table.userId),
  index("business_memberships_user_idx").on(table.userId),
  pgPolicy("business_memberships_tenant_isolation", {
    for: "all",
    using: sql`(
      ${table.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid
      OR ${table.businessId} = nullif(current_setting('app.current_business_id', true), '')::uuid
    )`,
    withCheck: sql`${table.businessId} = nullif(current_setting('app.current_business_id', true), '')::uuid`,
  }),
]).enableRLS();

export const membershipRoles = pgTable("membership_roles", {
  membershipId: uuid("membership_id").notNull(),
  roleId: uuid("role_id").notNull(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  primaryKey({ columns: [table.membershipId, table.roleId] }),
  index("membership_roles_business_idx").on(table.businessId),
  sameBusinessForeignKey(
    "membership_roles_membership_business_fk",
    [table.membershipId, table.businessId],
    [businessMemberships.id, businessMemberships.businessId],
  ),
  sameBusinessForeignKey(
    "membership_roles_role_business_fk",
    [table.roleId, table.businessId],
    [roles.id, roles.businessId],
  ),
  businessIsolationPolicy("membership_roles", table.businessId),
]).enableRLS();

export const branches = pgTable("branches", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postalCode: text("postal_code").notNull(),
  phone: text("phone"),
  status: branchStatusEnum("status").notNull().default("active"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("branches_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("branches_business_code_unique").on(table.businessId, table.code),
  index("branches_business_idx").on(table.businessId),
  businessIsolationPolicy("branches", table.businessId),
]).enableRLS();

export const branchMemberships = pgTable("branch_memberships", {
  membershipId: uuid("membership_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  primaryKey({ columns: [table.membershipId, table.branchId] }),
  index("branch_memberships_business_idx").on(table.businessId),
  sameBusinessForeignKey(
    "branch_memberships_membership_business_fk",
    [table.membershipId, table.businessId],
    [businessMemberships.id, businessMemberships.businessId],
  ),
  sameBusinessForeignKey(
    "branch_memberships_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  businessIsolationPolicy("branch_memberships", table.businessId),
]).enableRLS();
