import Link from "next/link";
import { DashboardLivePanels } from "@/components/dashboard-live-panels";
import { env } from "@/lib/env";
import { requireAdminSession } from "@/lib/auth";
import { resolveAdminLocale, t, type AdminLocale } from "@/lib/i18n";

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

const MENU_ITEMS: Record<AdminLocale, SidebarMenuItem[]> = {
  th: [
    {
      id: "1.1",
      title: "แดชบอร์ดงาน Support",
      desc: "ภาพรวมงานรายวัน เคสค้าง และสถานะการดำเนินงานของทีม",
      href: "#workspace-dashboard",
      visibleTo: ["support", "it", "owner"],
    },
    {
      id: "1.2",
      title: "จัดการรายการผู้ใช้งาน",
      desc: "ดูอีเมล วันที่สมัคร ประวัติใช้งาน แพ็กเกจ และกิจกรรมสำคัญ",
      href: "#workspace-users-general",
      visibleTo: ["support", "owner"],
    },
    {
      id: "1.2.1",
      title: "จัดการผู้ใช้งานระบบหลังบ้าน",
      desc: "แยกรายการ Approver / Admin / Super Admin ออกจากผู้ใช้งานทั่วไป",
      href: "#workspace-users-backoffice",
      visibleTo: ["support", "it", "owner"],
    },
    {
      id: "1.3",
      title: "ศูนย์ช่วยเหลือผู้ใช้งาน",
      desc: "รับเรื่องจากผู้ใช้งาน ติดตามสถานะ รับเรื่อง / ดำเนินการ / เสร็จสิ้น",
      href: "#workspace-audit",
      visibleTo: ["support", "it", "owner"],
    },
    {
      id: "1.4",
      title: "ส่งต่อคำร้องทีม IT",
      desc: "Escalation เคสที่เกินขอบเขต Support พร้อมเลขอ้างอิงและหลักฐาน",
      href: "#support-escalation",
      visibleTo: ["support", "it", "owner"],
    },
    {
      id: "1.5",
      title: "สิทธิ์ที่ Support จัดการได้",
      desc: "เปลี่ยนแพ็กเกจ ยกเลิกลบบัญชี ตรวจชำระเงิน และงานกู้ข้อมูลตามเงื่อนไข",
      href: "#support-scope",
      visibleTo: ["support", "owner"],
    },
    {
      id: "2.1",
      title: "คิวอนุมัติของ IT",
      desc: "อนุมัติงานที่มีผลกระทบสูงจากคำร้องที่ส่งต่อขึ้นมา",
      href: "#support-escalation",
      visibleTo: ["it", "owner"],
    },
  ],
  en: [
    {
      id: "1.1",
      title: "Support Dashboard",
      desc: "Daily overview for queue, pending cases, and team execution status.",
      href: "#workspace-dashboard",
      visibleTo: ["support", "it", "owner"],
    },
    {
      id: "1.2",
      title: "Users Directory",
      desc: "Review account email, signup date, usage history, package, and key events.",
      href: "#workspace-users-general",
      visibleTo: ["support", "owner"],
    },
    {
      id: "1.2.1",
      title: "Backoffice Users",
      desc: "Separate Approver/Admin/Super Admin from general user accounts.",
      href: "#workspace-users-backoffice",
      visibleTo: ["support", "it", "owner"],
    },
    {
      id: "1.3",
      title: "Help Center Queue",
      desc: "Track user reports with status flow: received / in progress / resolved.",
      href: "#workspace-audit",
      visibleTo: ["support", "it", "owner"],
    },
    {
      id: "1.4",
      title: "Escalation to IT",
      desc: "Escalate out-of-scope issues with complete context and traceable ID.",
      href: "#support-escalation",
      visibleTo: ["support", "it", "owner"],
    },
    {
      id: "1.5",
      title: "Support Action Scope",
      desc: "Package, account deletion cancellation, payment checks, and controlled recovery.",
      href: "#support-scope",
      visibleTo: ["support", "owner"],
    },
    {
      id: "2.1",
      title: "IT Approval Queue",
      desc: "Approve high-impact operations escalated from Support team.",
      href: "#support-escalation",
      visibleTo: ["it", "owner"],
    },
  ],
};

