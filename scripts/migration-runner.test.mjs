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

function envFor(name, target, identity = `${target}-development`) {
  const url = `postgresql://postgres@127.0.0.1:${port}/${name}`;
  return {
    APP_DATABASE_TARGET: target,
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url,
    DATABASE_NAME: name,
    DATABASE_IDENTITY: identity,
    DATABASE_IDENTITY_CONFIRM: identity,
  };
}

async function claim(name, target, identity = `${target}-development`) {
  await runDatabaseCommand({
    application: target,
    migrationsFolder: path.join(root, target === "admin" ? "admin/drizzle" : "clinic-client/drizzle"),
    env: envFor(name, target, identity),
    command: "identify",
  });
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
    assert.equal(entry.hash.length, 64, entry.tag);
    assert.deepEqual(migrationRisks(entry.sql), [], entry.tag);
  }
  assert.deepEqual(readJournal(path.join(root, "admin/drizzle")).map((entry) => entry.hash), admin.map((entry) => entry.hash));
  assert.deepEqual(readJournal(path.join(root, "clinic-client/drizzle")).map((entry) => entry.hash), clinic.map((entry) => entry.hash));
  assert.deepEqual(migrationRisks("CREATE TABLE kept (id int);\n"), []);
  assert.deepEqual(migrationRisks('ALTER TABLE "invoices" DROP COLUMN "total";\n'), ["DROP COLUMN"]);
  assert.deepEqual(
    migrationRisks("CREATE FUNCTION demo() RETURNS void AS $$\nBEGIN\n  UPDATE invoices SET total = 0;\nEND;\n$$ LANGUAGE plpgsql;\n"),
    [],
  );
});

