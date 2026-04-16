import { SupportWorkspace } from "@/components/support-workspace";
import { SupportHeaderActions } from "@/components/support-header-actions";
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

type MenuIcon = "dashboard" | "users" | "tickets" | "billing" | "recovery" | "default";

const MENU_ITEMS: Record<AdminLocale, SidebarMenuItem[]> = {
  th: [
    {
      id: "1",
      title: "แดชบอร์ด",
      href: "#workspace-dashboard",
      visibleTo: ["support", "owner", "it"],
    },
    {
      id: "2",
      title: "เช็ครายชื่อผู้ใช้งานทั่วไป",
      href: "#workspace-users-general",
      visibleTo: ["support", "owner"],
    },
    {
      id: "3",
      title: "คำร้องจากศูนย์ช่วยเหลือ",
      href: "#workspace-tickets",
      visibleTo: ["support", "owner", "it"],
    },
    {
      id: "4",
      title: "ตรวจสอบยอดชำระเงิน",
      href: "#workspace-billing",
      visibleTo: ["support", "owner"],
    },
    {
      id: "5",
      title: "กู้คืนข้อมูลผู้ใช้งาน",
      href: "#workspace-recovery",
      visibleTo: ["support", "owner", "it"],
    },
  ],
  en: [
    {
      id: "1",
      title: "Dashboard",
      href: "#workspace-dashboard",
      visibleTo: ["support", "owner", "it"],
    },
    {
      id: "2",
      title: "General Users",
      href: "#workspace-users-general",
      visibleTo: ["support", "owner"],
    },
    {
      id: "3",
      title: "Help Center Tickets",
      href: "#workspace-tickets",
      visibleTo: ["support", "owner", "it"],
    },
    {
      id: "4",
      title: "Billing Monitor",
      href: "#workspace-billing",
      visibleTo: ["support", "owner"],
    },
    {
      id: "5",
      title: "Data Recovery",
      href: "#workspace-recovery",
      visibleTo: ["support", "owner", "it"],
    },
  ],
};

function resolveRoleGroup(role: string): RoleGroup {
  const normalized = role.toLowerCase();
  if (normalized === "super_admin" || normalized === "owner") return "owner";
  if (normalized === "approver" || normalized === "it" || normalized === "it_admin") return "it";
  return "support";
}

function roleDisplayText(locale: AdminLocale, group: RoleGroup, rawRole: string) {
  if (locale === "th") {
    if (group === "owner") return `สิทธิ์ปัจจุบัน: Owner (${rawRole})`;
    if (group === "it") return `สิทธิ์ปัจจุบัน: IT / Approver (${rawRole})`;
    return `สิทธิ์ปัจจุบัน: Admin Support (${rawRole})`;
  }
  if (group === "owner") return `Current role: Owner (${rawRole})`;
  if (group === "it") return `Current role: IT / Approver (${rawRole})`;
  return `Current role: Support Admin (${rawRole})`;
}

function iconForHref(href: string): MenuIcon {
  if (href === "#workspace-dashboard") return "dashboard";
  if (href === "#workspace-users-general") return "users";
  if (href === "#workspace-tickets") return "tickets";
  if (href === "#workspace-billing") return "billing";
  if (href === "#workspace-recovery") return "recovery";
  return "default";
}

function renderMenuIcon(icon: MenuIcon) {
  if (icon === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10Zm0-18v6h8V3h-8ZM3 21h8v-6H3v6Z" />
      </svg>
    );
  }
  if (icon === "users") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (icon === "tickets") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 7h16v10H4z" />
        <path d="M8 7V5h8v2" />
        <path d="M8 12h8" />
      </svg>
    );
  }
  if (icon === "billing") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </svg>
    );
  }
  if (icon === "recovery") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 12a9 9 0 1 1-3.2-6.9" />
        <path d="M21 3v6h-6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export default async function HomePage() {
  const locale = await resolveAdminLocale();
  const { profile } = await requireAdminSession();
  const roleGroup = resolveRoleGroup(profile.role);
  const visibleMenuItems = MENU_ITEMS[locale].filter((item) => item.visibleTo.includes(roleGroup));

  return (
    <>
      <div className="support-layout">
        <input className="support-sidebar-toggle-input" id="support-sidebar-toggle" type="checkbox" />
        <main className="office-shell support-shell p-4 md:p-5">
        <aside className="support-sidebar">
          <div className="support-sidebar-top">
            <div className="support-sidebar-toolbar">
              <label aria-label="Toggle menu sidebar" className="support-sidebar-toggle" htmlFor="support-sidebar-toggle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </label>
            </div>
            <div className="support-brand-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Password Vault Logo" className="support-brand-logo" src={SUPPORT_BRAND_LOGO_URL} />
              <div>
                <p className="support-brand-company">Password Vault</p>
                <p className="support-brand-system">{locale === "th" ? "ระบบจัดการฝ่าย Support" : "Support Backoffice"}</p>
                <p className="support-role-pill">{roleDisplayText(locale, roleGroup, profile.role)}</p>
              </div>
            </div>

            <nav className="support-nav-list mt-5" aria-label="Support menu">
              {visibleMenuItems.map((menu, index) => (
                <a
                  key={menu.id}
                  className={`support-nav-item support-nav-link ${index === 0 ? "support-nav-item-active" : ""}`}
                  href={menu.href}
                  aria-label={menu.title}
                >
                  <span aria-hidden className="support-nav-icon">
                    {renderMenuIcon(iconForHref(menu.href))}
                  </span>
                  <span className="support-nav-content">
                    <span className="support-nav-title">{menu.title}</span>
                  </span>
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <section className="support-main">
          <header className="panel support-hero" id="support-top">
            <div className="support-hero-top">
              <span className="badge">Helpdesk Backoffice</span>
              <div className="support-hero-top-right">
                <span className="support-hero-role">{roleDisplayText(locale, roleGroup, profile.role)}</span>
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
