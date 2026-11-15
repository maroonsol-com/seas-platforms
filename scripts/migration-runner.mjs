import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const LOCK_NAMESPACE = 81422011;
export const LOCK_KEYS = { admin: 1, clinic: 2 };
export const DATABASE_IDENTITIES = {
  admin: ["admin-development", "admin-production"],
  clinic: ["clinic-development", "clinic-production"],
};

const APPLICATIONS = {
  admin: {
    label: "admin",
    target: "admin",
    foreignRelation: "public.patients",
  },
  clinic: {
    label: "clinic",
    target: "clinic",
    foreignRelation: "public.platform_administrators",
  },
};

export function redact(value) {
  return String(value).replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
}

export function loadEnvFile(filePath, env = process.env) {
  if (!existsSync(filePath)) return env;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, separator).trim()] = value;
  }
  return env;
}

export function loadCommandEnv(appRoot) {
  const override = process.env.MIGRATION_ENV_FILE?.trim();
  if (!override) return loadEnvFile(path.join(appRoot, ".env"));
  const filePath = path.resolve(appRoot, override);
  if (!existsSync(filePath)) {
    throw new Error("MIGRATION_ENV_FILE does not exist. No database connection was opened.");
  }
  return loadEnvFile(filePath, {});
}

export function connectionIdentity(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("The connection string is not a URL. No database connection was opened.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("The connection string is not PostgreSQL. No database connection was opened.");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName) {
    throw new Error("The connection string has no database name. No database connection was opened.");
  }
  return {
    databaseName,
    pooled: url.hostname.includes("-pooler"),
  };
}

export function expectedDatabaseIdentity(application, env) {
  const identity = env.DATABASE_IDENTITY?.trim() ?? "";
  const allowed = DATABASE_IDENTITIES[application];
  if (!identity) {
    throw new Error("DATABASE_IDENTITY is missing. Set it to admin-development, admin-production, clinic-development, or clinic-production. No migration was applied.");
  }
  if (!allowed?.includes(identity)) {
    throw new Error(`DATABASE_IDENTITY is not valid for the ${application} application. No migration was applied.`);
  }
  return identity;
}

export function stripRoutineBodies(sql) {
  return sql.replace(/\$[A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z0-9_]*\$/g, " ");
}