test("connection identity rejects a pooled direct URL and a different database name", () => {
  const direct = connectionIdentity("postgresql://user:secret@ep-admin.region.aws.neon.tech/admin_db");
  const pooled = connectionIdentity("postgresql://user:secret@ep-admin-pooler.region.aws.neon.tech/admin_db");
  assert.equal(direct.pooled, false);
  assert.equal(pooled.pooled, true);
  assert.equal(direct.databaseName, "admin_db");
  assert.doesNotThrow(() => assertConnectionPair({
    DATABASE_URL: "postgresql://user:secret@ep-admin-pooler.region.aws.neon.tech/admin_db",
    DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-other.region.aws.neon.tech/admin_db",
    DATABASE_NAME: "admin_db",
  }));
  assert.throws(
    () => assertConnectionPair({
      DATABASE_URL: "postgresql://user:secret@ep-admin-pooler.region.aws.neon.tech/admin_db",
      DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-admin.region.aws.neon.tech/other_db",
      DATABASE_NAME: "admin_db",
    }),
    /DATABASE_NAME does not match/,
  );
  assert.throws(
    () => assertConnectionPair({
      DATABASE_URL: "postgresql://user:secret@ep-admin-pooler.region.aws.neon.tech/admin_db",
      DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-admin-pooler.region.aws.neon.tech/admin_db",
      DATABASE_NAME: "admin_db",
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
  await claim("partial_admin", "admin");
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
  await claim("failed_admin", "admin");
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
  const missingIdentity = envFor("guard_admin", "admin");
  delete missingIdentity.DATABASE_IDENTITY;
  await assert.rejects(
    () => runDatabaseCommand({ application: "admin", migrationsFolder: folder, env: missingIdentity, command: "migrate" }),
    /DATABASE_IDENTITY is missing/,
  );
  const otherApplication = envFor("guard_admin", "admin", "clinic-production");
  await assert.rejects(
    () => runDatabaseCommand({ application: "admin", migrationsFolder: folder, env: otherApplication, command: "migrate" }),
    /not valid for the admin application/,
  );
  const untouched = await query("guard_admin", "SELECT to_regclass('public.platform_administrators') AS name");
  assert.equal(untouched.rows[0].name, null);
});

test("admin and clinic runners reject each other's database", async () => {
  createDatabase("real_admin");
  createDatabase("real_clinic");
  await claim("real_admin", "admin", "admin-development");
  await claim("real_clinic", "clinic", "clinic-development");
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
  await claim("danger_admin", "admin");
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
  await claim("locked_admin", "admin");
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

test("configured identities are accepted and a mismatch applies no SQL", async () => {
  const cases = [
    ["admin_development", "admin", "admin-development"],
    ["admin_production", "admin", "admin-production"],
    ["clinic_development", "clinic", "clinic-development"],
    ["clinic_production", "clinic", "clinic-production"],
  ];
  const folder = mkdtempSync(path.join(tmpdir(), "saas-journal-"));
  writeMigration(folder, "0000_create", 10, "CREATE TABLE kept (id integer PRIMARY KEY);\n");
  for (const [name, target, identity] of cases) {
    createDatabase(name);
    await claim(name, target, identity);
    await runDatabaseCommand({
      application: target,
      migrationsFolder: folder,
      env: envFor(name, target, identity),
      command: "migrate",
    });
    const marker = await query(name, "SELECT identity FROM drizzle.database_identity");
    assert.equal(marker.rows[0].identity, identity);
    const table = await query(name, "SELECT to_regclass('public.kept') AS name");
    assert.equal(table.rows[0].name, "kept");
  }

  await assert.rejects(
    () => runDatabaseCommand({
      application: "admin",
      migrationsFolder: folder,
      env: envFor("admin_development", "admin", "admin-production"),
      command: "migrate",
    }),
    /does not match DATABASE_IDENTITY/,
  );
  await assert.rejects(
    () => runDatabaseCommand({
      application: "admin",
      migrationsFolder: folder,
      env: envFor("admin_production", "admin", "admin-development"),
      command: "migrate",
    }),
    /does not match DATABASE_IDENTITY/,
  );
  const unchanged = await query("admin_development", "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations");
  assert.equal(unchanged.rows[0].count, 1);
  const productionMarker = await query("admin_production", "SELECT identity FROM drizzle.database_identity");
  assert.equal(productionMarker.rows[0].identity, "admin-production");

  createDatabase("wrong_identity");
  await claim("wrong_identity", "clinic", "clinic-development");
  await assert.rejects(
    () => runDatabaseCommand({
      application: "admin",
      migrationsFolder: folder,
      env: envFor("wrong_identity", "admin", "admin-development"),
      command: "migrate",
    }),
    /does not match DATABASE_IDENTITY/,
  );
  const wrongTable = await query("wrong_identity", "SELECT to_regclass('public.kept') AS name");
  assert.equal(wrongTable.rows[0].name, null);

  createDatabase("missing_identity");
  await assert.rejects(
    () => runDatabaseCommand({
      application: "admin",
      migrationsFolder: folder,
      env: envFor("missing_identity", "admin", "admin-development"),
      command: "migrate",
    }),
    /no identity record/,
  );
  const missingTable = await query("missing_identity", "SELECT to_regclass('public.kept') AS name");
  const missingHistory = await query("missing_identity", "SELECT to_regclass('drizzle.__drizzle_migrations') AS name");
  assert.equal(missingTable.rows[0].name, null);
  assert.equal(missingHistory.rows[0].name, null);

  await assert.rejects(
    () => claim("admin_development", "admin", "admin-production"),
    /does not match DATABASE_IDENTITY/,
  );
  const stillDevelopment = await query("admin_development", "SELECT identity FROM drizzle.database_identity");
  assert.equal(stillDevelopment.rows[0].identity, "admin-development");
});

test("the runtime URL must show the same stored identity", async () => {
  const otherDir = mkdtempSync(path.join(tmpdir(), "saas-migrate-"));
  const otherPort = await freePort();
  execFileSync("initdb", ["-D", otherDir, "-U", "postgres", "--auth=trust", "--no-sync"], { stdio: "ignore" });
  const other = spawn(
    "postgres",
    ["-D", otherDir, "-p", String(otherPort), "-c", "listen_addresses=127.0.0.1", "-c", "unix_socket_directories="],
    { stdio: "ignore" },
  );
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        execFileSync("pg_isready", ["-h", "127.0.0.1", "-p", String(otherPort)], { stdio: "ignore" });
        break;
      } catch (error) {
        if (attempt === 49) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    execFileSync("createdb", ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "shared_name"], { stdio: "ignore" });
    execFileSync("createdb", ["-h", "127.0.0.1", "-p", String(otherPort), "-U", "postgres", "shared_name"], { stdio: "ignore" });
    await claim("shared_name", "admin", "admin-production");
    const folder = mkdtempSync(path.join(tmpdir(), "saas-journal-"));
    writeMigration(folder, "0000_create", 10, "CREATE TABLE kept (id integer PRIMARY KEY);\n");
    const env = envFor("shared_name", "admin", "admin-production");
    env.DATABASE_URL = `postgresql://postgres@127.0.0.1:${otherPort}/shared_name`;
    await assert.rejects(
      () => runDatabaseCommand({
        application: "admin",
        migrationsFolder: folder,
        env,
        command: "migrate",
      }),
      /DATABASE_URL does not show the same database identity/,
    );
    const directTable = await query("shared_name", "SELECT to_regclass('public.kept') AS name");
    assert.equal(directTable.rows[0].name, null);
  } finally {
    if (other.exitCode === null) {
      other.kill("SIGTERM");
      await new Promise((resolve) => {
        other.once("exit", resolve);
        setTimeout(resolve, 2000);
      });
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        rmSync(otherDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
});
