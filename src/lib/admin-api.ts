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

type GuardResult = { ok: true; value: AdminApiContext } | { ok: false; response: Response };

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();
  return token || null;
}

async function resolveAuthUserFromBearerToken(token: string) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

export async function requireAdminApiContext(ctx: ApiRequestContext, request?: Request): Promise<GuardResult> {
  const adminAllowedRoles = getAdminAllowedRoles();
  let authUser: User | null = null;

  if (request) {
    const bearerToken = getBearerToken(request);
    if (bearerToken) {
      authUser = await resolveAuthUserFromBearerToken(bearerToken);
    }
  }

  if (!authUser) {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    authUser = auth.user ?? null;
  }

  if (!authUser) {
    return {
      ok: false,
      response: jsonError(ctx, "Unauthorized", { status: 401 }),
    };
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id,role,status,full_name,email")
    .eq("id", authUser.id)
    .maybeSingle<ProfileRow>();

  if (error || !profile) {
    return {
      ok: false,
      response: jsonError(ctx, "Profile not found", { status: 404 }),
    };
  }

  if (profile.status !== "active") {
    return {
      ok: false,
      response: jsonError(ctx, "Account is not active", { status: 403 }),
    };
  }

  if (!adminAllowedRoles.includes(profile.role)) {
    return {
      ok: false,
      response: jsonError(ctx, "Forbidden", { status: 403 }),
    };
  }

  return {
    ok: true,
    value: {
      authUser,
      profile,
    },
  };
}
