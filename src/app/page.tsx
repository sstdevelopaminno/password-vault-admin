import { SupportWorkspace } from "@/components/support-workspace";
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
      id: "1",
      title: "แดชบอร์ด",
      desc: "ภาพรวมงานของทีม Support",
      href: "#workspace-dashboard",
      visibleTo: ["support", "owner", "it"],
    },
    {
      id: "2",
      title: "เช็ครายชื่อผู้ใช้งานทั่วไป",
      desc: "ดูข้อมูลและประวัติการใช้งานรายผู้ใช้",
      href: "#workspace-users-general",
      visibleTo: ["support", "owner"],
    },
    {
      id: "3",
      title: "คำร้องจากศูนย์ช่วยเหลือ",
      desc: "ติดตามคำร้อง ดำเนินการ และปิดงาน",
      href: "#workspace-tickets",
      visibleTo: ["support", "owner", "it"],
    },
    {
      id: "4",
      title: "ตรวจสอบยอดชำระเงิน",
      desc: "สถานะสำเร็จ ไม่สำเร็จ ค้างชำระ และต่ออายุ",
      href: "#workspace-billing",
      visibleTo: ["support", "owner"],
    },
    {
      id: "5",
      title: "กู้คืนข้อมูลผู้ใช้งาน",
      desc: "ยืนยัน OTP และติดตามผลการกู้คืนข้อมูล",
      href: "#workspace-recovery",
      visibleTo: ["support", "owner", "it"],
    },
  ],
  en: [
    {
      id: "1",
      title: "Dashboard",
      desc: "Support team daily overview",
      href: "#workspace-dashboard",
      visibleTo: ["support", "owner", "it"],
    },
    {
      id: "2",
      title: "General Users",
      desc: "Inspect user profile and usage history",
      href: "#workspace-users-general",
      visibleTo: ["support", "owner"],
    },
    {
      id: "3",
      title: "Help Center Tickets",
      desc: "Track, process, resolve, or cancel requests",
      href: "#workspace-tickets",
      visibleTo: ["support", "owner", "it"],
    },
    {
      id: "4",
      title: "Billing Monitor",
      desc: "Paid, failed, pending, and renewal operations",
      href: "#workspace-billing",
      visibleTo: ["support", "owner"],
    },
    {
      id: "5",
      title: "Data Recovery",
      desc: "OTP validation and recovery completion flow",
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

export default async function HomePage() {
  const locale = await resolveAdminLocale();
  const { profile } = await requireAdminSession();
  const roleGroup = resolveRoleGroup(profile.role);
  const visibleMenuItems = MENU_ITEMS[locale].filter((item) => item.visibleTo.includes(roleGroup));

  return (
    <>
      <main className="office-shell support-shell p-4 md:p-5">
        <aside className="support-sidebar">
          <div className="support-sidebar-top">
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
              <p className="support-nav-heading">{locale === "th" ? "เมนู" : "Menu"}</p>
              {visibleMenuItems.map((menu, index) => (
                <a
                  key={menu.id}
                  className={`support-nav-item support-nav-link ${index === 0 ? "support-nav-item-active" : ""}`}
                  href={menu.href}
                  title={menu.desc}
                >
                  <span aria-hidden className="support-nav-index">
                    {menu.id}
                  </span>
                  <span className="support-nav-content">
                    <span className="support-nav-title">{menu.title}</span>
                    <span className="support-nav-desc">{menu.desc}</span>
                  </span>
                </a>
              ))}
            </nav>
          </div>

          <article className="support-sidebar-note">
            <h3>{locale === "th" ? "Workflow Rule" : "Workflow Rule"}</h3>
            <p>
              {locale === "th"
                ? "ทุกการดำเนินการของ Support จะถูกบันทึกและตรวจสอบย้อนกลับได้"
                : "Every support action is logged for traceability and escalation control."}
            </p>
          </article>
        </aside>

        <section className="support-main">
          <header className="panel support-hero" id="support-top">
            <div className="support-hero-top">
              <span className="badge">Helpdesk Backoffice</span>
              <span className="support-hero-role">{roleDisplayText(locale, roleGroup, profile.role)}</span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{t(locale, "appTitle")}</h1>
            <p className="mt-2 max-w-4xl text-sm md:text-[15px] muted">{t(locale, "appSubtitle")}</p>
          </header>

          <SupportWorkspace locale={locale} roleGroup={roleGroup} />
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
