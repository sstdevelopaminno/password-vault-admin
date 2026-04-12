import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const valuePart = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }

    const unquoted =
      (valuePart.startsWith('"') && valuePart.endsWith('"')) ||
      (valuePart.startsWith("'") && valuePart.endsWith("'"))
        ? valuePart.slice(1, -1)
        : valuePart;

    process.env[key] = unquoted;
  }
}

function toCompactTimestamp() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${min}`;
}

function randomAlphaNum(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length * 2);
  let out = "";
  for (const byte of bytes) {
    if (out.length >= length) break;
    out += chars[byte % chars.length];
  }
  return out;
}

function randomDigits(length) {
  const bytes = randomBytes(length * 2);
  let out = "";
  for (const byte of bytes) {
    if (out.length >= length) break;
    out += String(byte % 10);
  }
  return out;
}

function generatePassword() {
  const upper = randomAlphaNum(6).replace(/[^A-Z]/g, "A").slice(0, 4);
  const lower = randomAlphaNum(6).replace(/[^a-z]/g, "a").slice(0, 4);
  const digits = randomDigits(4);
  const symbols = "!@#$%^&*";
  const symbol = symbols[randomBytes(1)[0] % symbols.length];
  const tail = randomAlphaNum(8);
  return `${upper}${lower}${symbol}${digits}${tail}`;
}

function generateAuthorityCode() {
  const partA = randomAlphaNum(4).toUpperCase();
  const partB = randomAlphaNum(4).toUpperCase();
  const partC = randomDigits(4);
  return `PVA-SUPER-${partA}-${partB}-${partC}`;
}

async function findUserByEmail(admin, email) {
  const target = email.toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = (data?.users ?? []).find((user) => (user.email ?? "").toLowerCase() === target);
    if (found) return found;

    if ((data?.users ?? []).length < perPage) break;
  }

  return null;
}

function printMasked(value, visiblePrefix = 4, visibleSuffix = 2) {
  if (value.length <= visiblePrefix + visibleSuffix + 1) {
    return value;
  }
  const start = value.slice(0, visiblePrefix);
  const end = value.slice(-visibleSuffix);
  return `${start}${"*".repeat(value.length - (visiblePrefix + visibleSuffix))}${end}`;
}

async function main() {
  const envPath = path.join(process.cwd(), ".env.local");
  loadEnvFile(envPath);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. Add them to .env.local before running this script.`,
    );
  }

  const defaultEmail = `admin.owner.${toCompactTimestamp()}@password-vault.app`;
  const email = (process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL ?? defaultEmail).trim().toLowerCase();
  const password = (process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD ?? generatePassword()).trim();
  const authorityCode = (process.env.BOOTSTRAP_SUPER_ADMIN_AUTH_CODE ?? generateAuthorityCode()).trim();
  const fullName = (process.env.BOOTSTRAP_SUPER_ADMIN_FULL_NAME ?? "Owner Super Admin").trim();

  if (!email.includes("@")) {
    throw new Error("BOOTSTRAP_SUPER_ADMIN_EMAIL must be a valid email address.");
  }
  if (password.length < 10) {
    throw new Error("BOOTSTRAP_SUPER_ADMIN_PASSWORD must be at least 10 characters.");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let user = await findUserByEmail(admin, email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        super_admin_authority_code: authorityCode,
        super_admin_authority_code_set_at: new Date().toISOString(),
      },
    });

    if (error) {
      throw error;
    }

    user = data.user;
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: fullName,
        super_admin_authority_code: authorityCode,
        super_admin_authority_code_set_at: new Date().toISOString(),
      },
    });

    if (error) {
      throw error;
    }
  }

  if (!user) {
    throw new Error("Unable to resolve bootstrap user.");
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      role: "super_admin",
      status: "active",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    throw profileError;
  }

  console.log("Super admin bootstrap completed.");
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Authority code: ${authorityCode}`);
  console.log(`User ID: ${user.id}`);
  console.log(`Profile role/status: super_admin/active`);
  console.log("");
  console.log("For secure logging use:");
  console.log(`Password (masked): ${printMasked(password)}`);
  console.log(`Authority code (masked): ${printMasked(authorityCode)}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Bootstrap failed: ${message}`);
  process.exit(1);
});
