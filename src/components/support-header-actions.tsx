"use client";

import { useState, useTransition } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type UiLocale = "th" | "en";

const TEXT: Record<UiLocale, { refresh: string; signOut: string }> = {
  th: {
    refresh: "\u0E23\u0E35\u0E40\u0E1F\u0E23\u0E0A",
    signOut: "\u0E2D\u0E2D\u0E01\u0E08\u0E32\u0E01\u0E23\u0E30\u0E1A\u0E1A",
  },
  en: {
    refresh: "Refresh",
    signOut: "Sign Out",
  },
};

export function SupportHeaderActions({ locale }: { locale: UiLocale }) {
  const text = TEXT[locale];
  const [refreshing, setRefreshing] = useState(false);
  const [isNavigating, startTransition] = useTransition();

  function triggerRefresh() {
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent("support:refresh-current-menu"));
    window.setTimeout(() => setRefreshing(false), 900);
  }

  async function logout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut({ scope: "local" });
    startTransition(() => {
      window.location.href = "/login?logout=1";
    });
  }

  return (
    <div className="support-header-actions">
      <button className="ghost-button support-header-button" disabled={refreshing} onClick={triggerRefresh} type="button">
        {text.refresh}
      </button>
      <button className="danger-button support-header-button" disabled={isNavigating} onClick={() => void logout()} type="button">
        {text.signOut}
      </button>
    </div>
  );
}

