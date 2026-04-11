import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { getAdminAllowedRoles } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

type ProfileRow = {
  role: string;
  status: string;
};

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function resolveNotice(params: Record<string, string | string[] | undefined>) {
  const timeout = params.timeout;
  const logout = params.logout;

  if (timeout === "1") {
    return "Session expired for security. Please sign in again.";
  }

  if (logout === "1") {
    return "Signed out successfully.";
  }

  return null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createServerSupabase();
  const adminAllowedRoles = getAdminAllowedRoles();
  const { data: auth } = await supabase.auth.getUser();

  if (auth.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role,status")
      .eq("id", auth.user.id)
      .maybeSingle<ProfileRow>();

    if (profile && profile.status === "active" && adminAllowedRoles.includes(profile.role)) {
      redirect("/");
    }
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialNotice = resolveNotice(resolvedSearchParams);

  return <AdminLoginForm initialNotice={initialNotice} />;
}