export function migrationRisks(sql) {
  const outside = stripRoutineBodies(sql);
  const risks = [];
  if (/\bDROP\s+TABLE\b/i.test(outside)) risks.push("DROP TABLE");
  if (/\bDROP\s+COLUMN\b/i.test(outside)) risks.push("DROP COLUMN");
  if (/\bTRUNCATE\b/i.test(outside)) risks.push("TRUNCATE");
  if (/\bDELETE\s+FROM\b/i.test(outside)) risks.push("DELETE");
  if (/(?:^|;)\s*UPDATE\s+/im.test(outside)) risks.push("UPDATE");
  if (/\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i.test(outside)) risks.push("column type change");
  if (/\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b/i.test(outside)) risks.push("SET NOT NULL");
  if (/\bDROP\s+SCHEMA\b/i.test(outside)) risks.push("DROP SCHEMA");
  if (/\bDROP\s+POLICY\b/i.test(outside)) risks.push("DROP POLICY");
  for (const statement of outside.match(/\bREVOKE\b[^;]*/gi) ?? []) {
    const functionName = statement.match(/\bFUNCTION\s+"?([A-Za-z_][\w]*)"?/i)?.[1];
    const createdHere = functionName
      && new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+"?${functionName}"?\\b`, "i").test(outside);
    if (!createdHere) risks.push("REVOKE");
  }
  const dropped = [...outside.matchAll(/DROP\s+CONSTRAINT\s+"?([A-Za-z0-9_]+)"?/gi)].map((match) => match[1]);
  const added = new Set(
    [...outside.matchAll(/ADD\s+CONSTRAINT\s+"?([A-Za-z0-9_]+)"?/gi)].map((match) => match[1]),
  );
  if (dropped.some((name) => !added.has(name))) risks.push("DROP CONSTRAINT");
  return risks;
}

export function notNullAdditions(sql) {
  const outside = stripRoutineBodies(sql);
  const tables = [];
  const pattern = /ALTER\s+TABLE\s+(?:"([^"]+)"|([A-Za-z_][\w]*))\s+ADD\s+COLUMN\s+(?:"([^"]+)"|([A-Za-z_][\w]*))\s+([^;]+)/gi;
  for (const match of outside.matchAll(pattern)) {
    const clause = match[5];
    if (/\bNOT\s+NULL\b/i.test(clause) && !/\bDEFAULT\b/i.test(clause)) {
      tables.push(match[1] ?? match[2]);
    }
  }
  return tables;
}

export function nonTransactionalReason(statement, serverVersionNum) {
  if (/\b(CREATE|DROP|REINDEX)\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(statement)) {
    return "CREATE or DROP INDEX CONCURRENTLY";
  }
  if (/^\s*VACUUM\b/i.test(statement)) return "VACUUM";
  if (/\bALTER\s+TYPE\b[\s\S]*\bADD\s+VALUE\b/i.test(statement) && serverVersionNum < 120000) {
    return "ALTER TYPE ADD VALUE on PostgreSQL older than 12";
  }
  return null;
}

export function readJournal(migrationsFolder) {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    throw new Error(`Missing ${journalPath}.`);
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (!Array.isArray(journal.entries)) {
    throw new Error(`The migration journal in ${migrationsFolder} has no entries array.`);
  }
  const entries = journal.entries.map((entry, index) => {
    if (entry.idx !== index) {
      throw new Error(`Migration journal index ${entry.idx} is out of order. Expected ${index}.`);
    }
    const filePath = path.join(migrationsFolder, `${entry.tag}.sql`);
    if (!existsSync(filePath)) {
      throw new Error(`Migration journal entry ${entry.tag} has no SQL file.`);
    }
    const sql = readFileSync(filePath, "utf8");
    return {
      idx: entry.idx,
      when: Number(entry.when),
      tag: entry.tag,
      sql,
      hash: createHash("sha256").update(sql).digest("hex"),
    };
  });
  for (let index = 1; index < entries.length; index += 1) {
    if (!(entries[index].when > entries[index - 1].when)) {
      throw new Error(`Migration ${entries[index].tag} does not sort after ${entries[index - 1].tag}.`);
    }
  }
  const hashes = new Set(entries.map((entry) => entry.hash));
  const tags = new Set(entries.map((entry) => entry.tag));
  if (hashes.size !== entries.length || tags.size !== entries.length) {
    throw new Error(`The migration journal in ${migrationsFolder} contains a duplicate tag or hash.`);
  }
  return entries;
}

function statementsOf(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function approvedTags(env) {
  return new Set(
    (env.MIGRATION_APPROVED_TAGS ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

function requireUrl(env, name) {
  const value = env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`${name} is missing. Migrations require the direct Neon URL and do not fall back to the pooled runtime URL. No database connection was opened.`);
  }
  if (["USER:PASSWORD", "PLACEHOLDER", "REPLACE_ME", "ep-ADMIN-HOST", "ep-CLINIC-HOST"].some((marker) => value.includes(marker))) {
    throw new Error(`${name} is still a placeholder. No database connection was opened.`);
  }
  return value;
}

export function assertConnectionPair(env) {
  const runtime = connectionIdentity(requireUrl(env, "DATABASE_URL"));
  const direct = connectionIdentity(requireUrl(env, "DATABASE_URL_UNPOOLED"));
  if (direct.pooled) {
    throw new Error("DATABASE_URL_UNPOOLED points at a Neon pooler host. Migrations require the direct connection. No database connection was opened.");
  }
  const expectedName = env.DATABASE_NAME?.trim() ?? "";
  if (!expectedName) {
    throw new Error("DATABASE_NAME is missing. No migration was applied.");
  }
  if (runtime.databaseName !== expectedName || direct.databaseName !== expectedName) {
    throw new Error("DATABASE_NAME does not match the database in DATABASE_URL and DATABASE_URL_UNPOOLED. No migration was applied.");
  }
  return direct;
}

function historyVerdict(journal, rows, foreignHashes) {
  const problems = [];
  rows.forEach((row, index) => {
    const expected = journal[index];
    if (!expected) {
      problems.push("The database has a migration that is not in this application's journal.");
      return;
    }
    if (row.hash !== expected.hash || Number(row.created_at) !== expected.when) {
      problems.push(`Applied migration ${index + 1} does not match ${expected.tag}.`);
    }
    if (foreignHashes.has(row.hash)) {
      problems.push("Applied migration history belongs to the other application.");
    }
  });
  return {
    problems: [...new Set(problems)],
    pending: problems.length === 0 ? journal.slice(rows.length) : [],
  };
}

async function storedIdentity(client) {
  const present = await client.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = 'database_identity') AS present",
  );
  if (!present.rows[0].present) return null;
  const rows = await client.query("SELECT identity FROM drizzle.database_identity");
  if (rows.rows.length !== 1) return null;
  return rows.rows[0].identity;
}

async function identityVisibleTo(connectionString) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString, max: 1, application_name: "saas-identity-check" });
  const client = await pool.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    return await storedIdentity(client);
  } finally {
    client.release();
    await pool.end();
  }
}

async function recordIdentity(client, identity) {
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(`CREATE TABLE IF NOT EXISTS drizzle.database_identity (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    identity text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query("INSERT INTO drizzle.database_identity (identity) VALUES ($1)", [identity]);
}

async function readHistory(client) {
  const present = await client.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations') AS present",
  );
  if (!present.rows[0].present) return [];
  const rows = await client.query('SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id');
  return rows.rows;
}

async function ensureMigrationsTable(client) {
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`);
}

async function applyEntry(client, entry, serverVersionNum) {
  const statements = statementsOf(entry.sql);
  await client.query("BEGIN");
  try {
    for (const statement of statements) {
      const reason = nonTransactionalReason(statement, serverVersionNum);
      if (reason) {
        throw new Error(`${entry.tag} contains ${reason}, which cannot run inside its migration transaction.`);
      }
      await client.query(statement);
    }
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      [entry.hash, entry.when],
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection may already have aborted the transaction.
    }
    throw new Error(`${entry.tag} failed: ${redact(error instanceof Error ? error.message : error)}`);
  }
}

export async function runDatabaseCommand(options) {
  const application = APPLICATIONS[options.application];
  if (!application) throw new Error("The migration application must be admin or clinic.");
  const env = options.env;
  if (env.APP_DATABASE_TARGET !== application.target) {
    throw new Error(`APP_DATABASE_TARGET must be "${application.target}". Refusing to use another application's database. No database connection was opened.`);
  }
  const journal = options.command === "identify" ? [] : readJournal(options.migrationsFolder);
  const foreignHashes = new Set(
    options.command !== "identify" && options.foreignMigrationsFolder && existsSync(options.foreignMigrationsFolder)
      ? readJournal(options.foreignMigrationsFolder).map((entry) => entry.hash)
      : [],
  );
  if (options.command === "check") {
    const risky = journal
      .map((entry) => ({ tag: entry.tag, risks: migrationRisks(entry.sql) }))
      .filter((entry) => entry.risks.length > 0);
    return { ok: true, journal: journal.map((entry) => entry.tag), risky };
  }

  let identityError = "";
  let expectedIdentity = "";
  try {
    assertConnectionPair(env);
    expectedIdentity = expectedDatabaseIdentity(application.label, env);
    if (options.command === "identify" && env.DATABASE_IDENTITY_CONFIRM !== expectedIdentity) {
      throw new Error("DATABASE_IDENTITY_CONFIRM must exactly match DATABASE_IDENTITY. No identity was recorded.");
    }
  } catch (error) {
    identityError = error instanceof Error ? error.message : String(error);
    if (options.command !== "status") throw error;
  }
  requireUrl(env, "DATABASE_URL_UNPOOLED");
  const direct = connectionIdentity(env.DATABASE_URL_UNPOOLED);
  if (direct.pooled) {
    throw new Error("DATABASE_URL_UNPOOLED points at a Neon pooler host. Migrations require the direct connection. No database connection was opened.");
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL_UNPOOLED,
    max: 1,
    application_name: `saas-${application.label}-migrate`,
  });
  const client = await pool.connect();
  let locked = false;
  try {
    if (options.command !== "status") {
      await client.query("SET lock_timeout = '120s'");
      await client.query("SELECT pg_advisory_lock($1, $2)", [LOCK_NAMESPACE, LOCK_KEYS[application.label]]);
      locked = true;
    }
    if (options.command !== "migrate" && options.command !== "identify") {
      await client.query("SET default_transaction_read_only = on");
    }
    const identity = await client.query("SELECT current_database() AS name, current_setting('server_version_num') AS version");
    const nameMatchesUrl = identity.rows[0].name === direct.databaseName;
    const nameMatchesConfig = Boolean(env.DATABASE_NAME?.trim()) && identity.rows[0].name === env.DATABASE_NAME.trim();
    const relations = await client.query(
      "SELECT to_regclass('public.platform_administrators') IS NOT NULL AS administrators, to_regclass('public.patients') IS NOT NULL AS patients",
    );
    if (!identityError && !nameMatchesConfig) {
      identityError = "The connected database name does not match DATABASE_NAME. No migration was applied.";
    }
    const foreignPresent = relations.rows[0][application.foreignRelation === "public.patients" ? "patients" : "administrators"];
    const storedIdentityValue = identityError ? null : await storedIdentity(client);
    let runtimeIdentityValue = null;
    if (!identityError && storedIdentityValue) {
      runtimeIdentityValue = await identityVisibleTo(env.DATABASE_URL);
    }
    const identityMatches = Boolean(expectedIdentity) && storedIdentityValue === expectedIdentity && runtimeIdentityValue === expectedIdentity;
    if (!identityError && !identityMatches) {
      if (!storedIdentityValue) {
        identityError = "This database has no identity record. Run db:identify once after setting DATABASE_IDENTITY and DATABASE_IDENTITY_CONFIRM to the same value. No migration was applied.";
      } else if (storedIdentityValue !== expectedIdentity) {
        identityError = "The identity stored in this database does not match DATABASE_IDENTITY. No migration was applied.";
      } else {
        identityError = "DATABASE_URL does not show the same database identity as DATABASE_URL_UNPOOLED. No migration was applied.";
      }
    }
    if (foreignPresent && options.command !== "status") {
      const suffix = options.command === "identify" ? "No identity was recorded." : "No migration was applied.";
      throw new Error(`This database contains ${application.foreignRelation}, which belongs to the other application. ${suffix}`);
    }
    if (options.command === "identify") {
      if (identityError && !identityError.startsWith("This database has no identity record")) throw new Error(identityError);
      if (!storedIdentityValue) {
        await recordIdentity(client, expectedIdentity);
        if (await identityVisibleTo(env.DATABASE_URL) !== expectedIdentity) {
          throw new Error("DATABASE_URL does not show the identity recorded through DATABASE_URL_UNPOOLED. The direct database now has the identity. Point both URLs at that database before migrating.");
        }
      }
      return { ok: true, identity: "matches" };
    }
    if (identityError && options.command !== "status") throw new Error(identityError);
    if (options.command === "migrate") await ensureMigrationsTable(client);
    const rows = await readHistory(client);
    const verdict = historyVerdict(journal, rows, foreignHashes);
    const report = {
      ok: !identityError && !foreignPresent && verdict.problems.length === 0 && (options.command !== "verify" || verdict.pending.length === 0),
      identity: !expectedIdentity ? "not configured" : !storedIdentityValue ? "missing" : identityMatches ? "matches" : "mismatch",
      applied: rows.map((row) => journal.find((entry) => entry.hash === row.hash)?.tag ?? "unrecognized"),
      pending: verdict.problems.length === 0 ? verdict.pending.map((entry) => entry.tag) : [],
      problems: [
        ...verdict.problems,
        ...(identityError ? [identityError] : []),
        ...(foreignPresent ? [`This database contains ${application.foreignRelation}, which belongs to the other application. No migration was applied.`] : []),
      ],
      administrators: relations.rows[0].administrators,
      patients: relations.rows[0].patients,
      nameMatchesUrl,
      nameMatchesConfig,
    };
    if (foreignPresent && options.command !== "status") {
      throw Object.assign(new Error(report.problems.at(-1)), { report });
    }
    if (options.command === "status") {
      if (!report.ok) throw Object.assign(new Error(report.problems.join(" ") || "Migration status failed."), { report });
      return report;
    }
    if (verdict.problems.length > 0) throw new Error(verdict.problems.join(" "));
    if (identityError) throw new Error(identityError);
    if (options.command === "verify" && verdict.pending.length > 0) {
      throw new Error(`Pending migrations: ${verdict.pending.map((entry) => entry.tag).join(", ")}.`);
    }
    if (options.command === "migrate") {
      const approved = approvedTags(env);
      const version = Number(identity.rows[0].version);
      for (const entry of verdict.pending) {
        const risks = [...migrationRisks(entry.sql)];
        for (const table of new Set(notNullAdditions(entry.sql))) {
          if (!/^[A-Za-z_][\w]*$/.test(table)) {
            throw new Error(`${entry.tag} has an unsupported table name. Nothing further was applied.`);
          }
          const count = await client.query(`SELECT count(*)::int AS count FROM "${table}"`);
          if (count.rows[0].count > 0) risks.push(`NOT NULL column without a default on ${table}, which already has rows`);
        }
        if (risks.length > 0 && !approved.has(entry.tag)) {
          throw new Error(`${entry.tag} requires review before it can run (${risks.join(", ")}). Set MIGRATION_APPROVED_TAGS to that tag after reviewing the SQL. Nothing further was applied.`);
        }
        await applyEntry(client, entry, version);
      }
      const applied = await readHistory(client);
      const confirmed = historyVerdict(journal, applied, foreignHashes);
      if (confirmed.problems.length > 0 || confirmed.pending.length > 0) {
        throw new Error("Migration verification failed after apply. The deployment must stop.");
      }
    }
    return {
      ok: true,
      applied: rows.length,
      pending: options.command === "migrate" ? [] : verdict.pending.map((entry) => entry.tag),
    };
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock($1, $2)", [LOCK_NAMESPACE, LOCK_KEYS[application.label]]);
      } catch {
        // Closing the connection releases a session advisory lock.
      }
    }
    client.release();
    await pool.end();
  }
}