const SUPPORT_SCOPE_ITEMS: Record<AdminLocale, readonly string[]> = {
  th: [
    "1.5.1 แก้ไขหรือเปลี่ยนแพ็กเกจบริการของผู้ใช้งาน",
    "1.5.2 ยกเลิกคำขอลบบัญชีผู้ใช้งาน",
    "1.5.3 ขอคืนข้อมูลเมื่อผ่านการอนุมัติจาก IT หรือระบบอนุมัติ",
    "1.5.4 ตรวจสอบยอดชำระเงิน สำเร็จ/ไม่สำเร็จ/ค้าง และต่ออายุภายใต้เงื่อนไข",
    "1.5.5 ตรวจสอบปัญหาการใช้งานและส่งรายงานต่อไปยังทีม IT",
  ],
  en: [
    "1.5.1 Change user package or service tier",
    "1.5.2 Cancel account deletion request",
    "1.5.3 Request data recovery with IT/system approval",
    "1.5.4 Verify payment status and renew service under policy rules",
    "1.5.5 Investigate user-side issue and escalate to IT",
  ],
};

const IT_SCOPE_ITEMS: Record<AdminLocale, readonly string[]> = {
  th: [
    "ตรวจสอบและอนุมัติคำร้องที่ถูกส่งต่อจากทีม Support",
    "อนุมัติการกู้ข้อมูลและรายการที่กระทบข้อมูลสำคัญ",
    "อนุมัติกรณีการต่ออายุที่มีเงื่อนไขพิเศษ",
  ],
  en: [
    "Review and approve escalated cases from Support",
    "Authorize data recovery and high-impact operations",
    "Approve exceptional renewal requests",
  ],
};

const STATIC_LABELS: Record<
  AdminLocale,
  {
    brandSystem: string;
    workflowRuleTitle: string;
    workflowRuleDesc: string;
    supportScopeTitle: string;
    supportScopeDesc: string;
    itScopeTitle: string;
    itScopeDesc: string;
    authorityChainTitle: string;
    supportCardTitle: string;
    supportCardDesc: string;
    itCardTitle: string;
    itCardDesc: string;
    ownerCardTitle: string;
    ownerCardDesc: string;
  }
