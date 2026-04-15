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
      "ระบบสำหรับทีม Support และทีม IT เพื่อดูแลผู้ใช้งาน ตรวจสอบรายการ และติดตามเหตุการณ์สำคัญของระบบแบบรวมศูนย์",
    serviceDesk: "ศูนย์บริการผู้ใช้งาน",
    serviceDeskHint: "จัดการคำร้องและติดตามการแก้ไขปัญหาของผู้ใช้งาน",
    auditCenter: "ตรวจสอบและคอมพลายแอนซ์",
    auditCenterHint: "ติดตามประวัติการใช้งานและรายการความเสี่ยงสำคัญ",
    billingCenter: "งานชำระเงินและแพ็กเกจ",
    billingCenterHint: "ดูสถานะการชำระเงินและแผนบริการของผู้ใช้งาน",
    roleControl: "สิทธิ์และการอนุมัติ",
    roleControlHint: "กำหนดและแยกสิทธิ์ Support / IT / Owner ให้ชัดเจน",
    sessionTitle: "ข้อมูลเจ้าหน้าที่ที่กำลังใช้งาน",
    authorityTitle: "โครงสร้างอำนาจในระบบหลังบ้าน",
    authorityAdmin: "Support Admin",
    authorityAdminDesc: "ดูแลคำร้องผู้ใช้งานและงานปฏิบัติการประจำวัน",
    authorityOwner: "Owner (Super Admin)",
    authorityOwnerDesc: "สิทธิ์สูงสุดสำหรับนโยบายและการควบคุมระบบ",
    authorityApprover: "IT / Approver",
    authorityApproverDesc: "ตรวจสอบและอนุมัติรายการที่กระทบความปลอดภัยหรือข้อมูลสำคัญ",
    mobileNoticeTitle: "หน้าจอนี้เหมาะกับ Desktop/Tablet",
    mobileNoticeDesc: "กรุณาใช้งานผ่านหน้าจอขนาดใหญ่เพื่อประสบการณ์ที่สมบูรณ์",
    apiToolsTitle: "เครื่องมือ API สำหรับทีมงาน",
    apiHealth: "ตรวจสุขภาพระบบ",
    apiWhoAmI: "ตรวจสอบเซสชันปัจจุบัน",
    apiStats: "สรุปสถิติระบบ",
    apiAudit: "ดูบันทึก Audit",
    apiUsers: "รายการผู้ใช้งาน",
  },
  en: {
    appTitle: "Password Vault Operations Center",
    appSubtitle:
      "Backoffice workspace for Support and IT teams to manage users, operations, and critical system events from one place.",
    serviceDesk: "Service Desk",
    serviceDeskHint: "Handle user requests and incident workflows",
    auditCenter: "Audit & Compliance",
    auditCenterHint: "Track system events and sensitive activities",
    billingCenter: "Billing Operations",
    billingCenterHint: "Review payments and subscription packages",
    roleControl: "Role & Permission Control",
    roleControlHint: "Separate Support / IT / Owner privileges clearly",
    sessionTitle: "Current Staff Session",
    authorityTitle: "Backoffice Authority Model",
    authorityAdmin: "Support Admin",
    authorityAdminDesc: "Handle daily user support operations",
    authorityOwner: "Owner (Super Admin)",
    authorityOwnerDesc: "Highest authority for policy and system governance",
    authorityApprover: "IT / Approver",
    authorityApproverDesc: "Review and approve high-impact requests",
    mobileNoticeTitle: "Best on Desktop/Tablet",
    mobileNoticeDesc: "Please open this backoffice on a larger screen for full experience.",
    apiToolsTitle: "API Utilities",
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
