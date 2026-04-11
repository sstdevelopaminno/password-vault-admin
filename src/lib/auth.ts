import { redirect } from "next/navigation";
import { adminAllowedRoles } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

type ProfileRow = {
  id: string;
  role: string;
  status: string;
  full_name: string | null;
  email: string | null;
};

export async function requireAdminSession() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,role,status,full_name,email")
    .eq("id", auth.user.id)
    .single<ProfileRow>();

  if (error || !profile) {
    redirect("/login");
  }

  if (profile.status !== "active" || !adminAllowedRoles.includes(profile.role)) {
    redirect("/login");
  }

  return {
    user: auth.user,
    profile,
  };
}
