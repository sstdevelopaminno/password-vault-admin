"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UiLocale = "th" | "en";
type RoleGroup = "support" | "it" | "owner";
type MenuTab = "dashboard" | "users" | "tickets" | "billing" | "recovery";

type StatsPayload = {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  pendingApprovals: number;
  reviewedApprovals24h: number;
  recentSensitiveActions24h: number;
};

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
};

type SupportTicketRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  updatedAt: string;
};

type BillingRow = {
  userId: string;
  userName: string;
  userEmail: string;
  packageType: string;
  paymentStatus: string;
  amount: number | null;
  expiresAt: string | null;
};

type RecoveryRow = {
  userId: string;
  userName: string;
  userEmail: string;
  status: "idle" | "requested" | "otp_verified" | "completed" | "rejected";
  lastActionAt: string | null;
};

type BillingDraft = {
  packageType: string;
  paymentStatus: string;
  amount: string;
  expiresAt: string;
};

type ToastKind = "success" | "error";

type ToastState = {
  id: number;
  kind: ToastKind;
  message: string;
};

type UserInsight = {
  profile: {
    id: string;
    email: string | null;
    fullName: string | null;
    createdAt: string;
    status: string;
  };
  usage: {
    accountAgeText: string;
    vaultItemsCount: number;
    supportTicketCount: number;
    openIssueCount: number;
    copyActionCount: number;
    pinIssueCount: number;
    uiIssueCount: number;
  };
  plan: {
    packageType: string;
    paymentStatus: string;
    expiresAt: string | null;
  };
  recentActivities: Array<{
    id: string;
    actionType: string | null;
    createdAt: string;
  }>;
};

const HASH_TO_TAB: Record<string, MenuTab> = {
  "#workspace-dashboard": "dashboard",
  "#workspace-users-general": "users",
  "#workspace-tickets": "tickets",
  "#workspace-billing": "billing",
  "#workspace-recovery": "recovery",
};

const TAB_TO_HASH: Record<MenuTab, string> = {
  dashboard: "workspace-dashboard",
  users: "workspace-users-general",
  tickets: "workspace-tickets",
  billing: "workspace-billing",
  recovery: "workspace-recovery",
};

const UNAUTHORIZED_ERROR = "Unauthorized";

const TEXT = {
  th: {
    dashboard: "แดชบอร์ด",
    users: "เช็ครายชื่อผู้ใช้งานทั่วไป",
    tickets: "คำร้องจากศูนย์ช่วยเหลือ",
    billing: "ตรวจสอบยอดชำระเงิน",
    recovery: "กู้คืนข้อมูลผู้ใช้งาน",
    refresh: "รีเฟรช",
    loading: "กำลังโหลดข้อมูล...",
    noData: "ไม่พบข้อมูล",
    details: "ดูรายละเอียด",
    close: "ปิด",
    save: "บันทึก",
    renew: "ต่ออายุ",
    inProgress: "กำลังดำเนินการ",
    resolved: "เสร็จสิ้น",
    cancelTicket: "ยกเลิกคำร้อง",
    recoveryRequest: "เริ่มคำขอกู้คืน",
    recoveryOtp: "ยืนยัน OTP",
    recoveryDone: "ยืนยันกู้คืนสำเร็จ",
    recoveryReject: "ปฏิเสธ",
    cancelDelete: "ยกเลิกลบบัญชี",
    searchUser: "ค้นหาผู้ใช้งาน...",
    signOut: "ออกจากระบบ",
  },
  en: {
    dashboard: "Dashboard",
    users: "General Users",
    tickets: "Help Center Tickets",
    billing: "Billing Monitor",
    recovery: "Data Recovery",
    refresh: "Refresh",
    loading: "Loading...",
    noData: "No data found",
    details: "Details",
    close: "Close",
    save: "Save",
    renew: "Renew",
    inProgress: "In Progress",
    resolved: "Resolved",
    cancelTicket: "Cancel Ticket",
    recoveryRequest: "Request Recovery",
    recoveryOtp: "Verify OTP",
    recoveryDone: "Complete Recovery",
    recoveryReject: "Reject",
    cancelDelete: "Cancel Deletion",
    searchUser: "Search users...",
    signOut: "Sign Out",
  },
};

