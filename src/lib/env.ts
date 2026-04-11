import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Password Vault Admin"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  ADMIN_ALLOWED_ROLES: z.string().default("approver,admin,super_admin"),
  LEGACY_PASSWORD_VAULT_API_BASE_URL: z.string().url().optional(),
  LEGACY_PASSWORD_VAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsed.data;

export const adminAllowedRoles = env.ADMIN_ALLOWED_ROLES.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
