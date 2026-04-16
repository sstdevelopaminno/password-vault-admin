"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UiLocale = "th" | "en";
type MenuTab = "dashboard" | "users" | "uiCheck" | "tickets" | "billing" | "recovery";

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
  "#workspace-ui-check": "uiCheck",
  "#workspace-tickets": "tickets",
  "#workspace-billing": "billing",
  "#workspace-recovery": "recovery",
};

const UNAUTHORIZED_ERROR = "Unauthorized";

const TEXT = {
  th: {
    dashboard: "แดชบอร์ด",
    users: "เช็ครายชื่อผู้ใช้งานทั่วไป",
    uiCheck: "เช็ค UI",
    tickets: "คำร้องจากศูนย์ช่วยเหลือ",
    billing: "ตรวจสอบยอดชำระเงิน",
    recovery: "กู้คืนข้อมูลผู้ใช้งาน",
    uiCheckSearch: "ค้นหาด้วยชื่อหรืออีเมล...",
    uiCheckOpen: "เข้าเช็ค UI",
    uiCheckPreview: "พรีวิวหน้าจอผู้ใช้งาน",
    uiCheckMasked: "โหมดทดสอบ UI: ซ่อนข้อมูลส่วนตัวของผู้ใช้งานทั้งหมด",
    uiCheckSelectUser: "เลือกผู้ใช้งานจากรายการด้านซ้าย เพื่อเริ่มตรวจหน้าตาระบบ",
    uiCheckLogged: "บันทึกการเช็ค UI เรียบร้อยแล้ว",
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
    uiCheck: "UI Check",
    tickets: "Help Center Tickets",
    billing: "Billing Monitor",
    recovery: "Data Recovery",
    uiCheckSearch: "Search by name or email...",
    uiCheckOpen: "Open UI Check",
    uiCheckPreview: "General User UI Preview",
    uiCheckMasked: "UI testing mode: all personal data is hidden.",
    uiCheckSelectUser: "Pick a user from the list to start UI inspection.",
    uiCheckLogged: "UI check activity logged successfully.",
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
    ? { free: "เธเธฃเธต", monthly: "เธฃเธฒเธขเน€เธ”เธทเธญเธ", annual: "เธฃเธฒเธขเธเธต" }
    : { free: "Free", monthly: "Monthly", annual: "Annual" };
  return map[value] ?? value;
}

function formatPaymentLabel(locale: UiLocale, value: string) {
  const map: Record<string, string> = locale === "th"
    ? { paid: "เธเธณเธฃเธฐเธชเธณเน€เธฃเนเธ", failed: "เธเธณเธฃเธฐเนเธกเนเธชเธณเน€เธฃเนเธ", pending: "เธฃเธญเธ”เธณเน€เธเธดเธเธเธฒเธฃ", overdue: "เธเนเธฒเธเธเธณเธฃเธฐ" }
    : { paid: "Paid", failed: "Failed", pending: "Pending", overdue: "Overdue" };
  return map[value] ?? value;
}

function formatStatusLabel(locale: UiLocale, value: string) {
  const map: Record<string, string> = locale === "th"
    ? {
      open: "เน€เธเธดเธ”เธฃเธฒเธขเธเธฒเธฃ",
      in_progress: "เธเธณเธฅเธฑเธเธ”เธณเน€เธเธดเธเธเธฒเธฃ",
      resolved: "เน€เธชเธฃเนเธเธชเธดเนเธ",
      closed: "เธเธดเธ”เธฃเธฒเธขเธเธฒเธฃ",
      idle: "เธฃเธญเธเธณเธเธญ",
      requested: "เธชเนเธเธเธณเธเธญเนเธฅเนเธง",
      otp_verified: "เธขเธทเธเธขเธฑเธ OTP เนเธฅเนเธง",
      completed: "เธเธนเนเธเธทเธเธชเธณเน€เธฃเนเธ",
      rejected: "เธเธเธดเน€เธชเธ",
      active: "เนเธเนเธเธฒเธ",
      pending_approval: "เธฃเธญเธญเธเธธเธกเธฑเธ•เธด",
      pending: "เธฃเธญเธ”เธณเน€เธเธดเธเธเธฒเธฃ",
      disabled: "เธเธดเธ”เนเธเนเธเธฒเธ",
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

export function SupportWorkspace({ locale }: { locale: UiLocale }) {
  const text = TEXT[locale];
  const [activeTab, setActiveTab] = useState<MenuTab>("dashboard");

  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [billing, setBilling] = useState<BillingRow[]>([]);
  const [billingDrafts, setBillingDrafts] = useState<Record<string, BillingDraft>>({});
  const [recovery, setRecovery] = useState<RecoveryRow[]>([]);
  const [uiCheckUsers, setUiCheckUsers] = useState<UserRow[]>([]);

  const [search, setSearch] = useState("");
  const [uiCheckSearch, setUiCheckSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [insight, setInsight] = useState<UserInsight | null>(null);
  const [uiCheckUser, setUiCheckUser] = useState<UserRow | null>(null);
  const [uiCheckView, setUiCheckView] = useState<"home" | "vault" | "notes" | "share" | "settings" | "help">("home");

  const pushToast = useCallback((kind: ToastKind, message: string) => {
    setToast({ id: Date.now(), kind, message });
  }, []);

  const fetchJson = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { credentials: "include", cache: "no-store", ...(init ?? {}) });
    if (response.status === 401 || response.status === 403) {
      window.location.href = "/login?timeout=1";
      throw new Error(UNAUTHORIZED_ERROR);
    }
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(normalizeApiError(body, localized(locale, "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธ—เธณเธฃเธฒเธขเธเธฒเธฃเนเธ”เน", "Request failed")));
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
      if (activeTab === "uiCheck") {
        const payload = (await fetchJson("/api/admin/support-ui-check?limit=150")) as { users: UserRow[] };
        setUiCheckUsers(payload.users ?? []);
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
      pushToast("error", err instanceof Error ? err.message : localized(locale, "เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเนเธกเนเธชเธณเน€เธฃเนเธ", "Unable to load data"));
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

  const filteredUiCheckUsers = useMemo(() => {
    const keyword = uiCheckSearch.trim().toLowerCase();
    if (!keyword) return uiCheckUsers;
    return uiCheckUsers.filter((user) => [user.full_name ?? "", user.email ?? ""].join(" ").toLowerCase().includes(keyword));
  }, [uiCheckSearch, uiCheckUsers]);

  const uiCheckMenus = useMemo(
    () => [
      { id: "home" as const, label: localized(locale, "หน้าหลัก", "Home") },
      { id: "vault" as const, label: localized(locale, "รหัสส่วนตัว", "Vault") },
      { id: "notes" as const, label: localized(locale, "โน้ต", "Notes") },
      { id: "share" as const, label: localized(locale, "รหัสทีม", "Team Share") },
      { id: "help" as const, label: localized(locale, "ศูนย์ช่วยเหลือ", "Help Center") },
      { id: "settings" as const, label: localized(locale, "ตั้งค่า", "Settings") },
    ],
    [locale],
  );

  async function openUserInsight(user: UserRow) {
    setSelectedUser(user);
    setInsight(null);
    try {
      setInsight((await fetchJson(`/api/admin/support-user-insights?userId=${user.id}`)) as UserInsight);
    } catch (err) {
      if (err instanceof Error && err.message === UNAUTHORIZED_ERROR) return;
      pushToast("error", err instanceof Error ? err.message : localized(locale, "เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเธเธนเนเนเธเนเนเธกเนเธชเธณเน€เธฃเนเธ", "Unable to load user details"));
    }
  }

  async function openUiCheck(user: UserRow) {
    setUiCheckUser(user);
    setUiCheckView("home");
    try {
      await fetchJson("/api/admin/support-ui-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          lookup: uiCheckSearch.trim() || user.email || user.full_name || "",
        }),
      });
      pushToast("success", text.uiCheckLogged);
    } catch (err) {
      if (err instanceof Error && err.message === UNAUTHORIZED_ERROR) return;
      pushToast("error", err instanceof Error ? err.message : localized(locale, "ไม่สามารถเริ่มโหมดเช็ค UI ได้", "Unable to open UI check"));
    }
  }

  async function updateTicket(ticketId: string, action: "in_progress" | "resolved" | "cancel") {
    try {
      const body = await fetchJson("/api/admin/support-tickets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId, action }),
      });
      pushToast("success", (body as { message?: string }).message ?? localized(locale, "เธญเธฑเธเน€เธ”เธ•เธเธณเธฃเนเธญเธเนเธฅเนเธง", "Ticket updated"));
      void loadCurrentMenu();
    } catch (err) {
      if (err instanceof Error && err.message === UNAUTHORIZED_ERROR) return;
      pushToast("error", err instanceof Error ? err.message : localized(locale, "เธญเธฑเธเน€เธ”เธ•เธเธณเธฃเนเธญเธเนเธกเนเธชเธณเน€เธฃเนเธ", "Ticket update failed"));
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
      pushToast("success", (body as { message?: string }).message ?? localized(locale, "เธญเธฑเธเน€เธ”เธ•เธเธฒเธฃเธเธณเธฃเธฐเน€เธเธดเธเนเธฅเนเธง", "Billing updated"));
      void loadCurrentMenu();
    } catch (err) {
      if (err instanceof Error && err.message === UNAUTHORIZED_ERROR) return;
      pushToast("error", err instanceof Error ? err.message : localized(locale, "เธญเธฑเธเน€เธ”เธ•เธเธฒเธฃเธเธณเธฃเธฐเน€เธเธดเธเนเธกเนเธชเธณเน€เธฃเนเธ", "Billing update failed"));
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
      <div className="workspace-anchor" id="workspace-ui-check" />
      <div className="workspace-anchor" id="workspace-tickets" />
      <div className="workspace-anchor" id="workspace-billing" />
      <div className="workspace-anchor" id="workspace-recovery" />

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
            <article className="metric-card"><h4>{localized(locale, "เธเธนเนเนเธเนเธเธฒเธเธ—เธฑเนเธเธซเธกเธ”", "Total Users")}</h4><p>{stats?.totalUsers ?? 0}</p></article>
            <article className="metric-card"><h4>{localized(locale, "เธเธนเนเนเธเนเธเธฒเธเธ—เธตเนเธขเธฑเธเนเธเนเธเธฒเธ", "Active Users")}</h4><p>{stats?.activeUsers ?? 0}</p></article>
            <article className="metric-card"><h4>{localized(locale, "เธฃเธญเธญเธเธธเธกเธฑเธ•เธด", "Pending Approvals")}</h4><p>{stats?.pendingApprovals ?? 0}</p></article>
            <article className="metric-card"><h4>{localized(locale, "เธญเธเธธเธกเธฑเธ•เธดเนเธ 24 เธเธก.", "Reviewed 24h")}</h4><p>{stats?.reviewedApprovals24h ?? 0}</p></article>
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
              <thead><tr><th>#</th><th>{localized(locale, "เธเธนเนเนเธเนเธเธฒเธ", "User")}</th><th>{localized(locale, "เธงเธฑเธเธ—เธตเนเธชเธกเธฑเธเธฃ", "Signup")}</th><th>{localized(locale, "เธชเธ–เธฒเธเธฐ", "Status")}</th><th>{localized(locale, "เธเธฒเธฃเธเธฑเธ”เธเธฒเธฃ", "Action")}</th></tr></thead>
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

      {!loading && activeTab === "uiCheck" ? (
        <section className="panel mt-4">
          <div className="ui-check-grid">
            <article className="ui-check-list">
              <div className="ui-check-head">
                <h3 className="text-base font-semibold">{text.uiCheck}</h3>
                <input
                  className="admin-input compact-input"
                  placeholder={text.uiCheckSearch}
                  value={uiCheckSearch}
                  onChange={(e) => setUiCheckSearch(e.target.value)}
                />
              </div>

              <div className="ui-check-user-list mt-4">
                {filteredUiCheckUsers.length === 0 ? (
                  <p className="muted text-sm">{text.noData}</p>
                ) : (
                  filteredUiCheckUsers.map((user) => (
                    <button
                      key={user.id}
                      className={`ui-check-user-item ${uiCheckUser?.id === user.id ? "ui-check-user-item-active" : ""}`}
                      onClick={() => void openUiCheck(user)}
                      type="button"
                    >
                      <span className="ui-check-user-main">
                        <strong>{user.full_name || "-"}</strong>
                        <small>{user.email || "-"}</small>
                      </span>
                      <span className="ui-check-user-meta">
                        <small>{formatDate(user.created_at, locale)}</small>
                        <span>{text.uiCheckOpen}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </article>

            <article className="ui-check-preview">
              <div className="ui-check-preview-head">
                <h3 className="text-base font-semibold">{text.uiCheckPreview}</h3>
                <span className="info-banner">{text.uiCheckMasked}</span>
              </div>

              {!uiCheckUser ? (
                <p className="muted text-sm mt-4">{text.uiCheckSelectUser}</p>
              ) : (
                <>
                  <div className="ui-check-preview-user">
                    <strong>{uiCheckUser.full_name || "-"}</strong>
                    <small>{uiCheckUser.email || "-"}</small>
                  </div>

                  <div className="ui-check-preview-nav">
                    {uiCheckMenus.map((item) => (
                      <button
                        key={item.id}
                        className={`ui-check-preview-tab ${uiCheckView === item.id ? "ui-check-preview-tab-active" : ""}`}
                        onClick={() => setUiCheckView(item.id)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <div className="ui-check-screen">
                    <header className="ui-check-screen-head">
                      <h4>
                        {localized(locale, "โหมดตรวจสอบหน้าจอ", "UI Inspection Mode")} -{" "}
                        {uiCheckMenus.find((item) => item.id === uiCheckView)?.label}
                      </h4>
                      <small>{localized(locale, "ไม่แสดงข้อมูลจริงของผู้ใช้", "No real user data is shown")}</small>
                    </header>
                    <div className="ui-check-screen-grid">
                      <div className="ui-check-mock-card">
                        <p>{localized(locale, "การ์ดตัวอย่าง 1", "Mock Card 1")}</p>
                      </div>
                      <div className="ui-check-mock-card">
                        <p>{localized(locale, "การ์ดตัวอย่าง 2", "Mock Card 2")}</p>
                      </div>
                      <div className="ui-check-mock-card">
                        <p>{localized(locale, "การ์ดตัวอย่าง 3", "Mock Card 3")}</p>
                      </div>
                      <div className="ui-check-mock-card">
                        <p>{localized(locale, "การ์ดตัวอย่าง 4", "Mock Card 4")}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </article>
          </div>
        </section>
      ) : null}

      {!loading && activeTab === "tickets" ? (
        <section className="panel mt-4">
          <h3 className="text-base font-semibold">{text.tickets}</h3>
          <div className="table-shell table-scroll mt-4 overflow-x-auto">
            <table className="audit-table users-table">
              <thead><tr><th>#</th><th>{localized(locale, "เธเธนเนเนเธเนเธเธฒเธ", "User")}</th><th>{localized(locale, "เธซเธฑเธงเธเนเธญเธเธฑเธเธซเธฒ", "Issue")}</th><th>{localized(locale, "เธชเธ–เธฒเธเธฐ", "Status")}</th><th>{localized(locale, "เธเธฒเธฃเธเธฑเธ”เธเธฒเธฃ", "Action")}</th></tr></thead>
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
              <thead><tr><th>#</th><th>{localized(locale, "เธเธนเนเนเธเนเธเธฒเธ", "User")}</th><th>{localized(locale, "เนเธเนเธเน€เธเธ", "Package")}</th><th>{localized(locale, "เธชเธ–เธฒเธเธฐเธเธณเธฃเธฐเน€เธเธดเธ", "Payment Status")}</th><th>{localized(locale, "เธขเธญเธ”เน€เธเธดเธ", "Amount")}</th><th>{localized(locale, "เธงเธฑเธเธซเธกเธ”เธญเธฒเธขเธธ", "Expires")}</th><th>{localized(locale, "เธเธฒเธฃเธเธฑเธ”เธเธฒเธฃ", "Action")}</th></tr></thead>
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
              <thead><tr><th>#</th><th>{localized(locale, "เธเธนเนเนเธเนเธเธฒเธ", "User")}</th><th>{localized(locale, "เธชเธ–เธฒเธเธฐ", "Status")}</th><th>{localized(locale, "เธญเธฑเธเน€เธ”เธ•เธฅเนเธฒเธชเธธเธ”", "Last Action")}</th><th>{localized(locale, "เธเธฒเธฃเธเธฑเธ”เธเธฒเธฃ", "Action")}</th></tr></thead>
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
                  <article className="metric-card"><h4>{localized(locale, "เนเธเนเธเน€เธเธ", "Package")}</h4><p className="text-xl">{formatPackageLabel(locale, insight.plan.packageType)}</p></article>
                  <article className="metric-card"><h4>{localized(locale, "เธเธฒเธฃเธเธณเธฃเธฐเน€เธเธดเธ", "Payment")}</h4><p className="text-xl">{formatPaymentLabel(locale, insight.plan.paymentStatus)}</p></article>
                  <article className="metric-card"><h4>{localized(locale, "เธเธณเธเธงเธเธฃเธฒเธขเธเธฒเธฃ", "Items")}</h4><p className="text-xl">{insight.usage.vaultItemsCount}</p></article>
                  <article className="metric-card"><h4>{localized(locale, "เธเธฒเธฃเธเธฑเธ”เธฅเธญเธ", "Copy")}</h4><p className="text-xl">{insight.usage.copyActionCount}</p></article>
                  <article className="metric-card"><h4>{localized(locale, "เธเธฑเธเธซเธฒ PIN", "PIN Issues")}</h4><p className="text-xl">{insight.usage.pinIssueCount}</p></article>
                  <article className="metric-card"><h4>{localized(locale, "เธเธฑเธเธซเธฒ UI", "UI Issues")}</h4><p className="text-xl">{insight.usage.uiIssueCount}</p></article>
                </div>
              </>
            ) : <p className="mt-4 text-sm muted">{text.loading}</p>}
          </article>
        </div>
      ) : null}
    </>
  );
}

