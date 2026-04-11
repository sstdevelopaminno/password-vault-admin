import type { User } from "@supabase/supabase-js";
import { getAdminAllowedRoles } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ApiRequestContext } from "@/lib/api/request-context";
import { jsonError } from "@/lib/api/response";

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

export async function requireAdminApiContext(ctx: ApiRequestContext): Promise<GuardResult> {
  const adminAllowedRoles = getAdminAllowedRoles();
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return {
      ok: false,
      response: jsonError(ctx, "Unauthorized", { status: 401 }),
    };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,role,status,full_name,email")
    .eq("id", auth.user.id)
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
      authUser: auth.user,
      profile,
    },
  };
}
