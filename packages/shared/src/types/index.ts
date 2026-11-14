export const applicationIds = ["admin", "clinic"] as const;

export type ApplicationId = (typeof applicationIds)[number];

export const productSlugs = ["clinic"] as const;

export type ProductSlug = (typeof productSlugs)[number];

export type DatabaseVariableName = "DATABASE_URL" | "DATABASE_URL_UNPOOLED";

export type DatabaseOwnership = {
  application: ApplicationId;
  envFile: string;
  drizzleConfig: string;
  runtimeVariable: "DATABASE_URL";
  migrationVariable: "DATABASE_URL_UNPOOLED";
  purpose: string;
};