export async function runDeploy(options) {
  await runDatabaseCommand({ ...options, command: "migrate" });
  const build = options.build ?? (() => {
    const nextBin = path.join(options.appRoot, "node_modules", "next", "dist", "bin", "next");
    return spawnSync(process.execPath, [nextBin, "build"], { cwd: options.appRoot, stdio: "inherit" }).status ?? 1;
  });
  const status = await build();
  if (status !== 0) throw new Error("The Next.js build failed after migrations.");
}

export async function executeCli(options) {
  const command = options.argv[0];
  const allowed = new Set(["check", "status", "verify", "migrate", "identify", "deploy"]);
  if (!allowed.has(command)) {
    console.error("Usage: node scripts/database.mjs <check|status|verify|migrate|identify|deploy>");
    return 1;
  }
  const env = loadCommandEnv(options.appRoot);
  try {
    if (command === "deploy") {
      await runDeploy({ ...options, env });
    } else {
      const result = await runDatabaseCommand({ ...options, env, command });
      if (command === "check") {
        console.log(`${options.application}: ${result.journal.length} migrations, journal order is valid.`);
        for (const entry of result.risky) {
          console.log(`${entry.tag} needs review when pending: ${entry.risks.join(", ")}`);
        }
      } else if (command === "status") {
        printStatus(options.application, result);
      } else if (command === "verify") {
        console.log(`${options.application}: migration history matches the journal.`);
      } else if (command === "identify") {
        console.log(`${options.application}: database identity recorded.`);
      } else {
        console.log(`${options.application}: migrations applied and verified.`);
      }
    }
    return 0;
  } catch (error) {
    if (error && typeof error === "object" && "report" in error) {
      printStatus(options.application, error.report);
    }
    console.error(redact(error instanceof Error ? error.message : error));
    return 1;
  }
}

function printStatus(application, result) {
  console.log(`${application}: ${result.applied.length} applied, ${result.pending.length} pending.`);
  console.log(`platform_administrators: ${result.administrators ? "present" : "absent"}`);
  console.log(`patients: ${result.patients ? "present" : "absent"}`);
  console.log(`database name matches connection: ${result.nameMatchesUrl ? "yes" : "no"}`);
  console.log(`database name matches DATABASE_NAME: ${result.nameMatchesConfig ? "yes" : "no"}`);
  console.log(`database identity: ${result.identity}`);
  console.log(`applied: ${result.applied.join(", ") || "none"}`);
  console.log(`pending: ${result.pending.join(", ") || "none"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("Run this through admin/scripts/database.mjs or clinic-client/scripts/database.mjs.");
  process.exit(1);
}
