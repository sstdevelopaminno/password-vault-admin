import { headers } from "next/headers";

export type AdminLocale = "th" | "en";

type MessageKey =
  | "appTitle"
  | "appSubtitle"
  | "serviceDesk"
  | "serviceDeskHint"
  | "auditCenter"
  | "auditCenterHint"
  | "billingCenter"
  | "billingCenterHint"
  | "roleControl"
  | "roleControlHint"
  | "sessionTitle"
  | "authorityTitle"
  | "authorityAdmin"
  | "authorityAdminDesc"
  | "authorityOwner"
  | "authorityOwnerDesc"
  | "authorityApprover"
  | "authorityApproverDesc"
  | "mobileNoticeTitle"
  | "mobileNoticeDesc"
  | "apiToolsTitle"
  | "apiHealth"
  | "apiWhoAmI"
  | "apiStats"
  | "apiAudit"
  | "apiUsers";

const messages: Record<AdminLocale, Record<MessageKey, string>> = {
  th: {
    appTitle: "ศูนย์ปฏิบัติการ Password Vault",
    appSubtitle:
      "แดชบอร์ดสำหรับทีมสนับสนุนและเจ้าหน้าที่ IT ใช้งานบนคอมพิวเตอร์และแท็บเล็ต เพื่อดูแลผู้ใช้ ฝ่ายบริการ และงานตรวจสอบระบบ",
    serviceDesk: "Service Desk",
    serviceDeskHint: "จัดการคำขอผู้ใช้งานและติดตามงานแก้ไขปัญหา",
    auditCenter: "Audit & Compliance",
    auditCenterHint: "ติดตามประวัติการใช้งานและตรวจสอบเหตุการณ์สำคัญ",
    billingCenter: "Billing Operations",
    billingCenterHint: "ดูแลสถานะการชำระค่าบริการและแผนใช้งาน",
    roleControl: "Role & Permission Control",
    roleControlHint: "แยกสิทธิ์ Approver / Admin / Owner แบบชัดเจน",
    sessionTitle: "ข้อมูลเจ้าหน้าที่ที่กำลังใช้งาน",
    authorityTitle: "โครงสร้างอำนาจในระบบหลังบ้าน",
    authorityAdmin: "Admin",
    authorityAdminDesc: "แก้ไขข้อมูลผู้ใช้ ปรับสถานะ และจัดการงานสนับสนุน",
    authorityOwner: "Owner (Super Admin)",
    authorityOwnerDesc: "สิทธิ์สูงสุด: ลบข้อมูลสำคัญ เปลี่ยนนโยบาย และควบคุมการเงิน",
    authorityApprover: "Approver",
    authorityApproverDesc: "อนุมัติคำขอที่ต้องมีการยืนยันก่อนใช้งานจริง",
    mobileNoticeTitle: "มุมมองจำกัดบนหน้าจอขนาดเล็ก",
    mobileNoticeDesc: "ระบบหลังบ้านนี้ออกแบบเพื่อ PC และแท็บเล็ต กรุณาเปิดผ่านหน้าจอที่ใหญ่ขึ้น",
    apiToolsTitle: "เครื่องมือ API สำหรับทีม IT",
    apiHealth: "ตรวจสถานะระบบ",
    apiWhoAmI: "ตรวจ session ปัจจุบัน",
    apiStats: "ดูสรุปสถิติระบบ",
    apiAudit: "ดึง Audit Logs",
    apiUsers: "ดูผู้ใช้งานทั้งหมด",
  },
  en: {
    appTitle: "Password Vault Operations Center",
    appSubtitle:
      "Desktop and tablet control panel for support agents and IT staff to handle users, service operations, and security oversight.",
    serviceDesk: "Service Desk",
    serviceDeskHint: "Handle user requests and track incident resolution tasks",
    auditCenter: "Audit & Compliance",
    auditCenterHint: "Monitor traceability and investigate sensitive events",
    billingCenter: "Billing Operations",
    billingCenterHint: "Track service plans and payment operations",
    roleControl: "Role & Permission Control",
    roleControlHint: "Clear separation across Approver / Admin / Owner roles",
    sessionTitle: "Current Staff Session",
    authorityTitle: "Backoffice Authority Model",
    authorityAdmin: "Admin",
    authorityAdminDesc: "Manage users, statuses, and support operations",
    authorityOwner: "Owner (Super Admin)",
    authorityOwnerDesc: "Highest authority: destructive actions, policy control, billing control",
    authorityApprover: "Approver",
    authorityApproverDesc: "Review and approve requests before activation",
    mobileNoticeTitle: "Limited on small screens",
    mobileNoticeDesc: "This backoffice is designed for desktop and tablet usage. Please open on a larger screen.",
    apiToolsTitle: "IT API Utilities",
    apiHealth: "Health Check",
    apiWhoAmI: "Current Session",
    apiStats: "System Stats",
    apiAudit: "Audit Logs",
    apiUsers: "Users Directory",
  },
};

export async function resolveAdminLocale(): Promise<AdminLocale> {
  const requestHeaders = await headers();
  const acceptLanguage = (requestHeaders.get("accept-language") ?? "").toLowerCase();
  return acceptLanguage.includes("th") ? "th" : "en";
}

export function t(locale: AdminLocale, key: MessageKey) {
  return messages[locale][key];
}
