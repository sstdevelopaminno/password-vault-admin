"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

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

export function SupportWorkspace({ locale, roleGroup }: { locale: UiLocale; roleGroup: RoleGroup }) {
  const text = TEXT[locale];
  const [isNavigating, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<MenuTab>("dashboard");

  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [billing, setBilling] = useState<BillingRow[]>([]);
  const [billingDrafts, setBillingDrafts] = useState<Record<string, BillingDraft>>({});
  const [recovery, setRecovery] = useState<RecoveryRow[]>([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [insight, setInsight] = useState<UserInsight | null>(null);

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
      startTransition(() => {
        window.location.href = "/login?timeout=1";
      });
      throw new Error("Unauthorized");
    }
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(normalizeApiError(body, "Request failed"));
    }
    return body;
  }, [startTransition]);

  const loadCurrentMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      if (err instanceof Error && err.message === "Unauthorized") return;
      setError(err instanceof Error ? err.message : "Unable to load data");
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchJson]);

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
      setError(err instanceof Error ? err.message : "Unable to load user details");
    }
  }

  async function updateTicket(ticketId: string, action: "in_progress" | "resolved" | "cancel") {
    setMessage(null);
    const body = await fetchJson("/api/admin/support-tickets", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticketId, action }),
    });
    setMessage((body as { message?: string }).message ?? "Ticket updated");
    void loadCurrentMenu();
  }

  async function updateBilling(user: BillingRow, renew = false) {
    setMessage(null);
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
    setMessage((body as { message?: string }).message ?? "Billing updated");
    void loadCurrentMenu();
  }

  async function runRecovery(userId: string, action: "request" | "verify_otp" | "complete" | "reject" | "cancel_delete") {
    setMessage(null);
    const otpCode = action === "verify_otp" ? window.prompt(locale === "th" ? "กรอกรหัส OTP 6 หลัก" : "Enter 6-digit OTP") ?? "" : undefined;
    const body = await fetchJson("/api/admin/support-recovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, action, otpCode }),
    });
    const payload = body as { message?: string; timestamp?: string };
    setMessage(`${payload.message ?? "Recovery updated"} ${formatDate(payload.timestamp ?? null, locale)}`);
    void loadCurrentMenu();
  }

  async function logout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut({ scope: "local" });
    startTransition(() => {
      window.location.href = "/login?logout=1";
    });
  }

  return (
    <>
      <div className="workspace-anchor" id="workspace-dashboard" />
      <div className="workspace-anchor" id="workspace-users-general" />
      <div className="workspace-anchor" id="workspace-tickets" />
      <div className="workspace-anchor" id="workspace-billing" />
      <div className="workspace-anchor" id="workspace-recovery" />

      <section className="panel workspace-tabs-panel mt-4">
        <div className="workspace-head">
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
          <div className="flex gap-2">
            <button className="ghost-button" disabled={loading} onClick={() => void loadCurrentMenu()} type="button">{text.refresh}</button>
            <button className="danger-button" disabled={isNavigating} onClick={() => void logout()} type="button">{text.signOut}</button>
          </div>
        </div>
      </section>

      {error ? <p className="error-banner mt-4 text-sm">{error}</p> : null}
      {message ? <p className="success-banner mt-4 text-sm">{message}</p> : null}

      {loading ? <p className="panel mt-4 text-sm muted">{text.loading}</p> : null}

      {!loading && activeTab === "dashboard" ? (
        <section className="panel mt-4">
          <h3 className="text-base font-semibold">{text.dashboard}</h3>
          <div className="metric-grid mt-4">
            <article className="metric-card"><h4>Total Users</h4><p>{stats?.totalUsers ?? 0}</p></article>
            <article className="metric-card"><h4>Active Users</h4><p>{stats?.activeUsers ?? 0}</p></article>
            <article className="metric-card"><h4>Pending Approvals</h4><p>{stats?.pendingApprovals ?? 0}</p></article>
            <article className="metric-card"><h4>Reviewed 24h</h4><p>{stats?.reviewedApprovals24h ?? 0}</p></article>
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
              <thead><tr><th>#</th><th>User</th><th>Signup</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {filteredUsers.length === 0 ? <tr><td colSpan={5} className="muted">{text.noData}</td></tr> : filteredUsers.map((user, idx) => (
                  <tr key={user.id}>
                    <td>{idx + 1}</td><td><p className="font-semibold">{user.full_name || "-"}</p><p className="text-xs muted">{user.email || "-"}</p></td>
                    <td>{formatDate(user.created_at, locale)}</td>
                    <td><span className={`status-pill status-${user.status}`}>{user.status}</span></td>
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
              <thead><tr><th>#</th><th>User</th><th>Issue</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {tickets.length === 0 ? <tr><td colSpan={5} className="muted">{text.noData}</td></tr> : tickets.map((ticket, idx) => (
                  <tr key={ticket.id}>
                    <td>{idx + 1}</td><td><p className="font-semibold">{ticket.userName}</p><p className="text-xs muted">{ticket.userEmail}</p></td>
                    <td><p className="font-semibold">{ticket.subject}</p><p className="text-xs muted">{ticket.message}</p></td>
                    <td><span className={`status-pill status-${ticket.status}`}>{ticket.status}</span></td>
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
              <thead><tr><th>#</th><th>User</th><th>Package</th><th>Status</th><th>Amount</th><th>Expires</th><th>Action</th></tr></thead>
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
                        <option value="free">free</option>
                        <option value="monthly">monthly</option>
                        <option value="annual">annual</option>
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
                        <option value="paid">paid</option>
                        <option value="failed">failed</option>
                        <option value="pending">pending</option>
                        <option value="overdue">overdue</option>
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
              <thead><tr><th>#</th><th>User</th><th>Status</th><th>Last Action</th><th>Action</th></tr></thead>
              <tbody>
                {recovery.length === 0 ? <tr><td colSpan={5} className="muted">{text.noData}</td></tr> : recovery.map((row, idx) => (
                  <tr key={row.userId}>
                    <td>{idx + 1}</td><td><p className="font-semibold">{row.userName}</p><p className="text-xs muted">{row.userEmail}</p></td>
                    <td><span className={`status-pill status-${row.status}`}>{row.status}</span></td><td>{formatDate(row.lastActionAt, locale)}</td>
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
                  <article className="metric-card"><h4>Package</h4><p className="text-xl">{insight.plan.packageType}</p></article>
                  <article className="metric-card"><h4>Payment</h4><p className="text-xl">{insight.plan.paymentStatus}</p></article>
                  <article className="metric-card"><h4>Items</h4><p className="text-xl">{insight.usage.vaultItemsCount}</p></article>
                  <article className="metric-card"><h4>Copy</h4><p className="text-xl">{insight.usage.copyActionCount}</p></article>
                  <article className="metric-card"><h4>PIN Issues</h4><p className="text-xl">{insight.usage.pinIssueCount}</p></article>
                  <article className="metric-card"><h4>UI Issues</h4><p className="text-xl">{insight.usage.uiIssueCount}</p></article>
                </div>
              </>
            ) : <p className="mt-4 text-sm muted">{text.loading}</p>}
          </article>
        </div>
      ) : null}
    </>
  );
}
