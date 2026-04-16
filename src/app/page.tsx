import { SupportWorkspace } from "@/components/support-workspace";
import { SupportHeaderActions } from "@/components/support-header-actions";
import { SupportSidebarNav } from "@/components/support-sidebar-nav";
import { requireAdminSession } from "@/lib/auth";
import { resolveAdminLocale, t, type AdminLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const SUPPORT_BRAND_LOGO_URL =
  "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/D-001.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzL0QtMDAxLnBuZyIsImlhdCI6MTc3NTkzNDgwMywiZXhwIjoxODA3NDcwODAzfQ.owIqb6_Dc2-wA9iUiisiOr-tnhUgbBW37ivTPCWCA74";

type RoleGroup = "support" | "it" | "owner";

type SidebarMenuItem = {
  id: string;
  title: string;
  href: string;
  visibleTo: RoleGroup[];
};

type MenuIcon = "dashboard" | "users" | "ui-check" | "tickets" | "billing" | "recovery" | "default";

const MENU_ITEMS: Record<AdminLocale, SidebarMenuItem[]> = {
  th: [
    { id: "1", title: "แดชบอร์ด", href: "#workspace-dashboard", visibleTo: ["support", "owner", "it"] },
    { id: "2", title: "เช็ครายชื่อผู้ใช้งานทั่วไป", href: "#workspace-users-general", visibleTo: ["support", "owner"] },
    { id: "3", title: "เช็ค UI", href: "#workspace-ui-check", visibleTo: ["support", "owner", "it"] },
    { id: "4", title: "คำร้องจากศูนย์ช่วยเหลือ", href: "#workspace-tickets", visibleTo: ["support", "owner", "it"] },
    { id: "5", title: "ตรวจสอบยอดชำระเงิน", href: "#workspace-billing", visibleTo: ["support", "owner"] },
    { id: "6", title: "กู้คืนข้อมูลผู้ใช้งาน", href: "#workspace-recovery", visibleTo: ["support", "owner", "it"] },
  ],
  en: [
    { id: "1", title: "Dashboard", href: "#workspace-dashboard", visibleTo: ["support", "owner", "it"] },
    { id: "2", title: "General Users", href: "#workspace-users-general", visibleTo: ["support", "owner"] },
    { id: "3", title: "UI Check", href: "#workspace-ui-check", visibleTo: ["support", "owner", "it"] },
    { id: "4", title: "Help Center Tickets", href: "#workspace-tickets", visibleTo: ["support", "owner", "it"] },
    { id: "5", title: "Billing Monitor", href: "#workspace-billing", visibleTo: ["support", "owner"] },
    { id: "6", title: "Data Recovery", href: "#workspace-recovery", visibleTo: ["support", "owner", "it"] },
  ],
};

function resolveRoleGroup(role: string): RoleGroup {
  const normalized = role.toLowerCase();
  if (normalized === "super_admin" || normalized === "owner") return "owner";
  if (normalized === "approver" || normalized === "it" || normalized === "it_admin") return "it";
  return "support";
}

function iconForHref(href: string): MenuIcon {
  if (href === "#workspace-dashboard") return "dashboard";
  if (href === "#workspace-users-general") return "users";
  if (href === "#workspace-ui-check") return "ui-check";
  if (href === "#workspace-tickets") return "tickets";
  if (href === "#workspace-billing") return "billing";
  if (href === "#workspace-recovery") return "recovery";
  return "default";
}

export default async function HomePage() {
  const locale = await resolveAdminLocale();
  const { profile } = await requireAdminSession();
  const roleGroup = resolveRoleGroup(profile.role);
  const visibleMenuItems = MENU_ITEMS[locale].filter((item) => item.visibleTo.includes(roleGroup));
  const navItems = visibleMenuItems.map((item) => ({
    ...item,
    icon: iconForHref(item.href),
  }));

  return (
    <>
      <div className="support-layout">
        <input className="support-sidebar-toggle-input" id="support-sidebar-toggle" type="checkbox" />
        <main className="office-shell support-shell">
          <aside className="support-sidebar">
            <div className="support-sidebar-top">
              <div className="support-sidebar-toolbar">
                <div className="support-brand-inline">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Password Vault Logo" className="support-brand-inline-logo" src={SUPPORT_BRAND_LOGO_URL} />
                  <span className="support-brand-inline-text">Support Office</span>
                </div>
                <label aria-label="Toggle menu sidebar" className="support-sidebar-toggle" htmlFor="support-sidebar-toggle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </label>
              </div>

              <SupportSidebarNav items={navItems} />
            </div>
          </aside>

          <section className="support-main">
            <header className="panel support-hero" id="support-top">
              <div className="support-hero-top">
                <span className="badge">Helpdesk Backoffice</span>
                <div className="support-hero-top-right">
                  <SupportHeaderActions locale={locale} />
                </div>
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{t(locale, "appTitle")}</h1>
              <p className="mt-2 max-w-4xl text-sm md:text-[15px] muted">{t(locale, "appSubtitle")}</p>
            </header>

            <SupportWorkspace locale={locale} />
          </section>
        </main>
      </div>

      <section className="screen-warning">
        <div className="screen-warning-card">
          <h2 className="text-xl font-bold">{t(locale, "mobileNoticeTitle")}</h2>
          <p className="mt-2 text-sm muted">{t(locale, "mobileNoticeDesc")}</p>
        </div>
      </section>
    </>
  );
}
