import Link from "next/link";
import { DashboardLivePanels } from "@/components/dashboard-live-panels";
import { env } from "@/lib/env";
import { requireAdminSession } from "@/lib/auth";
import { resolveAdminLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const SUPPORT_BRAND_LOGO_URL =
  "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/D-001.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzL0QtMDAxLnBuZyIsImlhdCI6MTc3NTkzNDgwMywiZXhwIjoxODA3NDcwODAzfQ.owIqb6_Dc2-wA9iUiisiOr-tnhUgbBW37ivTPCWCA74";

type RoleGroup = "support" | "it" | "owner";

type SidebarMenuItem = {
  id: string;
  title: string;
  desc: string;
  href: string;
  visibleTo: RoleGroup[];
};

const MENU_ITEMS: SidebarMenuItem[] = [
  {
    id: "1.2",
    title: "Users Directory & Lifecycle",
    desc: "Open user records, signup time, usage history, and package profile.",
    href: "#workspace-users",
    visibleTo: ["support", "owner"],
  },
  {
    id: "1.3",
    title: "Incoming User Reports",
    desc: "Review requests from Help Center with status flow and request ID tracking.",
    href: "#workspace-audit",
    visibleTo: ["support", "it", "owner"],
  },
  {
    id: "1.4",
    title: "Escalation to IT",
    desc: "Send unresolved cases to IT with full context and traceable reference.",
    href: "#support-escalation",
    visibleTo: ["support", "it", "owner"],
  },
  {
    id: "1.5",
    title: "Support Controlled Actions",
    desc: "Support actions with policy checks and approval flow where required.",
    href: "#support-scope",
    visibleTo: ["support", "owner"],
  },
  {
    id: "2.1",
    title: "IT Approval Queue",
    desc: "Approve high-impact operations from Support escalations.",
    href: "#support-escalation",
    visibleTo: ["it", "owner"],
  },
];

const SUPPORT_SCOPE_ITEMS = [
  "1.5.1 Change user package or service tier",
  "1.5.2 Cancel user account deletion request",
  "1.5.3 Request data recovery with IT or policy approval (1-2 days)",
  "1.5.4 Verify payment status and renew access per approval policy",
  "1.5.5 Investigate user-side issues and escalate to IT",
] as const;

const IT_SCOPE_ITEMS = [
  "Review escalated incidents from Support and approve final action",
  "Approve data recovery and high-risk account operations",
  "Authorize overdue payment exceptions for renewal",
] as const;

function resolveRoleGroup(role: string): RoleGroup {
  const normalized = role.toLowerCase();
  if (normalized === "super_admin" || normalized === "owner") return "owner";
  if (normalized === "approver" || normalized === "it" || normalized === "it_admin") return "it";
  return "support";
}

function roleDisplayText(group: RoleGroup, rawRole: string) {
  if (group === "owner") return `Current role: Owner (${rawRole})`;
  if (group === "it") return `Current role: IT / Approver (${rawRole})`;
  return `Current role: Support Admin (${rawRole})`;
}

export default async function HomePage() {
  const locale = await resolveAdminLocale();
  const { profile } = await requireAdminSession();
  const roleGroup = resolveRoleGroup(profile.role);

  const visibleMenuItems = MENU_ITEMS.filter((item) => item.visibleTo.includes(roleGroup));
  const showSupportScope = roleGroup === "support" || roleGroup === "owner";
  const showItScope = roleGroup === "it" || roleGroup === "owner";

  return (
    <>
      <main className="office-shell support-shell p-4 md:p-5">
        <aside className="support-sidebar">
          <div>
            <div className="support-brand-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Password Vault Logo" className="support-brand-logo" src={SUPPORT_BRAND_LOGO_URL} />
              <div>
                <p className="support-brand-company">Password Vault</p>
                <p className="support-brand-system">Support Backoffice</p>
              </div>
            </div>

            <p className="support-role-pill">{roleDisplayText(roleGroup, profile.role)}</p>

            <nav className="support-nav-list mt-4" aria-label="Support menu">
              {visibleMenuItems.map((menu) => (
                <a key={menu.id} className="support-nav-item support-nav-link" href={menu.href}>
                  <p className="support-nav-id">Menu {menu.id}</p>
                  <h2 className="support-nav-title">{menu.title}</h2>
                  <p className="support-nav-desc">{menu.desc}</p>
                </a>
              ))}
            </nav>
          </div>

          <article className="support-sidebar-note">
            <h3>Workflow Rule</h3>
            <p>Cases outside your current role scope must be escalated with a reference ID.</p>
          </article>
        </aside>

        <section className="support-main">
          <header className="panel support-hero" id="support-top">
            <span className="badge">Helpdesk Backoffice</span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{t(locale, "appTitle")}</h1>
            <p className="mt-2 max-w-4xl text-sm md:text-[15px] muted">{t(locale, "appSubtitle")}</p>
          </header>

          {showSupportScope ? (
            <section className="panel mt-4" id="support-scope">
              <h3 className="text-base font-semibold">Support Scope (1.5)</h3>
              <p className="mt-2 text-sm muted">
                Support can execute the following operations with policy checks and approval requirements.
              </p>
              <div className="support-scope-list mt-3">
                {SUPPORT_SCOPE_ITEMS.map((scope) => (
                  <article key={scope} className="support-scope-item">
                    {scope}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {showItScope ? (
            <section className="panel mt-4" id="support-escalation">
              <h3 className="text-base font-semibold">IT Escalation & Approval Scope</h3>
              <p className="mt-2 text-sm muted">
                IT/Approver validates and authorizes high-impact tasks submitted from Support operations.
              </p>
              <div className="support-scope-list mt-3">
                {IT_SCOPE_ITEMS.map((scope) => (
                  <article key={scope} className="support-scope-item">
                    {scope}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <DashboardLivePanels />

          <section className="office-grid mt-4" id="support-session">
            <article className="panel col-span-12 lg:col-span-6">
              <h3 className="text-base font-semibold">{t(locale, "sessionTitle")}</h3>
              <div className="mt-3 grid gap-2 text-sm">
                <p>
                  <strong>Name:</strong> {profile.full_name ?? "-"}
                </p>
                <p>
                  <strong>Email:</strong> {profile.email ?? "-"}
                </p>
                <p>
                  <strong>Role:</strong> {profile.role}
                </p>
                <p>
                  <strong>Status:</strong> {profile.status}
                </p>
                <p>
                  <strong>Source:</strong> {env.ADMIN_API_SOURCE}
                </p>
              </div>
            </article>

            <article className="panel col-span-12 lg:col-span-6" id="support-api">
              <h3 className="text-base font-semibold">{t(locale, "apiToolsTitle")}</h3>
              <div className="mt-3 flex flex-wrap gap-2.5 text-sm">
                <Link className="api-link" href="/api/health">
                  {t(locale, "apiHealth")}
                </Link>
                <Link className="api-link" href="/api/whoami">
                  {t(locale, "apiWhoAmI")}
                </Link>
                <Link className="api-link" href="/api/admin/stats">
                  {t(locale, "apiStats")}
                </Link>
                <Link className="api-link" href="/api/admin/audit-logs">
                  {t(locale, "apiAudit")}
                </Link>
                <Link className="api-link" href="/api/admin/users">
                  {t(locale, "apiUsers")}
                </Link>
              </div>
            </article>
          </section>

          <section className="panel mt-4" id="support-authority">
            <h3 className="text-base font-semibold">Authority Chain</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <article className="rounded-xl border border-[var(--line-soft)] bg-white/70 p-4">
                <h4 className="text-sm font-bold">Support Admin</h4>
                <p className="mt-2 text-sm muted">Handles frontline operations, account support, and first-line triage.</p>
              </article>
              <article className="rounded-xl border border-[var(--line-soft)] bg-white/70 p-4">
                <h4 className="text-sm font-bold">IT / Approver</h4>
                <p className="mt-2 text-sm muted">Reviews escalations, approves high-risk changes, and validates recovery requests.</p>
              </article>
              <article className="rounded-xl border border-[var(--line-soft)] bg-white/70 p-4">
                <h4 className="text-sm font-bold">Owner</h4>
                <p className="mt-2 text-sm muted">Owns policy decisions and highest authority operations across the backoffice.</p>
              </article>
            </div>
          </section>
        </section>
      </main>

      <section className="screen-warning">
        <div className="screen-warning-card">
          <h2 className="text-xl font-bold">{t(locale, "mobileNoticeTitle")}</h2>
          <p className="mt-2 text-sm muted">{t(locale, "mobileNoticeDesc")}</p>
        </div>
      </section>
    </>
  );
}
