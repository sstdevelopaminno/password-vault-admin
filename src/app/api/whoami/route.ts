import { createServerSupabase } from "@/lib/supabase/server";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";

const ROUTE = "/api/whoami";

export async function GET(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    const supabase = await createServerSupabase();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) {
      logApiSuccess(ctx, 401, { reason: "no_user" });
      return jsonError(ctx, "Unauthorized", { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,role,status,full_name,email")
      .eq("id", auth.user.id)
      .maybeSingle();

    logApiSuccess(ctx, 200);
    return jsonData(ctx, {
      ok: true,
      user: {
        id: auth.user.id,
        email: auth.user.email,
      },
      profile,
    });
  } catch (error) {
    logApiError(ctx, 500, error);
    return jsonError(ctx, "Unable to resolve session profile", { status: 500 });
  }
}
