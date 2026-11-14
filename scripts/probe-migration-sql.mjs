import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const require = createRequire(path.join(root, "clinic-client/package.json"));
const { Pool, neonConfig } = require("@neondatabase/serverless");
const ws = require("ws");
neonConfig.webSocketConstructor = ws;

function sanitize(error) {
  return String(error?.message ?? error)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]")
    .replace(/ep-[a-z0-9-]+/gi, "[redacted-host]")
    .replace(/npg_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/[A-Za-z0-9._%+-]+:[^@\s]+@/g, "[redacted]@");
}

function readEnv(filePath) {
  const values = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
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

const app = process.argv[2];
const files = process.argv.slice(3);
if (!app || files.length === 0) {
  console.error("Usage: node scripts/probe-migration-sql.mjs <app> <sql-file> [sql-file...]");
  process.exit(1);
}
const values = readEnv(path.join(root, app, ".env"));
const connectionString = values.DATABASE_URL_UNPOOLED;
const sqlText = files.map((file) => readFileSync(file, "utf8")).join("\n");
const statements = sqlText
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0 && !statement.startsWith("-- Custom SQL"));

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
let failed = false;
try {
  await client.query("BEGIN");
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    try {
      await client.query(statement);
    } catch (error) {
      failed = true;
      const preview = statement.replace(/\s+/g, " ").slice(0, 240);
      console.log(JSON.stringify({ index, total: statements.length, preview, error: sanitize(error) }, null, 2));
      break;
    }
  }
  if (!failed) {
    console.log(JSON.stringify({ ok: true, total: statements.length }));
  }
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}
if (failed) {
  process.exit(1);
}
