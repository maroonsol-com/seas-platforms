import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const { neon } = createRequire(path.join(root, "clinic-client/package.json"))(
  "@neondatabase/serverless",
);

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
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
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
const sqlText = process.argv.slice(3).join(" ");
if (!app || !sqlText) {
  console.error("Usage: node scripts/query-database.mjs <admin|clinic-client> <sql>");
  process.exit(1);
}

const values = readEnv(path.join(root, app, ".env"));
const connectionString = values.DATABASE_URL_UNPOOLED;
if (!connectionString || connectionString.includes("-pooler")) {
  console.error("Refusing to query without a direct migration URL.");
  process.exit(1);
}

const sql = neon(connectionString);
try {
  const rows = await sql.query(sqlText);
  console.log(JSON.stringify(rows, null, 2));
} catch (error) {
  console.error(sanitize(error));
  process.exit(1);
}
