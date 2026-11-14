import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const { neon } = createRequire(path.join(root, "clinic-client/package.json"))(
  "@neondatabase/serverless",
);

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

function sanitize(error) {
  return String(error?.message ?? error)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]")
    .replace(/ep-[a-z0-9-]+/gi, "[redacted-host]")
    .replace(/npg_[A-Za-z0-9]+/g, "[redacted]");
}

const app = process.argv[2];
const values = readEnv(path.join(root, app, ".env"));
const sql = neon(values.DATABASE_URL_UNPOOLED);

const queries = {
  tables: `select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by 1`,
  foreignKeys: `select count(*)::int as count from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`,
  uniqueConstraints: `select count(*)::int as count from pg_constraint where contype = 'u' and connamespace = 'public'::regnamespace`,
  indexes: `select count(*)::int as count from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'`,
  triggers: `select tgname as name from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal order by 1`,
  extensions: `select extname as name from pg_extension order by 1`,
  policies: `select polname as name, polrelid::regclass::text as table from pg_policy order by 2, 1`,
  forcedRls: `select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by 1`,
  nonNumericMoney: `select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and data_type in ('double precision', 'real')
    order by 1, 2`,
  numericColumns: `select count(*)::int as count
    from information_schema.columns
    where table_schema = 'public' and data_type = 'numeric'`,
  migrations: `select count(*)::int as count from drizzle.__drizzle_migrations`,
};

try {
  const result = {};
  for (const [name, query] of Object.entries(queries)) {
    result[name] = await sql.query(query);
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(sanitize(error));
  process.exit(1);
}
