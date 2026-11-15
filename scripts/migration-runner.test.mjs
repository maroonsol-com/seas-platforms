import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

import {
  assertConnectionPair,
  connectionIdentity,
  migrationRisks,
  readJournal,
  runDatabaseCommand,
  runDeploy,
} from "./migration-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = mkdtempSync(path.join(tmpdir(), "saas-migrate-"));
let port = 0;
let server;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const value = probe.address().port;
      probe.close(() => resolve(value));
    });
  });
}

function writeMigration(folder, tag, when, sql) {
  mkdirSync(path.join(folder, "meta"), { recursive: true });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, "utf8"))
    : { version: "7", dialect: "postgresql", entries: [] };
  journal.entries.push({ idx: journal.entries.length, version: "7", when, tag, breakpoints: true });
  writeFileSync(journalPath, JSON.stringify(journal));
  writeFileSync(path.join(folder, `${tag}.sql`), sql);
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      execFileSync("pg_isready", ["-h", "127.0.0.1", "-p", String(port)], { stdio: "ignore" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Local Postgres did not start.");
}

function createDatabase(name) {
  execFileSync("createdb", ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", name], { stdio: "ignore" });
}

function envFor(name, target) {
  const url = `postgresql://postgres@127.0.0.1:${port}/${name}`;
  return {
    APP_DATABASE_TARGET: target,
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url,
    DATABASE_NAME: name,
    NEON_ENDPOINT_ID: "local",
  };
}

async function query(name, sql, params = []) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/${name}`, max: 1 });
  try {
    return await pool.query(sql, params);
  } finally {
    await pool.end();
  }
}

before(async () => {
  port = await freePort();
  execFileSync("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "--no-sync"], { stdio: "ignore" });
  server = spawn(
    "postgres",
    ["-D", dataDir, "-p", String(port), "-c", "listen_addresses=127.0.0.1", "-c", "unix_socket_directories="],
    { stdio: "ignore" },
  );
  await waitForPostgres();
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
});

test("journal order and destructive classification", () => {
  const admin = readJournal(path.join(root, "admin/drizzle"));
  const clinic = readJournal(path.join(root, "clinic-client/drizzle"));
  assert.deepEqual(admin.map((entry) => entry.tag), [
    "0000_lush_genesis",
    "0001_platform_integrity",
    "0002_big_shadowcat",
  ]);
  assert.equal(clinic.length, 12);
  assert.equal(clinic.at(-1).tag, "0011_sad_proudstar");
  for (const entry of [...admin, ...clinic]) {
    assert.deepEqual(migrationRisks(entry.sql), [], entry.tag);
  }
  assert.deepEqual(migrationRisks("CREATE TABLE kept (id int);\n"), []);
  assert.deepEqual(migrationRisks('ALTER TABLE "invoices" DROP COLUMN "total";\n'), ["DROP COLUMN"]);
  assert.deepEqual(
    migrationRisks("CREATE FUNCTION demo() RETURNS void AS $$\nBEGIN\n  UPDATE invoices SET total = 0;\nEND;\n$$ LANGUAGE plpgsql;\n"),
    [],
  );
});

test("connection identity rejects a pooler migration URL and a swapped pair", () => {
  const direct = connectionIdentity("postgresql://user:secret@ep-admin.region.aws.neon.tech/admin_db");
  const pooled = connectionIdentity("postgresql://user:secret@ep-admin-pooler.region.aws.neon.tech/admin_db");
  assert.equal(direct.endpointId, "ep-admin");
  assert.equal(pooled.endpointId, direct.endpointId);
  assert.equal(pooled.pooled, true);
  assert.doesNotThrow(() => assertConnectionPair({
    DATABASE_URL: "postgresql://user:secret@ep-admin-pooler.region.aws.neon.tech/admin_db",
    DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-admin.region.aws.neon.tech/admin_db",
    DATABASE_NAME: "admin_db",
    NEON_ENDPOINT_ID: "ep-admin",
  }));
  assert.throws(
    () => assertConnectionPair({
      DATABASE_URL: "postgresql://user:secret@ep-clinic-pooler.region.aws.neon.tech/admin_db",
      DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-admin.region.aws.neon.tech/admin_db",
      DATABASE_NAME: "admin_db",
      NEON_ENDPOINT_ID: "ep-admin",
    }),
    /do not select the same database/,
  );
  assert.throws(
    () => assertConnectionPair({
      DATABASE_URL: "postgresql://user:secret@ep-admin-pooler.region.aws.neon.tech/admin_db",
      DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-admin-pooler.region.aws.neon.tech/admin_db",
      DATABASE_NAME: "admin_db",
      NEON_ENDPOINT_ID: "ep-admin",
    }),
    /pooler host/,
  );
});

test("fresh, repeated, and partial migrations keep existing rows", async () => {
  createDatabase("partial_admin");
  const first = mkdtempSync(path.join(tmpdir(), "saas-journal-"));
  const sql = 'CREATE TABLE kept (id integer PRIMARY KEY, note text NOT NULL);\n';
  writeMigration(first, "0000_create", 10, sql);
  const base = {
    application: "admin",
    migrationsFolder: first,
    env: envFor("partial_admin", "admin"),
  };
  await runDatabaseCommand({ ...base, command: "migrate" });
  await runDatabaseCommand({ ...base, command: "migrate" });
  await query("partial_admin", "INSERT INTO kept (id, note) VALUES (1, 'preserved')");
  const second = mkdtempSync(path.join(tmpdir(), "saas-journal-"));
  writeMigration(second, "0000_create", 10, sql);
  writeMigration(second, "0001_add", 20, "ALTER TABLE kept ADD COLUMN extra text;\n");
  await runDatabaseCommand({ ...base, migrationsFolder: second, command: "migrate" });
  const row = await query("partial_admin", "SELECT note, extra FROM kept WHERE id = 1");
  assert.equal(row.rows[0].note, "preserved");
  assert.equal(row.rows[0].extra, null);
  const again = await runDatabaseCommand({ ...base, migrationsFolder: second, command: "verify" });
  assert.equal(again.ok, true);
});

test("a failed migration stops and does not record itself", async () => {
  createDatabase("failed_admin");
  const folder = mkdtempSync(path.join(tmpdir(), "saas-journal-"));
  writeMigration(folder, "0000_ok", 10, "CREATE TABLE kept (id integer PRIMARY KEY);\n");
  writeMigration(folder, "0001_bad", 20, "SELECT 1 / 0;\n");
  await assert.rejects(
    () => runDatabaseCommand({
      application: "admin",
      migrationsFolder: folder,
      env: envFor("failed_admin", "admin"),
      command: "migrate",
    }),
    /0001_bad failed/,
  );
  const count = await query("failed_admin", "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations");
  assert.equal(count.rows[0].count, 1);
  const table = await query("failed_admin", "SELECT to_regclass('public.kept') AS name");
  assert.equal(table.rows[0].name, "kept");
});

test("the wrong target, identity, or missing direct URL stops before migration", async () => {
  createDatabase("guard_admin");
  const folder = path.join(root, "admin/drizzle");
  await assert.rejects(
    () => runDatabaseCommand({
      application: "admin",
      migrationsFolder: folder,
      env: envFor("guard_admin", "clinic"),
      command: "migrate",
    }),
    /APP_DATABASE_TARGET must be "admin"/,
  );
  await assert.rejects(
    () => runDatabaseCommand({
      application: "clinic",
      migrationsFolder: path.join(root, "clinic-client/drizzle"),
      env: envFor("guard_admin", "admin"),
      command: "migrate",
    }),
    /APP_DATABASE_TARGET must be "clinic"/,
  );
  const missing = envFor("guard_admin", "admin");
  delete missing.DATABASE_URL_UNPOOLED;
  await assert.rejects(
    () => runDatabaseCommand({ application: "admin", migrationsFolder: folder, env: missing, command: "migrate" }),
    /DATABASE_URL_UNPOOLED is missing/,
  );
  const wrong = envFor("guard_admin", "admin");
  wrong.DATABASE_NAME = "other_database";
  await assert.rejects(
    () => runDatabaseCommand({ application: "admin", migrationsFolder: folder, env: wrong, command: "migrate" }),
    /DATABASE_NAME does not match/,
  );
  const remote = envFor("guard_admin", "admin");
  remote.NEON_ENDPOINT_ID = "ep-other";
  await assert.rejects(
    () => runDatabaseCommand({ application: "admin", migrationsFolder: folder, env: remote, command: "migrate" }),
    /NEON_ENDPOINT_ID=local/,
  );
});

test("admin and clinic runners reject each other's database", async () => {
  createDatabase("real_admin");
  createDatabase("real_clinic");
  await runDatabaseCommand({
    application: "admin",
    migrationsFolder: path.join(root, "admin/drizzle"),
    foreignMigrationsFolder: path.join(root, "clinic-client/drizzle"),
    env: envFor("real_admin", "admin"),
    command: "migrate",
  });
  await runDatabaseCommand({
    application: "clinic",
    migrationsFolder: path.join(root, "clinic-client/drizzle"),
    foreignMigrationsFolder: path.join(root, "admin/drizzle"),
    env: envFor("real_clinic", "clinic"),
    command: "migrate",
  });
  await assert.rejects(
    () => runDatabaseCommand({
      application: "admin",
      migrationsFolder: path.join(root, "admin/drizzle"),
      foreignMigrationsFolder: path.join(root, "clinic-client/drizzle"),
      env: envFor("real_clinic", "admin"),
      command: "migrate",
    }),
    /public\.patients/,
  );
  await assert.rejects(
    () => runDatabaseCommand({
      application: "clinic",
      migrationsFolder: path.join(root, "clinic-client/drizzle"),
      foreignMigrationsFolder: path.join(root, "admin/drizzle"),
      env: envFor("real_admin", "clinic"),
      command: "migrate",
    }),
    /public\.platform_administrators/,
  );
  const administrators = await query("real_clinic", "SELECT to_regclass('public.platform_administrators') AS name");
  assert.equal(administrators.rows[0].name, null);
});

test("real migration histories apply once and preserve a row", async () => {
  await query("real_admin", "INSERT INTO platform_administrators (email, name) VALUES ('owner@example.com', 'Owner')");
  await runDatabaseCommand({
    application: "admin",
    migrationsFolder: path.join(root, "admin/drizzle"),
    env: envFor("real_admin", "admin"),
    command: "migrate",
  });
  const adminRow = await query("real_admin", "SELECT email FROM platform_administrators");
  assert.equal(adminRow.rows[0].email, "owner@example.com");
  await runDatabaseCommand({
    application: "clinic",
    migrationsFolder: path.join(root, "clinic-client/drizzle"),
    env: envFor("real_clinic", "clinic"),
    command: "migrate",
  });
  const patients = await query("real_clinic", "SELECT count(*)::int AS count FROM patients");
  assert.equal(patients.rows[0].count, 0);
});

test("inconsistent history is rejected", async () => {
  await query(
    "real_admin",
    "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('not-a-real-hash', 999)",
  );
  await assert.rejects(
    () => runDatabaseCommand({
      application: "admin",
      migrationsFolder: path.join(root, "admin/drizzle"),
      env: envFor("real_admin", "admin"),
      command: "verify",
    }),
    /does not match|not in this application's journal/,
  );
});

test("destructive SQL requires an explicit tag approval", async () => {
  createDatabase("danger_admin");
  const folder = mkdtempSync(path.join(tmpdir(), "saas-journal-"));
  writeMigration(folder, "0000_create", 10, "CREATE TABLE kept (id integer PRIMARY KEY);\n");
  writeMigration(folder, "0001_drop", 20, "DROP TABLE kept;\n");
  const options = {
    application: "admin",
    migrationsFolder: folder,
    env: envFor("danger_admin", "admin"),
    command: "migrate",
  };
  await assert.rejects(() => runDatabaseCommand(options), /0001_drop requires review/);
  const stillThere = await query("danger_admin", "SELECT to_regclass('public.kept') AS name");
  assert.equal(stillThere.rows[0].name, "kept");
  options.env = { ...options.env, MIGRATION_APPROVED_TAGS: "0001_drop" };
  await runDatabaseCommand(options);
  const dropped = await query("danger_admin", "SELECT to_regclass('public.kept') AS name");
  assert.equal(dropped.rows[0].name, null);
});

test("concurrent migrators apply the pending migration once", async () => {
  createDatabase("locked_admin");
  const folder = mkdtempSync(path.join(tmpdir(), "saas-journal-"));
  writeMigration(folder, "0000_slow", 10, "CREATE TABLE kept (id integer PRIMARY KEY);\nSELECT pg_sleep(1);\n");
  const options = {
    application: "admin",
    migrationsFolder: folder,
    env: envFor("locked_admin", "admin"),
    command: "migrate",
  };
  await Promise.all([runDatabaseCommand(options), runDatabaseCommand(options)]);
  const count = await query("locked_admin", "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations");
  assert.equal(count.rows[0].count, 1);
});

test("a failed migration does not run the build", async () => {
  let built = false;
  await assert.rejects(
    () => runDeploy({
      application: "admin",
      migrationsFolder: path.join(root, "admin/drizzle"),
      env: envFor("guard_admin", "clinic"),
      appRoot: path.join(root, "admin"),
      build: () => {
        built = true;
        return 0;
      },
    }),
    /APP_DATABASE_TARGET/,
  );
  assert.equal(built, false);
});
