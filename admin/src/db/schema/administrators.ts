import { index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAtColumn, idColumn, updatedAtColumn } from "./common";
import { administratorStatusEnum } from "./enums";

export const platformPermissions = pgTable("platform_permissions", {
  id: idColumn(),
  key: text("key").notNull(),
  description: text("description").notNull(),
  createdAt: createdAtColumn(),
}, (table) => [
  uniqueIndex("platform_permissions_key_unique").on(table.key),
]);

export const platformRoles = pgTable("platform_roles", {
  id: idColumn(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("platform_roles_name_unique").on(table.name),
]);

export const platformRolePermissions = pgTable("platform_role_permissions", {
  roleId: uuid("role_id").notNull().references(() => platformRoles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => platformPermissions.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionId] }),
]);

export const platformAdministrators = pgTable("platform_administrators", {
  id: idColumn(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  mobile: text("mobile"),
  address: text("address"),
  profileImageUrl: text("profile_image_url"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  locale: text("locale").notNull().default("en-IN"),
  status: administratorStatusEnum("status").notNull().default("active"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("platform_administrators_email_unique").on(table.email),
  index("platform_administrators_status_idx").on(table.status),
]);

export const platformAdministratorRoles = pgTable("platform_administrator_roles", {
  administratorId: uuid("administrator_id").notNull().references(() => platformAdministrators.id, { onDelete: "restrict" }),
  roleId: uuid("role_id").notNull().references(() => platformRoles.id, { onDelete: "restrict" }),
  assignedBy: uuid("assigned_by").references(() => platformAdministrators.id, { onDelete: "restrict" }),
  assignedAt: createdAtColumn(),
}, (table) => [
  primaryKey({ columns: [table.administratorId, table.roleId] }),
]);