function formatDate(value: string | null, locale: UiLocale) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeApiError(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  return fallback;
}

function localized(locale: UiLocale, th: string, en: string) {
  return locale === "th" ? th : en;
}

function formatPackageLabel(locale: UiLocale, value: string) {
  const map: Record<string, string> = locale === "th"
    ? { free: "ฟรี", monthly: "รายเดือน", annual: "รายปี" }
    : { free: "Free", monthly: "Monthly", annual: "Annual" };
  return map[value] ?? value;
}

function formatPaymentLabel(locale: UiLocale, value: string) {
  const map: Record<string, string> = locale === "th"
    ? { paid: "ชำระสำเร็จ", failed: "ชำระไม่สำเร็จ", pending: "รอดำเนินการ", overdue: "ค้างชำระ" }
    : { paid: "Paid", failed: "Failed", pending: "Pending", overdue: "Overdue" };
  return map[value] ?? value;
}

function formatStatusLabel(locale: UiLocale, value: string) {
  const map: Record<string, string> = locale === "th"
    ? {
      open: "เปิดรายการ",
      in_progress: "กำลังดำเนินการ",
      resolved: "เสร็จสิ้น",
      closed: "ปิดรายการ",
      idle: "รอคำขอ",
      requested: "ส่งคำขอแล้ว",
      otp_verified: "ยืนยัน OTP แล้ว",
      completed: "กู้คืนสำเร็จ",
      rejected: "ปฏิเสธ",
      active: "ใช้งาน",
      pending_approval: "รออนุมัติ",
      pending: "รอดำเนินการ",
      disabled: "ปิดใช้งาน",
    }
    : {
      open: "Open",
      in_progress: "In Progress",
      resolved: "Resolved",
      closed: "Closed",
      idle: "Idle",
      requested: "Requested",
      otp_verified: "OTP Verified",
      completed: "Completed",
      rejected: "Rejected",
      active: "Active",
      pending_approval: "Pending Approval",
      pending: "Pending",
      disabled: "Disabled",
    };
  return map[value] ?? value;
}

