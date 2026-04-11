import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Password Vault Admin"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  ADMIN_ALLOWED_ROLES: z.string().default("approver,admin,super_admin"),
  ADMIN_API_SOURCE: z.enum(["native", "legacy"]).default("native"),
  ADMIN_STATS_CACHE_MS: z.coerce.number().int().min(0).default(15_000),
  LEGACY_PASSWORD_VAULT_API_BASE_URL: z.string().url().optional(),
  LEGACY_PASSWORD_VAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

type ParsedEnv = z.infer<typeof schema>;

let envCache: ParsedEnv | null = null;

export function getEnv(): ParsedEnv {
  if (envCache) {
    return envCache;
  }

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  envCache = parsed.data;
  return envCache;
}

export const env = new Proxy({} as ParsedEnv, {
  get(_target, prop) {
    return getEnv()[prop as keyof ParsedEnv];
  },
});

export function getAdminAllowedRoles() {
  return getEnv()
    .ADMIN_ALLOWED_ROLES.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