> = {
  th: {
    brandSystem: "ระบบจัดการฝ่าย Support",
    workflowRuleTitle: "กฎการทำงาน",
    workflowRuleDesc: "รายการที่เกินสิทธิ์ของบทบาทปัจจุบัน ต้องส่งต่อพร้อมเลขอ้างอิงทุกครั้ง",
    supportScopeTitle: "ขอบเขตการทำงานของฝ่าย Support (1.5)",
    supportScopeDesc: "รายการต่อไปนี้คือสิทธิ์ที่ฝ่าย Support ดำเนินการได้ตามนโยบายระบบ",
    itScopeTitle: "ขอบเขตงานอนุมัติของ IT",
    itScopeDesc: "สำหรับงานที่ต้องอนุมัติขั้นสูงจากทีม IT/Approver ก่อนดำเนินการ",
    authorityChainTitle: "โครงสร้างสายงานอนุมัติ",
    supportCardTitle: "Support Admin",
    supportCardDesc: "รับเรื่องผู้ใช้งาน แก้ไขปัญหาเบื้องต้น และจัดการคำร้องในขอบเขตสิทธิ์",
    itCardTitle: "IT / Approver",
    itCardDesc: "ตรวจสอบคำร้องที่ส่งต่อ อนุมัติรายการสำคัญ และกำกับความเสี่ยงระบบ",
    ownerCardTitle: "Owner",
    ownerCardDesc: "กำหนดนโยบายสิทธิ์ระดับสูง และควบคุมการตัดสินใจเชิงระบบ",
  },
  en: {
    brandSystem: "Support Backoffice",
    workflowRuleTitle: "Workflow Rule",
    workflowRuleDesc: "Cases outside your role scope must be escalated with a reference ID.",
    supportScopeTitle: "Support Scope (1.5)",
    supportScopeDesc: "Support operators can execute the following operations under policy checks.",
    itScopeTitle: "IT Escalation & Approval Scope",
    itScopeDesc: "High-impact operations require IT/Approver validation before execution.",
    authorityChainTitle: "Authority Chain",
    supportCardTitle: "Support Admin",
    supportCardDesc: "Handles frontline user support and controlled service operations.",
    itCardTitle: "IT / Approver",
    itCardDesc: "Validates escalated requests and approves high-risk operations.",
    ownerCardTitle: "Owner",
    ownerCardDesc: "Maintains policy control and highest authority decisions.",
  },
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

export default async function HomePage() {
  const locale = await resolveAdminLocale();
  const labels = STATIC_LABELS[locale];
  const { profile } = await requireAdminSession();
  const roleGroup = resolveRoleGroup(profile.role);

  const visibleMenuItems = MENU_ITEMS[locale].filter((item) => item.visibleTo.includes(roleGroup));
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
                <p className="support-brand-system">{labels.brandSystem}</p>
              </div>
            </div>

            <p className="support-role-pill">{roleDisplayText(locale, roleGroup, profile.role)}</p>

            <nav className="support-nav-list mt-4" aria-label="Support menu">
              {visibleMenuItems.map((menu) => (
                <a key={menu.id} className="support-nav-item support-nav-link" href={menu.href}>
                  <p className="support-nav-id">{locale === "th" ? "เมนู" : "Menu"} {menu.id}</p>
                  <h2 className="support-nav-title">{menu.title}</h2>
                  <p className="support-nav-desc">{menu.desc}</p>
                </a>
              ))}
            </nav>
          </div>

          <article className="support-sidebar-note">
            <h3>{labels.workflowRuleTitle}</h3>
            <p>{labels.workflowRuleDesc}</p>
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
              <h3 className="text-base font-semibold">{labels.supportScopeTitle}</h3>
              <p className="mt-2 text-sm muted">{labels.supportScopeDesc}</p>
              <div className="support-scope-list mt-3">
                {SUPPORT_SCOPE_ITEMS[locale].map((scope) => (
                  <article key={scope} className="support-scope-item">
                    {scope}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {showItScope ? (
            <section className="panel mt-4" id="support-escalation">
              <h3 className="text-base font-semibold">{labels.itScopeTitle}</h3>
              <p className="mt-2 text-sm muted">{labels.itScopeDesc}</p>
              <div className="support-scope-list mt-3">
                {IT_SCOPE_ITEMS[locale].map((scope) => (
                  <article key={scope} className="support-scope-item">
                    {scope}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <DashboardLivePanels locale={locale} />

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
            <h3 className="text-base font-semibold">{labels.authorityChainTitle}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <article className="rounded-xl border border-[var(--line-soft)] bg-white/70 p-4">
                <h4 className="text-sm font-bold">{labels.supportCardTitle}</h4>
                <p className="mt-2 text-sm muted">{labels.supportCardDesc}</p>
              </article>
              <article className="rounded-xl border border-[var(--line-soft)] bg-white/70 p-4">
                <h4 className="text-sm font-bold">{labels.itCardTitle}</h4>
                <p className="mt-2 text-sm muted">{labels.itCardDesc}</p>
              </article>
              <article className="rounded-xl border border-[var(--line-soft)] bg-white/70 p-4">
                <h4 className="text-sm font-bold">{labels.ownerCardTitle}</h4>
                <p className="mt-2 text-sm muted">{labels.ownerCardDesc}</p>
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
