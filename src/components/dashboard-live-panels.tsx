"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type UiLocale = "th" | "en";

type StatsPayload = {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  pendingApprovals: number;
  reviewedApprovals24h: number;
  recentSensitiveActions24h: number;
};

type AuditLogRow = {
  id: string;
  action_type: string | null;
  target_user_id: string | null;
  target_vault_item_id: string | null;
  metadata_json: unknown;
  created_at: string;
  actor_user_id: string | null;
};

type AuditPayload = {
  logs: AuditLogRow[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
};

type UsersPayload = {
  users: UserRow[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  accountType?: "general" | "backoffice" | "all";
};

type AuditFilterDraft = {
  q: string;
  action: string;
  from: string;
  to: string;
  limit: number;
};

type AuditFilterApplied = AuditFilterDraft;

type WorkspaceTab = "dashboard" | "audit" | "users";
type AuditSortMode = "created_desc" | "created_asc" | "action_asc" | "action_desc";
type UserSortMode = "created_desc" | "created_asc" | "name_asc" | "name_desc" | "role_asc" | "status_asc";
type UserAccountType = "general" | "backoffice";

const ROLE_OPTIONS = ["user", "approver", "admin", "super_admin"] as const;
const WORKSPACE_TABS: Array<{ id: WorkspaceTab; labelKey: "tabDashboard" | "tabAudit" | "tabUsers" }> = [
  { id: "dashboard", labelKey: "tabDashboard" },
  { id: "audit", labelKey: "tabAudit" },
  { id: "users", labelKey: "tabUsers" },
];

const HASH_TAB_MAP: Record<string, { tab: WorkspaceTab; accountType?: UserAccountType }> = {
  "#workspace-dashboard": { tab: "dashboard" },
  "#workspace-audit": { tab: "audit" },
  "#workspace-users": { tab: "users" },
  "#workspace-users-general": { tab: "users", accountType: "general" },
  "#workspace-users-backoffice": { tab: "users", accountType: "backoffice" },
};

const UI_TEXT: Record<
  UiLocale,
  {
    workspaceTitle: string;
    workspaceDesc: string;
    kpiTotal: string;
    kpiActive: string;
    kpiPending: string;
    tabDashboard: string;
    tabAudit: string;
    tabUsers: string;
    sessionControlTitle: string;
    sessionControlDesc: string;
    signOut: string;
    signingOut: string;
    liveSnapshotTitle: string;
    liveSnapshotDesc: string;
    refreshStats: string;
    refreshing: string;
    loadingStats: string;
    totalUsers: string;
    activeUsers: string;
    adminUsers: string;
    pendingApprovals: string;
    reviewed24h: string;
    sensitiveActions24h: string;
    auditTitle: string;
    auditDesc: string;
    newestFirst: string;
    oldestFirst: string;
    actionAz: string;
    actionZa: string;
    exportCsv: string;
    exporting: string;
    previous: string;
    next: string;
    searchActionPlaceholder: string;
    exactActionPlaceholder: string;
    rows10: string;
    rows20: string;
    rows50: string;
    applyFilters: string;
    loadingAudit: string;
    noAudit: string;
    colNo: string;
    colAction: string;
    colActor: string;
    colTargetUser: string;
    colCreatedAt: string;
    colMeta: string;
    usersTitle: string;
    usersDesc: string;
    usersGeneralTab: string;
    usersBackofficeTab: string;
    usersScopeGeneralDesc: string;
    usersScopeBackofficeDesc: string;
    nameAz: string;
    nameZa: string;
    roleAz: string;
    statusAz: string;
    searchUsersPlaceholder: string;
    pendingOnly: string;
    refreshUsers: string;
    loadingUsers: string;
    noUsers: string;
    colUser: string;
    colRole: string;
    colStatus: string;
    colCreated: string;
    colActions: string;
    approve: string;
    disable: string;
    delete: string;
    confirmDelete: string;
    usersUpdated: string;
    usersDeleted: string;
    errLoadStats: string;
    errLoadAudit: string;
    errLoadUsers: string;
    errExportAudit: string;
    errUpdateUser: string;
    errDeleteUser: string;
    chipSearch: string;
    chipAction: string;
    chipFrom: string;
    chipTo: string;
    chipRows: string;
  }
> = {
  th: {
    workspaceTitle: "พื้นที่ปฏิบัติการ",
    workspaceDesc: "สลับงานตามความรับผิดชอบ: ภาพรวม, ตรวจสอบ, และจัดการผู้ใช้งาน",
    kpiTotal: "ทั้งหมด",
    kpiActive: "ใช้งานอยู่",
    kpiPending: "รออนุมัติ",
    tabDashboard: "แดชบอร์ด",
    tabAudit: "บันทึกตรวจสอบ",
    tabUsers: "ผู้ใช้งานและอนุมัติ",
    sessionControlTitle: "ควบคุมเซสชัน",
    sessionControlDesc: "อุปกรณ์นี้จะคงสถานะล็อกอินไว้จนกว่าจะออกจากระบบ",
    signOut: "ออกจากระบบ",
    signingOut: "กำลังออกจากระบบ...",
    liveSnapshotTitle: "ภาพรวมระบบแบบเรียลไทม์",
    liveSnapshotDesc: "สถิติสดและเหตุการณ์ล่าสุดจากระบบหลังบ้าน",
    refreshStats: "รีเฟรชสถิติ",
    refreshing: "กำลังรีเฟรช...",
    loadingStats: "กำลังโหลดสถิติ...",
    totalUsers: "ผู้ใช้งานทั้งหมด",
    activeUsers: "ผู้ใช้งานที่ใช้งานอยู่",
    adminUsers: "ผู้ดูแลระบบ",
    pendingApprovals: "รออนุมัติ",
    reviewed24h: "ตรวจสอบใน 24 ชม.",
    sensitiveActions24h: "เหตุการณ์สำคัญ 24 ชม.",
    auditTitle: "บันทึก Audit Logs",
    auditDesc: "กรอง จัดเรียง ส่งออก และแบ่งหน้าเหตุการณ์สำคัญ",
    newestFirst: "ล่าสุดก่อน",
    oldestFirst: "เก่าสุดก่อน",
    actionAz: "เหตุการณ์ A-Z",
    actionZa: "เหตุการณ์ Z-A",
    exportCsv: "ส่งออก CSV",
    exporting: "กำลังส่งออก...",
    previous: "ก่อนหน้า",
    next: "ถัดไป",
    searchActionPlaceholder: "ค้นหาประเภทเหตุการณ์...",
    exactActionPlaceholder: "ชื่อ action แบบตรงตัว",
    rows10: "10 แถว",
    rows20: "20 แถว",
    rows50: "50 แถว",
    applyFilters: "ใช้ตัวกรอง",
    loadingAudit: "กำลังโหลดบันทึก...",
    noAudit: "ไม่พบข้อมูลบันทึกตรวจสอบ",
    colNo: "ลำดับ",
    colAction: "เหตุการณ์",
    colActor: "ผู้กระทำ",
    colTargetUser: "ผู้ใช้เป้าหมาย",
    colCreatedAt: "วันที่เวลา",
    colMeta: "รายละเอียด",
    usersTitle: "รายการผู้ใช้งานและอนุมัติ",
    usersDesc: "รายการที่รออนุมัติในหน้านี้",
    usersGeneralTab: "ผู้ใช้งานทั่วไป",
    usersBackofficeTab: "ผู้ใช้งานหลังบ้าน",
    usersScopeGeneralDesc: "แสดงเฉพาะ role: pending, user",
    usersScopeBackofficeDesc: "แสดงเฉพาะ role: approver, admin, super_admin",
    nameAz: "ชื่อ A-Z",
    nameZa: "ชื่อ Z-A",
    roleAz: "สิทธิ์ A-Z",
    statusAz: "สถานะ A-Z",
    searchUsersPlaceholder: "ค้นหาอีเมล ชื่อ สิทธิ์ สถานะ...",
    pendingOnly: "แสดงเฉพาะรออนุมัติ",
    refreshUsers: "รีเฟรชผู้ใช้งาน",
    loadingUsers: "กำลังโหลดผู้ใช้งาน...",
    noUsers: "ไม่พบผู้ใช้งานตามเงื่อนไขที่เลือก",
    colUser: "ผู้ใช้งาน",
    colRole: "สิทธิ์",
    colStatus: "สถานะ",
    colCreated: "วันที่สร้าง",
    colActions: "จัดการ",
    approve: "อนุมัติ",
    disable: "ปิดใช้งาน",
    delete: "ลบ",
    confirmDelete: "ยืนยันการลบบัญชีผู้ใช้งานนี้ถาวรหรือไม่?",
    usersUpdated: "อัปเดตรายการผู้ใช้งานสำเร็จ",
    usersDeleted: "ลบผู้ใช้งานสำเร็จ",
    errLoadStats: "ไม่สามารถโหลดสถิติระบบได้",
    errLoadAudit: "ไม่สามารถโหลดบันทึกตรวจสอบได้",
    errLoadUsers: "ไม่สามารถโหลดรายการผู้ใช้งานได้",
    errExportAudit: "ไม่สามารถส่งออกบันทึกตรวจสอบได้",
    errUpdateUser: "ไม่สามารถอัปเดตผู้ใช้งานได้",
    errDeleteUser: "ไม่สามารถลบผู้ใช้งานได้",
    chipSearch: "ค้นหา",
    chipAction: "เหตุการณ์",
    chipFrom: "จากวันที่",
    chipTo: "ถึงวันที่",
    chipRows: "จำนวนแถว",
  },
  en: {
    workspaceTitle: "Operations Workspace",
    workspaceDesc: "Switch by responsibility: dashboard, investigations, and user control",
    kpiTotal: "Total",
    kpiActive: "Active",
    kpiPending: "Pending",
    tabDashboard: "Dashboard",
    tabAudit: "Audit Logs",
    tabUsers: "Users & Approvals",
    sessionControlTitle: "Session Control",
    sessionControlDesc: "This device stays signed in until you manually sign out",
    signOut: "Sign Out",
    signingOut: "Signing out...",
    liveSnapshotTitle: "Live Operations Snapshot",
    liveSnapshotDesc: "Real-time stats and latest security activities from admin APIs",
    refreshStats: "Refresh Stats",
    refreshing: "Refreshing...",
    loadingStats: "Loading stats...",
    totalUsers: "Total Users",
    activeUsers: "Active Users",
    adminUsers: "Admin Users",
    pendingApprovals: "Pending Approvals",
    reviewed24h: "Reviewed 24h",
    sensitiveActions24h: "Sensitive Actions 24h",
    auditTitle: "Audit Logs",
    auditDesc: "Filter, sort, export, and paginate security events",
    newestFirst: "Newest First",
    oldestFirst: "Oldest First",
    actionAz: "Action A-Z",
    actionZa: "Action Z-A",
    exportCsv: "Export CSV",
    exporting: "Exporting...",
    previous: "Previous",
    next: "Next",
    searchActionPlaceholder: "Search action...",
    exactActionPlaceholder: "Exact action type",
    rows10: "10 rows",
    rows20: "20 rows",
    rows50: "50 rows",
    applyFilters: "Apply Filters",
    loadingAudit: "Loading audit logs...",
    noAudit: "No audit logs found.",
    colNo: "#",
    colAction: "Action",
    colActor: "Actor",
    colTargetUser: "Target User",
    colCreatedAt: "Created At",
    colMeta: "Meta",
    usersTitle: "Users & Approvals",
    usersDesc: "Pending approvals in this page",
    usersGeneralTab: "General Users",
    usersBackofficeTab: "Backoffice Users",
    usersScopeGeneralDesc: "Showing role: pending, user",
    usersScopeBackofficeDesc: "Showing role: approver, admin, super_admin",
    nameAz: "Name A-Z",
    nameZa: "Name Z-A",
    roleAz: "Role A-Z",
    statusAz: "Status A-Z",
    searchUsersPlaceholder: "Search user by email, name, role, status...",
    pendingOnly: "Pending approvals only",
    refreshUsers: "Refresh Users",
    loadingUsers: "Loading users...",
    noUsers: "No users found for current filter.",
    colUser: "User",
    colRole: "Role",
    colStatus: "Status",
    colCreated: "Created",
    colActions: "Actions",
    approve: "Approve",
    disable: "Disable",
    delete: "Delete",
    confirmDelete: "Delete this user account permanently?",
    usersUpdated: "User updated successfully.",
    usersDeleted: "User deleted successfully.",
    errLoadStats: "Unable to load system stats.",
    errLoadAudit: "Unable to load audit logs.",
    errLoadUsers: "Unable to load users directory.",
    errExportAudit: "Unable to export audit logs.",
    errUpdateUser: "Unable to update user.",
    errDeleteUser: "Unable to delete user.",
    chipSearch: "Search",
    chipAction: "Action",
    chipFrom: "From",
    chipTo: "To",
    chipRows: "Rows",
  },
};

function formatDateTime(value: string, locale: UiLocale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function normalizeApiError(body: unknown, fallbackMessage: string) {
  if (!body || typeof body !== "object") return fallbackMessage;
  if ("error" in body && typeof body.error === "string") return body.error;
  return fallbackMessage;
}

function toCellText(value: unknown) {
  if (value === null || value === undefined) return "-";
  const text = typeof value === "string" ? value : String(value);
  return text.trim() || "-";
}

function formatAuditMeta(meta: unknown) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return toCellText(meta);
  }

  const record = meta as Record<string, unknown>;
  const preferredKeys = ["action", "title", "target_vault_item_id", "note_id", "ip", "source"];
  const chunks: string[] = [];

  for (const key of preferredKeys) {
    if (!(key in record)) continue;
    chunks.push(`${key}: ${toCellText(record[key])}`);
    if (chunks.length >= 2) break;
  }

  if (chunks.length) return chunks.join(" | ");

  const fallback = Object.entries(record)
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${toCellText(value)}`)
    .join(" | ");

  return fallback || "-";
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function DashboardLivePanels({ locale }: { locale: UiLocale }) {
  const text = UI_TEXT[locale];
  const [isNavigating, startTransition] = useTransition();

  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditDraftFilter, setAuditDraftFilter] = useState<AuditFilterDraft>({
    q: "",
    action: "",
    from: "",
    to: "",
    limit: 10,
  });
  const [auditFilter, setAuditFilter] = useState<AuditFilterApplied>({
    q: "",
    action: "",
    from: "",
    to: "",
    limit: 10,
  });
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditCursorStack, setAuditCursorStack] = useState<Array<string | null>>([]);

  const [users, setUsers] = useState<UsersPayload | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userAccountType, setUserAccountType] = useState<UserAccountType>("general");
  const [userSearch, setUserSearch] = useState("");
  const deferredUserSearch = useDeferredValue(userSearch);
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [usersCursor, setUsersCursor] = useState<string | null>(null);
  const [usersCursorStack, setUsersCursorStack] = useState<Array<string | null>>([]);
  const [actingUserId, setActingUserId] = useState<string | null>(null);
  const [usersMessage, setUsersMessage] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("dashboard");
  const [auditSortMode, setAuditSortMode] = useState<AuditSortMode>("created_desc");
  const [userSortMode, setUserSortMode] = useState<UserSortMode>("created_desc");
  const [isExportingAudit, setIsExportingAudit] = useState(false);
  const [isExportingUsers, setIsExportingUsers] = useState(false);

  const applyHashWorkspaceTab = useCallback(() => {
    if (typeof window === "undefined") return;
    const mapped = HASH_TAB_MAP[window.location.hash];
    if (!mapped) return;
    setActiveTab(mapped.tab);
    if (mapped.accountType) {
      setUserAccountType(mapped.accountType);
    }
  }, []);

  const navigateToLogin = useCallback(
    (reason: "manual" | "unauthorized") => {
      const target = reason === "unauthorized" ? "/login?timeout=1" : "/login?logout=1";
      startTransition(() => {
        window.location.href = target;
      });
    },
    [startTransition],
  );

  const logoutToLogin = useCallback(
    async (reason: "manual" | "unauthorized") => {
      if (signingOut) return;
      setSigningOut(true);

      try {
        const supabase = createBrowserSupabase();
        await supabase.auth.signOut({ scope: "local" });
      } finally {
        navigateToLogin(reason);
      }
    },
    [navigateToLogin, signingOut],
  );

  const handleUnauthorized = useCallback(() => {
    void logoutToLogin("unauthorized");
  }, [logoutToLogin]);

  const loadStats = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) {
        setStatsLoading(true);
      }
      setStatsError(null);

      try {
        const response = await fetch("/api/admin/stats", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (response.status === 401 || response.status === 403) {
          handleUnauthorized();
          return;
        }

        const body = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(normalizeApiError(body, text.errLoadStats));
        }

        setStats(body as StatsPayload);
      } catch (error) {
        setStatsError(error instanceof Error ? error.message : text.errLoadStats);
      } finally {
        setStatsLoading(false);
      }
    },
    [handleUnauthorized, text.errLoadStats],
  );

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", String(auditFilter.limit));
      if (auditFilter.q) params.set("q", auditFilter.q);
      if (auditFilter.action) params.set("action", auditFilter.action);
      if (auditFilter.from) params.set("from", auditFilter.from);
      if (auditFilter.to) params.set("to", auditFilter.to);
      if (auditCursor) params.set("cursor", auditCursor);

      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeApiError(body, text.errLoadAudit));
      }

      setAudit(body as AuditPayload);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : text.errLoadAudit);
    } finally {
      setAuditLoading(false);
    }
  }, [auditCursor, auditFilter.action, auditFilter.from, auditFilter.limit, auditFilter.q, auditFilter.to, handleUnauthorized, text.errLoadAudit]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "12");
      params.set("accountType", userAccountType);
      if (usersCursor) params.set("cursor", usersCursor);

      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeApiError(body, text.errLoadUsers));
      }

      setUsers(body as UsersPayload);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : text.errLoadUsers);
    } finally {
      setUsersLoading(false);
    }
  }, [handleUnauthorized, text.errLoadUsers, userAccountType, usersCursor]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setUsersCursor(null);
    setUsersCursorStack([]);
  }, [userAccountType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    applyHashWorkspaceTab();
    window.addEventListener("hashchange", applyHashWorkspaceTab);
    return () => {
      window.removeEventListener("hashchange", applyHashWorkspaceTab);
    };
  }, [applyHashWorkspaceTab]);

  const filteredUsers = useMemo(() => {
    const keyword = deferredUserSearch.trim().toLowerCase();
    const baseUsers = users?.users ?? [];

    return baseUsers.filter((user) => {
      if (showPendingOnly && user.status !== "pending_approval" && user.role !== "pending") {
        return false;
      }
      if (!keyword) {
        return true;
      }

      const haystack = [user.email ?? "", user.full_name ?? "", user.role, user.status, user.id].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [deferredUserSearch, showPendingOnly, users?.users]);

  const pendingCount = useMemo(() => {
    const rows = users?.users ?? [];
    return rows.filter((row) => row.status === "pending_approval" || row.role === "pending").length;
  }, [users?.users]);

  const usersScopeDescription =
    userAccountType === "general" ? text.usersScopeGeneralDesc : text.usersScopeBackofficeDesc;

  const sortedAuditLogs = useMemo(() => {
    const rows = [...(audit?.logs ?? [])];

    rows.sort((left, right) => {
      if (auditSortMode === "created_asc") {
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      }
      if (auditSortMode === "created_desc") {
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      }

      const leftAction = toCellText(left.action_type).toLowerCase();
      const rightAction = toCellText(right.action_type).toLowerCase();
      const compare = leftAction.localeCompare(rightAction);
      return auditSortMode === "action_asc" ? compare : -compare;
    });

    return rows;
  }, [audit?.logs, auditSortMode]);

  const sortedUsers = useMemo(() => {
    const rows = [...filteredUsers];

    rows.sort((left, right) => {
      if (userSortMode === "created_asc") {
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      }
      if (userSortMode === "created_desc") {
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      }
      if (userSortMode === "name_asc") {
        return toCellText(left.full_name).localeCompare(toCellText(right.full_name));
      }
      if (userSortMode === "name_desc") {
        return toCellText(right.full_name).localeCompare(toCellText(left.full_name));
      }
      if (userSortMode === "role_asc") {
        return toCellText(left.role).localeCompare(toCellText(right.role));
      }
      return toCellText(left.status).localeCompare(toCellText(right.status));
    });

    return rows;
  }, [filteredUsers, userSortMode]);

  const appliedAuditChips = useMemo(() => {
    const chips: Array<{ key: keyof AuditFilterApplied; label: string }> = [];

    if (auditFilter.q) chips.push({ key: "q", label: `${text.chipSearch}: ${auditFilter.q}` });
    if (auditFilter.action) chips.push({ key: "action", label: `${text.chipAction}: ${auditFilter.action}` });
    if (auditFilter.from) chips.push({ key: "from", label: `${text.chipFrom}: ${auditFilter.from}` });
    if (auditFilter.to) chips.push({ key: "to", label: `${text.chipTo}: ${auditFilter.to}` });
    if (auditFilter.limit !== 10) chips.push({ key: "limit", label: `${text.chipRows}: ${auditFilter.limit}` });

    return chips;
  }, [auditFilter, text.chipAction, text.chipFrom, text.chipRows, text.chipSearch, text.chipTo]);

  const appliedUsersChips = useMemo(() => {
    const chips: Array<{ key: "search" | "pending" | "scope"; label: string }> = [];
    chips.push({
      key: "scope",
      label: userAccountType === "general" ? text.usersGeneralTab : text.usersBackofficeTab,
    });
    if (userSearch.trim()) chips.push({ key: "search", label: `${text.chipSearch}: ${userSearch.trim()}` });
    if (showPendingOnly) chips.push({ key: "pending", label: text.pendingOnly });
    return chips;
  }, [showPendingOnly, text.chipSearch, text.pendingOnly, text.usersBackofficeTab, text.usersGeneralTab, userAccountType, userSearch]);

  function applyAuditFilter(next: AuditFilterApplied) {
    setAuditCursor(null);
    setAuditCursorStack([]);
    setAuditDraftFilter(next);
    setAuditFilter(next);
  }

  function removeAuditChip(key: keyof AuditFilterApplied) {
    const next = { ...auditFilter };

    if (key === "limit") {
      next.limit = 10;
    } else {
      next[key] = "";
    }

    applyAuditFilter(next);
  }

  function removeUsersChip(key: "search" | "pending" | "scope") {
    if (key === "search") setUserSearch("");
    if (key === "pending") setShowPendingOnly(false);
    if (key === "scope") {
      setUserAccountType("general");
      if (typeof window !== "undefined") window.location.hash = "workspace-users-general";
    }
  }

  async function exportAuditCsv() {
    if (isExportingAudit) return;
    setIsExportingAudit(true);

    try {
      const params = new URLSearchParams();
      params.set("format", "csv");
      params.set("limit", "5000");
      if (auditFilter.q) params.set("q", auditFilter.q);
      if (auditFilter.action) params.set("action", auditFilter.action);
      if (auditFilter.from) params.set("from", auditFilter.from);
      if (auditFilter.to) params.set("to", auditFilter.to);

      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown;
        throw new Error(normalizeApiError(body, text.errExportAudit));
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : text.errExportAudit);
    } finally {
      setIsExportingAudit(false);
    }
  }

  async function exportUsersCsv() {
    if (isExportingUsers) return;
    setIsExportingUsers(true);

    try {
      const header = ["id", "full_name", "email", "role", "status", "created_at"];
      const rows = sortedUsers.map((row) =>
        [row.id, toCellText(row.full_name), toCellText(row.email), row.role, row.status, row.created_at].map(csvCell).join(","),
      );
      const csv = [header.map(csvCell).join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setIsExportingUsers(false);
    }
  }

  async function patchUser(userId: string, payload: { role?: string; status?: string; fullName?: string }) {
    setUsersMessage(null);
    setActingUserId(userId);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, ...payload }),
      });

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeApiError(body, text.errUpdateUser));
      }

      setUsersMessage(text.usersUpdated);
      void loadUsers();
      void loadStats(true);
    } catch (error) {
      setUsersMessage(error instanceof Error ? error.message : text.errUpdateUser);
    } finally {
      setActingUserId(null);
    }
  }

  async function deleteUser(userId: string) {
    const confirmed = window.confirm(text.confirmDelete);
    if (!confirmed) return;

    setUsersMessage(null);
    setActingUserId(userId);

    try {
      const response = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(normalizeApiError(body, text.errDeleteUser));
      }

      setUsersMessage(text.usersDeleted);
      void loadUsers();
      void loadStats(true);
    } catch (error) {
      setUsersMessage(error instanceof Error ? error.message : text.errDeleteUser);
    } finally {
      setActingUserId(null);
    }
  }

  return (
    <>
      <div className="workspace-anchor" id="workspace-dashboard" />
      <div className="workspace-anchor" id="workspace-audit" />
      <div className="workspace-anchor" id="workspace-users" />
      <div className="workspace-anchor" id="workspace-users-general" />
      <div className="workspace-anchor" id="workspace-users-backoffice" />
      <section className="panel workspace-tabs-panel mt-4">
        <div className="workspace-head">
          <div>
            <h3 className="text-base font-semibold">{text.workspaceTitle}</h3>
            <p className="mt-1 text-sm muted">{text.workspaceDesc}</p>
          </div>
          <div className="workspace-kpi-row">
            <span className="workspace-kpi">
              {text.kpiTotal}: {stats?.totalUsers ?? 0}
            </span>
            <span className="workspace-kpi">
              {text.kpiActive}: {stats?.activeUsers ?? 0}
            </span>
            <span className="workspace-kpi">
              {text.kpiPending}: {stats?.pendingApprovals ?? 0}
            </span>
          </div>
        </div>

        <div className="workspace-tabs mt-3">
          {WORKSPACE_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`workspace-tab ${activeTab === tab.id ? "workspace-tab-active" : ""}`}
              onClick={() => {
                setActiveTab(tab.id);
                if (typeof window !== "undefined") {
                  window.location.hash =
                    tab.id === "users" ? `workspace-users-${userAccountType}` : `workspace-${tab.id}`;
                }
              }}
              type="button"
            >
              {text[tab.labelKey]}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "dashboard" ? (
        <>
      <section className="panel mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{text.sessionControlTitle}</h3>
            <p className="mt-1 text-sm muted">{text.sessionControlDesc}</p>
          </div>
          <button
            className="danger-button"
            disabled={signingOut || isNavigating}
            onClick={() => {
              void logoutToLogin("manual");
            }}
            type="button"
          >
            {signingOut || isNavigating ? text.signingOut : text.signOut}
          </button>
        </div>
      </section>

      <section className="panel mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{text.liveSnapshotTitle}</h3>
            <p className="mt-1 text-sm muted">{text.liveSnapshotDesc}</p>
          </div>
          <button
            className="ghost-button"
            disabled={statsLoading}
            onClick={() => {
              void loadStats(true);
            }}
            type="button"
          >
            {statsLoading ? text.refreshing : text.refreshStats}
          </button>
        </div>

        {statsError ? <p className="error-banner mt-3 text-sm">{statsError}</p> : null}

        {statsLoading ? (
          <p className="mt-4 text-sm muted">{text.loadingStats}</p>
        ) : (
          <div className="metric-grid mt-4">
            <article className="metric-card">
              <h4>{text.totalUsers}</h4>
              <p>{stats?.totalUsers ?? 0}</p>
            </article>
            <article className="metric-card">
              <h4>{text.activeUsers}</h4>
              <p>{stats?.activeUsers ?? 0}</p>
            </article>
            <article className="metric-card">
              <h4>{text.adminUsers}</h4>
              <p>{stats?.adminUsers ?? 0}</p>
            </article>
            <article className="metric-card">
              <h4>{text.pendingApprovals}</h4>
              <p>{stats?.pendingApprovals ?? 0}</p>
            </article>
            <article className="metric-card">
              <h4>{text.reviewed24h}</h4>
              <p>{stats?.reviewedApprovals24h ?? 0}</p>
            </article>
            <article className="metric-card">
              <h4>{text.sensitiveActions24h}</h4>
              <p>{stats?.recentSensitiveActions24h ?? 0}</p>
            </article>
          </div>
        )}
      </section>
        </>
      ) : null}

      {activeTab === "audit" ? (
      <section className="panel mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{text.auditTitle}</h3>
            <p className="mt-1 text-sm muted">{text.auditDesc}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="admin-input compact-input"
              onChange={(event) => setAuditSortMode(event.target.value as AuditSortMode)}
              value={auditSortMode}
            >
              <option value="created_desc">{text.newestFirst}</option>
              <option value="created_asc">{text.oldestFirst}</option>
              <option value="action_asc">{text.actionAz}</option>
              <option value="action_desc">{text.actionZa}</option>
            </select>
            <button className="ghost-button" disabled={isExportingAudit} onClick={() => void exportAuditCsv()} type="button">
              {isExportingAudit ? text.exporting : text.exportCsv}
            </button>
            <button
              className="ghost-button"
              disabled={auditLoading || auditCursorStack.length === 0}
              onClick={() => {
                setAuditCursorStack((prev) => {
                  if (prev.length === 0) return prev;
                  const next = [...prev];
                  const previousCursor = next.pop() ?? null;
                  setAuditCursor(previousCursor);
                  return next;
                });
              }}
              type="button"
            >
              {text.previous}
            </button>
            <button
              className="ghost-button"
              disabled={auditLoading || !audit?.pagination?.hasMore || !audit?.pagination?.nextCursor}
              onClick={() => {
                setAuditCursorStack((prev) => [...prev, auditCursor]);
                setAuditCursor(audit?.pagination?.nextCursor ?? null);
              }}
              type="button"
            >
              {text.next}
            </button>
          </div>
        </div>

        <div className="filter-grid audit-filter-grid mt-4">
          <input
            className="admin-input"
            onChange={(event) => setAuditDraftFilter((prev) => ({ ...prev, q: event.target.value }))}
            placeholder={text.searchActionPlaceholder}
            type="text"
            value={auditDraftFilter.q}
          />
          <input
            className="admin-input"
            onChange={(event) => setAuditDraftFilter((prev) => ({ ...prev, action: event.target.value }))}
            placeholder={text.exactActionPlaceholder}
            type="text"
            value={auditDraftFilter.action}
          />
          <input
            className="admin-input"
            onChange={(event) => setAuditDraftFilter((prev) => ({ ...prev, from: event.target.value }))}
            type="date"
            value={auditDraftFilter.from}
          />
          <input
            className="admin-input"
            onChange={(event) => setAuditDraftFilter((prev) => ({ ...prev, to: event.target.value }))}
            type="date"
            value={auditDraftFilter.to}
          />
          <select
            className="admin-input"
            onChange={(event) =>
              setAuditDraftFilter((prev) => ({
                ...prev,
                limit: Number(event.target.value),
              }))
            }
            value={String(auditDraftFilter.limit)}
          >
            <option value="10">{text.rows10}</option>
            <option value="20">{text.rows20}</option>
            <option value="50">{text.rows50}</option>
          </select>
          <button
            className="primary-button"
            onClick={() => {
              applyAuditFilter({ ...auditDraftFilter });
            }}
            type="button"
          >
            {text.applyFilters}
          </button>
        </div>

        {appliedAuditChips.length > 0 ? (
          <div className="chip-row mt-3">
            {appliedAuditChips.map((chip) => (
              <button key={chip.key} className="filter-chip" onClick={() => removeAuditChip(chip.key)} type="button">
                {chip.label} x
              </button>
            ))}
          </div>
        ) : null}

        {auditError ? <p className="error-banner mt-3 text-sm">{auditError}</p> : null}
        {auditLoading ? (
          <p className="mt-4 text-sm muted">{text.loadingAudit}</p>
        ) : (
          <div className="table-shell table-scroll mt-4 overflow-x-auto">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>{text.colNo}</th>
                  <th>{text.colAction}</th>
                  <th>{text.colActor}</th>
                  <th>{text.colTargetUser}</th>
                  <th>{text.colCreatedAt}</th>
                  <th>{text.colMeta}</th>
                </tr>
              </thead>
              <tbody>
                {(audit?.logs ?? []).length === 0 ? (
                  <tr>
                    <td className="muted" colSpan={6}>
                      {text.noAudit}
                    </td>
                  </tr>
                ) : (
                  sortedAuditLogs.map((log, index) => (
                    <tr key={log.id}>
                      <td>{index + 1}</td>
                      <td title={toCellText(log.action_type)}>
                        <span className="cell-ellipsis">{toCellText(log.action_type)}</span>
                      </td>
                      <td title={toCellText(log.actor_user_id)}>
                        <span className="cell-ellipsis">{truncateText(toCellText(log.actor_user_id), 24)}</span>
                      </td>
                      <td title={toCellText(log.target_user_id)}>
                        <span className="cell-ellipsis">{truncateText(toCellText(log.target_user_id), 24)}</span>
                      </td>
                      <td>{formatDateTime(log.created_at, locale)}</td>
                      <td title={formatAuditMeta(log.metadata_json)}>
                        <span className="cell-ellipsis">{truncateText(formatAuditMeta(log.metadata_json), 88)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {activeTab === "users" ? (
      <section className="panel mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{text.usersTitle}</h3>
            <p className="mt-1 text-sm muted">
              {text.usersDesc}: <strong>{pendingCount}</strong>
            </p>
            <p className="mt-1 text-xs muted">{usersScopeDescription}</p>
          </div>

          <div className="user-account-switch">
            <button
              className={`user-account-btn ${userAccountType === "general" ? "user-account-btn-active" : ""}`}
              onClick={() => {
                setUserAccountType("general");
                if (typeof window !== "undefined") window.location.hash = "workspace-users-general";
              }}
              type="button"
            >
              {text.usersGeneralTab}
            </button>
            <button
              className={`user-account-btn ${userAccountType === "backoffice" ? "user-account-btn-active" : ""}`}
              onClick={() => {
                setUserAccountType("backoffice");
                if (typeof window !== "undefined") window.location.hash = "workspace-users-backoffice";
              }}
              type="button"
            >
              {text.usersBackofficeTab}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="admin-input compact-input"
              onChange={(event) => setUserSortMode(event.target.value as UserSortMode)}
              value={userSortMode}
            >
              <option value="created_desc">{text.newestFirst}</option>
              <option value="created_asc">{text.oldestFirst}</option>
              <option value="name_asc">{text.nameAz}</option>
              <option value="name_desc">{text.nameZa}</option>
              <option value="role_asc">{text.roleAz}</option>
              <option value="status_asc">{text.statusAz}</option>
            </select>
            <button className="ghost-button" disabled={isExportingUsers} onClick={() => void exportUsersCsv()} type="button">
              {isExportingUsers ? text.exporting : text.exportCsv}
            </button>
            <button
              className="ghost-button"
              disabled={usersLoading || usersCursorStack.length === 0}
              onClick={() => {
                setUsersCursorStack((prev) => {
                  if (prev.length === 0) return prev;
                  const next = [...prev];
                  const previousCursor = next.pop() ?? null;
                  setUsersCursor(previousCursor);
                  return next;
                });
              }}
              type="button"
            >
              {text.previous}
            </button>
            <button
              className="ghost-button"
              disabled={usersLoading || !users?.pagination?.hasMore || !users?.pagination?.nextCursor}
              onClick={() => {
                setUsersCursorStack((prev) => [...prev, usersCursor]);
                setUsersCursor(users?.pagination?.nextCursor ?? null);
              }}
              type="button"
            >
              {text.next}
            </button>
          </div>
        </div>

        <div className="filter-grid users-filter-grid mt-4">
          <input
            className="admin-input"
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder={text.searchUsersPlaceholder}
            type="text"
            value={userSearch}
          />
          <label className="inline-toggle">
            <input
              checked={showPendingOnly}
              onChange={(event) => setShowPendingOnly(event.target.checked)}
              type="checkbox"
            />
            {text.pendingOnly}
          </label>
          <button
            className="ghost-button"
            disabled={usersLoading}
            onClick={() => {
              void loadUsers();
            }}
            type="button"
          >
            {usersLoading ? text.refreshing : text.refreshUsers}
          </button>
        </div>

        {appliedUsersChips.length > 0 ? (
          <div className="chip-row mt-3">
            {appliedUsersChips.map((chip) => (
              <button key={chip.key} className="filter-chip" onClick={() => removeUsersChip(chip.key)} type="button">
                {chip.label} x
              </button>
            ))}
          </div>
        ) : null}

        {usersError ? <p className="error-banner mt-3 text-sm">{usersError}</p> : null}
        {usersMessage ? <p className="success-banner mt-3 text-sm">{usersMessage}</p> : null}

        {usersLoading ? (
          <p className="mt-4 text-sm muted">{text.loadingUsers}</p>
        ) : (
          <div className="table-shell table-scroll mt-4 overflow-x-auto">
            <table className="audit-table users-table">
              <thead>
                <tr>
                  <th>{text.colNo}</th>
                  <th>{text.colUser}</th>
                  <th>{text.colRole}</th>
                  <th>{text.colStatus}</th>
                  <th>{text.colCreated}</th>
                  <th>{text.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.length === 0 ? (
                  <tr>
                    <td className="muted" colSpan={6}>
                      {text.noUsers}
                    </td>
                  </tr>
                ) : (
                  sortedUsers.map((user, index) => (
                    <tr key={user.id}>
                      <td>{index + 1}</td>
                      <td>
                        <p className="font-semibold">{user.full_name || "-"}</p>
                        <p className="mt-1 text-xs muted" title={toCellText(user.email)}>
                          <span className="cell-ellipsis">{toCellText(user.email)}</span>
                        </p>
                        <p className="mt-1 text-xs muted" title={user.id}>
                          <span className="cell-ellipsis">{truncateText(user.id, 24)}</span>
                        </p>
                      </td>
                      <td>
                        <select
                          className="admin-input compact-input"
                          disabled={actingUserId === user.id}
                          onChange={(event) => {
                            void patchUser(user.id, { role: event.target.value });
                          }}
                          value={user.role}
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`status-pill status-${user.status}`}>{user.status}</span>
                      </td>
                      <td>{formatDateTime(user.created_at, locale)}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="ghost-button compact-button"
                            disabled={actingUserId === user.id}
                            onClick={() => {
                              const patch: { status: string; role?: string } = { status: "active" };
                              if (user.role === "pending") {
                                patch.role = "user";
                              }
                              void patchUser(user.id, patch);
                            }}
                            type="button"
                          >
                            {text.approve}
                          </button>
                          <button
                            className="ghost-button compact-button"
                            disabled={actingUserId === user.id}
                            onClick={() => {
                              void patchUser(user.id, { status: "disabled" });
                            }}
                            type="button"
                          >
                            {text.disable}
                          </button>
                          <button
                            className="danger-button compact-button"
                            disabled={actingUserId === user.id}
                            onClick={() => {
                              void deleteUser(user.id);
                            }}
                            type="button"
                          >
                            {text.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}
    </>
  );
}
