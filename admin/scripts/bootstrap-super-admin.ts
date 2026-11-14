import { readFileSync } from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), ".env");
for (const line of readFileSync(filePath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#") || !trimmed.includes("=")) {
    continue;
  }
  const separator = trimmed.indexOf("=");
  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.env[key] = value;
}

async function main() {
const { bootstrapSuperAdmin } = await import("../src/server/bootstrap");
const { closeAdminPool } = await import("../src/db/transaction");

try {
  const result = await bootstrapSuperAdmin();
  console.log("Super Admin bootstrap completed.");
  console.log(`Account ${result.administratorCreated ? "created" : "confirmed"}.`);
  console.log(`Super Admin role ${result.roleAssigned ? "assigned" : "already assigned"}.`);
  console.log(`Clinic product ${result.productCreated ? "created" : "already present"}.`);
  if (!process.env.SMTP_HOST?.trim()) {
    console.log("SMTP is not configured. Email sign-in cannot be tested until SMTP credentials are supplied.");
  }
} finally {
  await closeAdminPool();
}
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Bootstrap failed.";
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
  process.exit(1);
});
