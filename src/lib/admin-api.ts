import { createClient, type User } from "@supabase/supabase-js";
import { env, getAdminAllowedRoles } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ApiRequestContext } from "@/lib/api/request-context";
import { jsonError } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";

type ProfileRow = {
  id: string;
  role: string;
  status: string;
  full_name: string | null;
  email: string | null;
};

export type AdminApiContext = {
  authUser: User;
  profile: ProfileRow;
};

type GuardProfiling = {
  authSource: "bearer" | "cookie";
  guardDurationMs: number;
  timingsMs: Record<string, number>;
};

type GuardResult =
  | { ok: true; value: AdminApiContext; profiling: GuardProfiling }
  | { ok: false; response: Response; profiling: GuardProfiling };

const bearerAuthClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();
  return token || null;
}

async function resolveAuthUserFromBearerToken(token: string) {
  const {
    data: { user },
    error,
  } = await bearerAuthClient.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

async function measureMs<T>(bucket: Record<string, number>, key: string, fn: () => PromiseLike<T> | T): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    bucket[key] = Math.max(0, Date.now() - startedAt);
  }
}

export async function requireAdminApiContext(ctx: ApiRequestContext, request?: Request): Promise<GuardResult> {
  const guardStartedAt = Date.now();
  const adminAllowedRoles = getAdminAllowedRoles();
  const timingsMs: Record<string, number> = {};
  let authUser: User | null = null;
  let authSource: "bearer" | "cookie" = "cookie";

  if (request) {
    const bearerToken = getBearerToken(request);
    if (bearerToken) {
      authSource = "bearer";
      authUser = await measureMs(timingsMs, "auth.bearer.getUserMs", () => resolveAuthUserFromBearerToken(bearerToken));
      if (!authUser) {
        return {
          ok: false,
          response: jsonError(ctx, "Unauthorized", { status: 401 }),
          profiling: {
            authSource,
            guardDurationMs: Math.max(0, Date.now() - guardStartedAt),
            timingsMs,
          },
        };
      }
    }
  }

  if (!authUser) {
    const supabase = await measureMs(timingsMs, "auth.cookie.createClientMs", () => createServerSupabase());
    const { data: auth } = await measureMs(timingsMs, "auth.cookie.getUserMs", () => supabase.auth.getUser());
    authUser = auth.user ?? null;
  }

  if (!authUser) {
    return {
      ok: false,
      response: jsonError(ctx, "Unauthorized", { status: 401 }),
      profiling: {
        authSource,
        guardDurationMs: Math.max(0, Date.now() - guardStartedAt),
        timingsMs,
      },
    };
  }

  const admin = createAdminClient();
  const { data: profile, error } = await measureMs(timingsMs, "db.profiles.byIdMs", () =>
    admin
      .from("profiles")
      .select("id,role,status,full_name,email")
      .eq("id", authUser.id)
      .maybeSingle<ProfileRow>(),
  );

  if (error || !profile) {
    return {
      ok: false,
      response: jsonError(ctx, "Profile not found", { status: 404 }),
      profiling: {
        authSource,
        guardDurationMs: Math.max(0, Date.now() - guardStartedAt),
        timingsMs,
      },
    };
  }

  if (profile.status !== "active") {
    return {
      ok: false,
      response: jsonError(ctx, "Account is not active", { status: 403 }),
      profiling: {
        authSource,
        guardDurationMs: Math.max(0, Date.now() - guardStartedAt),
        timingsMs,
      },
    };
  }

  if (!adminAllowedRoles.includes(profile.role)) {
    return {
      ok: false,
      response: jsonError(ctx, "Forbidden", { status: 403 }),
      profiling: {
        authSource,
        guardDurationMs: Math.max(0, Date.now() - guardStartedAt),
        timingsMs,
      },
    };
  }

  return {
    ok: true,
    value: {
      authUser,
      profile,
    },
    profiling: {
      authSource,
      guardDurationMs: Math.max(0, Date.now() - guardStartedAt),
      timingsMs,
    },
  };
}