export function SupportWorkspace({ locale, roleGroup }: { locale: UiLocale; roleGroup: RoleGroup }) {
  const text = TEXT[locale];
  const [activeTab, setActiveTab] = useState<MenuTab>("dashboard");

  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [billing, setBilling] = useState<BillingRow[]>([]);
  const [billingDrafts, setBillingDrafts] = useState<Record<string, BillingDraft>>({});
  const [recovery, setRecovery] = useState<RecoveryRow[]>([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [insight, setInsight] = useState<UserInsight | null>(null);

  const pushToast = useCallback((kind: ToastKind, message: string) => {
    setToast({ id: Date.now(), kind, message });
  }, []);

  const tabs = useMemo(() => {
    if (roleGroup === "it") {
      return [
        { id: "dashboard" as const, label: text.dashboard },
        { id: "tickets" as const, label: text.tickets },
        { id: "recovery" as const, label: text.recovery },
      ];
    }
    return [
      { id: "dashboard" as const, label: text.dashboard },
      { id: "users" as const, label: text.users },
      { id: "tickets" as const, label: text.tickets },
      { id: "billing" as const, label: text.billing },
      { id: "recovery" as const, label: text.recovery },
    ];
  }, [roleGroup, text.billing, text.dashboard, text.recovery, text.tickets, text.users]);

  const fetchJson = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { credentials: "include", cache: "no-store", ...(init ?? {}) });
    if (response.status === 401 || response.status === 403) {
      window.location.href = "/login?timeout=1";
      throw new Error(UNAUTHORIZED_ERROR);
    }
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(normalizeApiError(body, localized(locale, "ไม่สามารถทำรายการได้", "Request failed")));
    }
    return body;
  }, [locale]);

  const loadCurrentMenu = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "dashboard") {
        setStats((await fetchJson("/api/admin/stats")) as StatsPayload);
      }
      if (activeTab === "users") {
        const payload = (await fetchJson("/api/admin/users?limit=50&accountType=general")) as { users: UserRow[] };
        setUsers(payload.users ?? []);
      }
      if (activeTab === "tickets") {
        const payload = (await fetchJson("/api/admin/support-tickets")) as { tickets: SupportTicketRow[] };
        setTickets(payload.tickets ?? []);
      }
      if (activeTab === "billing") {
        const payload = (await fetchJson("/api/admin/support-billing")) as { rows: BillingRow[] };
        const rows = payload.rows ?? [];
        setBilling(rows);
        const nextDrafts: Record<string, BillingDraft> = {};
        for (const row of rows) {
          nextDrafts[row.userId] = {
            packageType: row.packageType,
            paymentStatus: row.paymentStatus,
            amount: row.amount === null ? "" : String(row.amount),
            expiresAt: row.expiresAt?.slice(0, 10) ?? "",
          };
        }
        setBillingDrafts(nextDrafts);
      }
      if (activeTab === "recovery") {
        const payload = (await fetchJson("/api/admin/support-recovery")) as { rows: RecoveryRow[] };
        setRecovery(payload.rows ?? []);
      }
    } catch (err) {
      if (err instanceof Error && err.message === UNAUTHORIZED_ERROR) return;
      pushToast("error", err instanceof Error ? err.message : localized(locale, "โหลดข้อมูลไม่สำเร็จ", "Unable to load data"));
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchJson, locale, pushToast]);

  useEffect(() => {
    const applyHash = () => {
      const mapped = HASH_TO_TAB[window.location.hash];
      if (mapped) setActiveTab(mapped);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    void loadCurrentMenu();
  }, [loadCurrentMenu]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onRefreshMenu = () => {
      void loadCurrentMenu();
    };
    window.addEventListener("support:refresh-current-menu", onRefreshMenu);
    return () => window.removeEventListener("support:refresh-current-menu", onRefreshMenu);
  }, [loadCurrentMenu]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((user) => [user.full_name ?? "", user.email ?? ""].join(" ").toLowerCase().includes(keyword));
  }, [search, users]);

  async function openUserInsight(user: UserRow) {
    setSelectedUser(user);
    setInsight(null);
    try {
      setInsight((await fetchJson(`/api/admin/support-user-insights?userId=${user.id}`)) as UserInsight);
    } catch (err) {
      if (err instanceof Error && err.message === UNAUTHORIZED_ERROR) return;
      pushToast("error", err instanceof Error ? err.message : localized(locale, "โหลดข้อมูลผู้ใช้ไม่สำเร็จ", "Unable to load user details"));
    }
  }

  async function updateTicket(ticketId: string, action: "in_progress" | "resolved" | "cancel") {
    try {
      const body = await fetchJson("/api/admin/support-tickets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId, action }),
      });
      pushToast("success", (body as { message?: string }).message ?? localized(locale, "อัปเดตคำร้องแล้ว", "Ticket updated"));
      void loadCurrentMenu();
    } catch (err) {
      if (err instanceof Error && err.message === UNAUTHORIZED_ERROR) return;
      pushToast("error", err instanceof Error ? err.message : localized(locale, "อัปเดตคำร้องไม่สำเร็จ", "Ticket update failed"));
    }
  }

  async function updateBilling(user: BillingRow, renew = false) {
    try {
      const draft = billingDrafts[user.userId];
      const body = await fetchJson("/api/admin/support-billing", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          packageType: draft?.packageType ?? user.packageType,
          paymentStatus: draft?.paymentStatus ?? user.paymentStatus,
          amount: draft?.amount ? Number(draft.amount) : user.amount,
          expiresAt: draft?.expiresAt ?? user.expiresAt,
          renew,
        }),
      });
      pushToast("success", (body as { message?: string }).message ?? localized(locale, "อัปเดตการชำระเงินแล้ว", "Billing updated"));
      void loadCurrentMenu();
    } catch (err) {
      if (err instanceof Error && err.message === UNAUTHORIZED_ERROR) return;
      pushToast("error", err instanceof Error ? err.message : localized(locale, "อัปเดตการชำระเงินไม่สำเร็จ", "Billing update failed"));
    }
  }

  async function runRecovery(userId: string, action: "request" | "verify_otp" | "complete" | "reject" | "cancel_delete") {
    try {
      const otpCode = action === "verify_otp" ? window.prompt(localized(locale, "\u0E01\u0E23\u0E2D\u0E01\u0E23\u0E2B\u0E31\u0E2A OTP 6 \u0E2B\u0E25\u0E31\u0E01", "Enter 6-digit OTP")) ?? "" : undefined;
      const body = await fetchJson("/api/admin/support-recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, action, otpCode }),
      });
      const payload = body as { message?: string; timestamp?: string };
      const completedAt = payload.timestamp
        ? `${localized(locale, "\u0E40\u0E27\u0E25\u0E32", "at")} ${formatDate(payload.timestamp, locale)}`
        : "";
      pushToast(
        "success",
        `${payload.message ?? localized(locale, "\u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15\u0E01\u0E23\u0E30\u0E1A\u0E27\u0E19\u0E01\u0E32\u0E23\u0E01\u0E39\u0E49\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E41\u0E25\u0E49\u0E27", "Recovery updated")}${completedAt ? ` | ${completedAt}` : ""}`,
      );
      void loadCurrentMenu();
    } catch (err) {
      if (err instanceof Error && err.message === UNAUTHORIZED_ERROR) return;
      pushToast("error", err instanceof Error ? err.message : localized(locale, "\u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15\u0E01\u0E23\u0E30\u0E1A\u0E27\u0E19\u0E01\u0E32\u0E23\u0E01\u0E39\u0E49\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08", "Recovery update failed"));
    }
  }

  return (
    <>
      <div className="workspace-anchor" id="workspace-dashboard" />
      <div className="workspace-anchor" id="workspace-users-general" />
      <div className="workspace-anchor" id="workspace-tickets" />
      <div className="workspace-anchor" id="workspace-billing" />
      <div className="workspace-anchor" id="workspace-recovery" />

      <section className="panel workspace-tabs-panel mt-4">
        <div className="workspace-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`workspace-tab ${activeTab === tab.id ? "workspace-tab-active" : ""}`}
              onClick={() => {
                setActiveTab(tab.id);
                window.location.hash = TAB_TO_HASH[tab.id];
              }}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {toast ? (
        <div className="toast-stack" aria-atomic="true" aria-live="polite">
          <article className={`toast-card toast-${toast.kind}`} role="status">
            <span className="toast-icon" aria-hidden>{toast.kind === "success" ? "\u2713" : "!"}</span>
            <p className="toast-message">{toast.message}</p>
            <button className="toast-close" onClick={() => setToast(null)} type="button">{text.close}</button>
          </article>
        </div>
      ) : null}

      {loading ? <p className="panel mt-4 text-sm muted">{text.loading}</p> : null}

      {!loading && activeTab === "dashboard" ? (
        <section className="panel mt-4">
          <h3 className="text-base font-semibold">{text.dashboard}</h3>
          <div className="metric-grid mt-4">
            <article className="metric-card"><h4>{localized(locale, "ผู้ใช้งานทั้งหมด", "Total Users")}</h4><p>{stats?.totalUsers ?? 0}</p></article>
            <article className="metric-card"><h4>{localized(locale, "ผู้ใช้งานที่ยังใช้งาน", "Active Users")}</h4><p>{stats?.activeUsers ?? 0}</p></article>
            <article className="metric-card"><h4>{localized(locale, "รออนุมัติ", "Pending Approvals")}</h4><p>{stats?.pendingApprovals ?? 0}</p></article>
            <article className="metric-card"><h4>{localized(locale, "อนุมัติใน 24 ชม.", "Reviewed 24h")}</h4><p>{stats?.reviewedApprovals24h ?? 0}</p></article>
          </div>
        </section>
      ) : null}

      {!loading && activeTab === "users" ? (
        <section className="panel mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold">{text.users}</h3>
            <input className="admin-input compact-input" placeholder={text.searchUser} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="table-shell table-scroll mt-4 overflow-x-auto">
            <table className="audit-table users-table">
              <thead><tr><th>#</th><th>{localized(locale, "ผู้ใช้งาน", "User")}</th><th>{localized(locale, "วันที่สมัคร", "Signup")}</th><th>{localized(locale, "สถานะ", "Status")}</th><th>{localized(locale, "การจัดการ", "Action")}</th></tr></thead>
              <tbody>
                {filteredUsers.length === 0 ? <tr><td colSpan={5} className="muted">{text.noData}</td></tr> : filteredUsers.map((user, idx) => (
                  <tr key={user.id}>
                    <td>{idx + 1}</td><td><p className="font-semibold">{user.full_name || "-"}</p><p className="text-xs muted">{user.email || "-"}</p></td>
                    <td>{formatDate(user.created_at, locale)}</td>
                    <td><span className={`status-pill status-${user.status}`}>{formatStatusLabel(locale, user.status)}</span></td>
                    <td><button className="ghost-button compact-button" onClick={() => void openUserInsight(user)} type="button">{text.details}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && activeTab === "tickets" ? (
        <section className="panel mt-4">
          <h3 className="text-base font-semibold">{text.tickets}</h3>
          <div className="table-shell table-scroll mt-4 overflow-x-auto">
            <table className="audit-table users-table">
              <thead><tr><th>#</th><th>{localized(locale, "ผู้ใช้งาน", "User")}</th><th>{localized(locale, "หัวข้อปัญหา", "Issue")}</th><th>{localized(locale, "สถานะ", "Status")}</th><th>{localized(locale, "การจัดการ", "Action")}</th></tr></thead>
              <tbody>
                {tickets.length === 0 ? <tr><td colSpan={5} className="muted">{text.noData}</td></tr> : tickets.map((ticket, idx) => (
                  <tr key={ticket.id}>
                    <td>{idx + 1}</td><td><p className="font-semibold">{ticket.userName}</p><p className="text-xs muted">{ticket.userEmail}</p></td>
                    <td><p className="font-semibold">{ticket.subject}</p><p className="text-xs muted">{ticket.message}</p></td>
                    <td><span className={`status-pill status-${ticket.status}`}>{formatStatusLabel(locale, ticket.status)}</span></td>
                    <td><div className="flex flex-wrap gap-2">
                      <button className="ghost-button compact-button" onClick={() => void updateTicket(ticket.id, "in_progress")} type="button">{text.inProgress}</button>
                      <button className="ghost-button compact-button" onClick={() => void updateTicket(ticket.id, "resolved")} type="button">{text.resolved}</button>
                      <button className="danger-button compact-button" onClick={() => void updateTicket(ticket.id, "cancel")} type="button">{text.cancelTicket}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && activeTab === "billing" ? (
        <section className="panel mt-4">
          <h3 className="text-base font-semibold">{text.billing}</h3>
          <div className="table-shell table-scroll mt-4 overflow-x-auto">
            <table className="audit-table users-table">
              <thead><tr><th>#</th><th>{localized(locale, "ผู้ใช้งาน", "User")}</th><th>{localized(locale, "แพ็กเกจ", "Package")}</th><th>{localized(locale, "สถานะชำระเงิน", "Payment Status")}</th><th>{localized(locale, "ยอดเงิน", "Amount")}</th><th>{localized(locale, "วันหมดอายุ", "Expires")}</th><th>{localized(locale, "การจัดการ", "Action")}</th></tr></thead>
              <tbody>
                {billing.length === 0 ? <tr><td colSpan={7} className="muted">{text.noData}</td></tr> : billing.map((row, idx) => (
                  <tr key={row.userId}>
                    <td>{idx + 1}</td><td><p className="font-semibold">{row.userName}</p><p className="text-xs muted">{row.userEmail}</p></td>
                    <td>
                      <select
                        className="admin-input compact-input"
                        onChange={(e) =>
                          setBillingDrafts((prev) => ({
                            ...prev,
                            [row.userId]: {
                              ...(prev[row.userId] ?? {
                                packageType: row.packageType,
                                paymentStatus: row.paymentStatus,
                                amount: row.amount === null ? "" : String(row.amount),
                                expiresAt: row.expiresAt?.slice(0, 10) ?? "",
                              }),
                              packageType: e.target.value,
                            },
                          }))
                        }
                        value={billingDrafts[row.userId]?.packageType ?? row.packageType}
                      >
                        <option value="free">{formatPackageLabel(locale, "free")}</option>
                        <option value="monthly">{formatPackageLabel(locale, "monthly")}</option>
                        <option value="annual">{formatPackageLabel(locale, "annual")}</option>
                      </select>
                    </td>
                    <td>
                      <select
                        className="admin-input compact-input"
                        onChange={(e) =>
                          setBillingDrafts((prev) => ({
                            ...prev,
                            [row.userId]: {
                              ...(prev[row.userId] ?? {
                                packageType: row.packageType,
                                paymentStatus: row.paymentStatus,
                                amount: row.amount === null ? "" : String(row.amount),
                                expiresAt: row.expiresAt?.slice(0, 10) ?? "",
                              }),
                              paymentStatus: e.target.value,
                            },
                          }))
                        }
                        value={billingDrafts[row.userId]?.paymentStatus ?? row.paymentStatus}
                      >
                        <option value="paid">{formatPaymentLabel(locale, "paid")}</option>
                        <option value="failed">{formatPaymentLabel(locale, "failed")}</option>
                        <option value="pending">{formatPaymentLabel(locale, "pending")}</option>
                        <option value="overdue">{formatPaymentLabel(locale, "overdue")}</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="admin-input compact-input"
                        onChange={(e) =>
                          setBillingDrafts((prev) => ({
                            ...prev,
                            [row.userId]: {
                              ...(prev[row.userId] ?? {
                                packageType: row.packageType,
                                paymentStatus: row.paymentStatus,
                                amount: row.amount === null ? "" : String(row.amount),
                                expiresAt: row.expiresAt?.slice(0, 10) ?? "",
                              }),
                              amount: e.target.value,
                            },
                          }))
                        }
                        type="number"
                        value={billingDrafts[row.userId]?.amount ?? (row.amount === null ? "" : String(row.amount))}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input compact-input"
                        onChange={(e) =>
                          setBillingDrafts((prev) => ({
                            ...prev,
                            [row.userId]: {
                              ...(prev[row.userId] ?? {
                                packageType: row.packageType,
                                paymentStatus: row.paymentStatus,
                                amount: row.amount === null ? "" : String(row.amount),
                                expiresAt: row.expiresAt?.slice(0, 10) ?? "",
                              }),
                              expiresAt: e.target.value,
                            },
                          }))
                        }
                        type="date"
                        value={billingDrafts[row.userId]?.expiresAt ?? (row.expiresAt?.slice(0, 10) ?? "")}
                      />
                    </td>
                    <td><div className="flex flex-wrap gap-2"><button className="ghost-button compact-button" onClick={() => void updateBilling(row, false)} type="button">{text.save}</button><button className="primary-button compact-button" onClick={() => void updateBilling(row, true)} type="button">{text.renew}</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && activeTab === "recovery" ? (
        <section className="panel mt-4">
          <h3 className="text-base font-semibold">{text.recovery}</h3>
          <div className="table-shell table-scroll mt-4 overflow-x-auto">
            <table className="audit-table users-table">
              <thead><tr><th>#</th><th>{localized(locale, "ผู้ใช้งาน", "User")}</th><th>{localized(locale, "สถานะ", "Status")}</th><th>{localized(locale, "อัปเดตล่าสุด", "Last Action")}</th><th>{localized(locale, "การจัดการ", "Action")}</th></tr></thead>
              <tbody>
                {recovery.length === 0 ? <tr><td colSpan={5} className="muted">{text.noData}</td></tr> : recovery.map((row, idx) => (
                  <tr key={row.userId}>
                    <td>{idx + 1}</td><td><p className="font-semibold">{row.userName}</p><p className="text-xs muted">{row.userEmail}</p></td>
                    <td><span className={`status-pill status-${row.status}`}>{formatStatusLabel(locale, row.status)}</span></td><td>{formatDate(row.lastActionAt, locale)}</td>
                    <td><div className="flex flex-wrap gap-2">
                      <button className="ghost-button compact-button" onClick={() => void runRecovery(row.userId, "request")} type="button">{text.recoveryRequest}</button>
                      <button className="ghost-button compact-button" onClick={() => void runRecovery(row.userId, "verify_otp")} type="button">{text.recoveryOtp}</button>
                      <button className="primary-button compact-button" onClick={() => void runRecovery(row.userId, "complete")} type="button">{text.recoveryDone}</button>
                      <button className="ghost-button compact-button" onClick={() => void runRecovery(row.userId, "cancel_delete")} type="button">{text.cancelDelete}</button>
                      <button className="danger-button compact-button" onClick={() => void runRecovery(row.userId, "reject")} type="button">{text.recoveryReject}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 px-4 py-6" onClick={() => setSelectedUser(null)}>
          <article className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-slate-300 bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><h4 className="text-lg font-bold">{selectedUser.full_name || "-"}</h4><p className="text-sm muted">{selectedUser.email || "-"}</p></div>
              <button className="ghost-button" onClick={() => setSelectedUser(null)} type="button">{text.close}</button>
            </div>
            {insight ? (
              <>
                <div className="metric-grid mt-4">
                  <article className="metric-card"><h4>{localized(locale, "แพ็กเกจ", "Package")}</h4><p className="text-xl">{formatPackageLabel(locale, insight.plan.packageType)}</p></article>
                  <article className="metric-card"><h4>{localized(locale, "การชำระเงิน", "Payment")}</h4><p className="text-xl">{formatPaymentLabel(locale, insight.plan.paymentStatus)}</p></article>
                  <article className="metric-card"><h4>{localized(locale, "จำนวนรายการ", "Items")}</h4><p className="text-xl">{insight.usage.vaultItemsCount}</p></article>
                  <article className="metric-card"><h4>{localized(locale, "การคัดลอก", "Copy")}</h4><p className="text-xl">{insight.usage.copyActionCount}</p></article>
                  <article className="metric-card"><h4>{localized(locale, "ปัญหา PIN", "PIN Issues")}</h4><p className="text-xl">{insight.usage.pinIssueCount}</p></article>
                  <article className="metric-card"><h4>{localized(locale, "ปัญหา UI", "UI Issues")}</h4><p className="text-xl">{insight.usage.uiIssueCount}</p></article>
                </div>
              </>
            ) : <p className="mt-4 text-sm muted">{text.loading}</p>}
          </article>
        </div>
      ) : null}
    </>
  );
}
