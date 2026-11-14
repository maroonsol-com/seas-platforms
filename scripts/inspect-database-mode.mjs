import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const { neon } = createRequire(path.join(root, "clinic-client/package.json"))(
  "@neondatabase/serverless",
);

function parseEnv(filePath) {
  const values = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function sanitize(error) {
  return String(error?.message ?? error)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]")
    .replace(/ep-[a-z0-9-]+/gi, "[redacted-host]")
    .replace(/npg_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/[A-Za-z0-9._%+-]+:[^@\s]+@/g, "[redacted]@");
}

function classify(value) {
  if (!value || value.trim().length === 0) {
    return "missing";
  }
  if (
    value.includes("USER:PASSWORD") ||
    value.includes("PLACEHOLDER") ||
    value.includes("REPLACE_ME") ||
    value.includes("ep-ADMIN-HOST") ||
    value.includes("ep-CLINIC-HOST")
  ) {
    return "placeholder";
  }
  if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) {
    return "not-postgres";
  }
  const host = value.match(/@([^/?]+)/)?.[1] ?? "";
  if (host.includes("-pooler")) {
    return "pooled";
  }
  return "direct";
}

function deriveDirect(connectionString) {
  const match = connectionString.match(/^(postgres(?:ql)?:\/\/[^@]+@)([^/?]+)(.*)$/);
  if (!match) {
    throw new Error("Could not read the connection host.");
  }
  if (!match[2].includes("-pooler")) {
    return connectionString;
  }
  const host = match[2].replace("-pooler.", ".");
  if (host.includes("-pooler") || host === match[2]) {
    throw new Error("Could not derive a direct host.");
  }
  return `${match[1]}${host}${match[3]}`;
}

async function probe(connectionString) {
  const sql = neon(connectionString);
  const rows = await sql`
    select
      md5(
        coalesce(current_setting('neon.project_id', true), '') || '|' ||
        coalesce(current_setting('neon.branch_id', true), '') || '|' ||
        current_database()
      ) as identity
  `;
  return rows[0]?.identity ?? "";
}

const apps = ["admin", "clinic-client"];
const report = {};
const identities = {};

for (const app of apps) {
  const filePath = path.join(root, app, ".env");
  const values = parseEnv(filePath);
  const runtime = values.DATABASE_URL;
  const migration = values.DATABASE_URL_UNPOOLED;
  const runtimeClass = classify(runtime);
  const migrationClass = classify(migration);
  let directUrl = migrationClass === "direct" ? migration : undefined;
  let derived = false;

  if (!directUrl && runtimeClass === "pooled") {
    directUrl = deriveDirect(runtime);
    derived = true;
  }

  const entry = {
    target: values.APP_DATABASE_TARGET ?? "missing",
    runtime: runtimeClass,
    migration: migrationClass,
    derivedDirect: derived,
    runtimeOk: false,
    directOk: false,
    error: "",
  };

  try {
    if (runtimeClass === "pooled" || runtimeClass === "direct") {
      identities[`${app}:runtime`] = await probe(runtime);
      entry.runtimeOk = true;
    }
    if (directUrl && classify(directUrl) === "direct") {
      identities[`${app}:direct`] = await probe(directUrl);
      entry.directOk = true;
      if (derived && migrationClass === "missing") {
        const original = readFileSync(filePath, "utf8");
        if (!original.includes("DATABASE_URL_UNPOOLED=")) {
          const suffix = original.endsWith("\n") ? "" : "\n";
          writeFileSync(
            filePath,
            `${original}${suffix}DATABASE_URL_UNPOOLED='${directUrl.replaceAll("'", "\\'")}'\n`,
          );
          entry.wroteUnpooled = true;
        }
      }
    }
  } catch (error) {
    entry.error = sanitize(error);
  }

  report[app] = entry;
}

const adminRuntime = identities["admin:runtime"];
const clinicRuntime = identities["clinic-client:runtime"];
const adminDirect = identities["admin:direct"];
const clinicDirect = identities["clinic-client:direct"];

console.log(
  JSON.stringify(
    {
      report,
      runtimeDatabasesDiffer: Boolean(adminRuntime && clinicRuntime && adminRuntime !== clinicRuntime),
      directDatabasesDiffer: Boolean(adminDirect && clinicDirect && adminDirect !== clinicDirect),
      runtimeMatchesDirect: {
        admin: Boolean(adminRuntime && adminDirect && adminRuntime === adminDirect),
        clinic: Boolean(clinicRuntime && clinicDirect && clinicRuntime === clinicDirect),
      },
    },
    null,
    2,
  ),
);
