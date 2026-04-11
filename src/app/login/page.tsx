import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { getAdminAllowedRoles } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

type ProfileRow = {
  role: string;
  status: string;
};

export default async function LoginPage() {
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

  return <AdminLoginForm />;
}
