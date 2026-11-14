import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(appRoot, ".env");
const command = process.argv[2];
const extraArguments = process.argv.slice(3).filter((argument) => argument !== "--");
const allowedCommands = new Set(["generate", "migrate", "studio", "check"]);

if (!allowedCommands.has(command ?? "")) {
  console.error(
    "Usage: node scripts/drizzle.mjs <generate|migrate|studio|check>",
  );
  process.exit(1);
}

let envFile;
try {
  envFile = readFileSync(envPath, "utf8");
} catch {
  console.error(
    `Missing ${envPath}. Create this application's .env before running Drizzle Kit. No database connection was opened.`,
  );
  process.exit(1);
}

const env = { ...process.env };

for (const line of envFile.split("\n")) {
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
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  // This application's file wins over ambient shell variables.
  env[key] = value;
}

const child = spawn(
  process.execPath,
  [resolve(appRoot, "node_modules/drizzle-kit/bin.cjs"), command, ...extraArguments],
  {
    cwd: appRoot,
    env,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
