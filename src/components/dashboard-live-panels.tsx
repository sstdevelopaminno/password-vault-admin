"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

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
};

type AuditFilterDraft = {
  q: string;
  action: string;
  from: string;
  to: string;
  limit: number;
};

type AuditFilterApplied = AuditFilterDraft;

const ROLE_OPTIONS = ["user", "approver", "admin", "super_admin"] as const;

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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

export function DashboardLivePanels() {
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
  const [userSearch, setUserSearch] = useState("");
  const deferredUserSearch = useDeferredValue(userSearch);
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [usersCursor, setUsersCursor] = useState<string | null>(null);
  const [usersCursorStack, setUsersCursorStack] = useState<Array<string | null>>([]);
  const [actingUserId, setActingUserId] = useState<string | null>(null);
  const [usersMessage, setUsersMessage] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);

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
        await supabase.auth.signOut();
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
          throw new Error(normalizeApiError(body, "Unable to load system stats."));
        }

        setStats(body as StatsPayload);
      } catch (error) {
        setStatsError(error instanceof Error ? error.message : "Unable to load system stats.");
      } finally {
        setStatsLoading(false);
      }
    },
    [handleUnauthorized],
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
        throw new Error(normalizeApiError(body, "Unable to load audit logs."));
      }

      setAudit(body as AuditPayload);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Unable to load audit logs.");
    } finally {
      setAuditLoading(false);
    }
  }, [auditCursor, auditFilter.action, auditFilter.from, auditFilter.limit, auditFilter.q, auditFilter.to, handleUnauthorized]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "12");
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
        throw new Error(normalizeApiError(body, "Unable to load users directory."));
      }

      setUsers(body as UsersPayload);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Unable to load users directory.");
    } finally {
      setUsersLoading(false);
    }
  }, [handleUnauthorized, usersCursor]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

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
        throw new Error(normalizeApiError(body, "Unable to update user."));
      }

      setUsersMessage("User updated successfully.");
      void loadUsers();
      void loadStats(true);
    } catch (error) {
      setUsersMessage(error instanceof Error ? error.message : "Unable to update user.");
    } finally {
      setActingUserId(null);
    }
  }

  async function deleteUser(userId: string) {
    const confirmed = window.confirm("Delete this user account permanently?");
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
        throw new Error(normalizeApiError(body, "Unable to delete user."));
      }

      setUsersMessage("User deleted successfully.");
      void loadUsers();
      void loadStats(true);
    } catch (error) {
      setUsersMessage(error instanceof Error ? error.message : "Unable to delete user.");
    } finally {
      setActingUserId(null);
    }
  }

  return (
    <>
      <section className="panel mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Session Control</h3>
            <p className="mt-1 text-sm muted">This device stays signed in until you manually sign out.</p>
          </div>
          <button
            className="danger-button"
            disabled={signingOut || isNavigating}
            onClick={() => {
              void logoutToLogin("manual");
            }}
            type="button"
          >
            {signingOut || isNavigating ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </section>

      <section className="panel mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Live Operations Snapshot</h3>
            <p className="mt-1 text-sm muted">Real-time stats and latest security activities from admin APIs.</p>
          </div>
          <button
            className="ghost-button"
            disabled={statsLoading}
            onClick={() => {
              void loadStats(true);
            }}
            type="button"
          >
            {statsLoading ? "Refreshing..." : "Refresh Stats"}
          </button>
        </div>

        {statsError ? <p className="error-banner mt-3 text-sm">{statsError}</p> : null}

        {statsLoading ? (
          <p className="mt-4 text-sm muted">Loading stats...</p>
        ) : (
          <div className="metric-grid mt-4">
            <article className="metric-card">
              <h4>Total Users</h4>
              <p>{stats?.totalUsers ?? 0}</p>
            </article>
            <article className="metric-card">
              <h4>Active Users</h4>
              <p>{stats?.activeUsers ?? 0}</p>
            </article>
            <article className="metric-card">
              <h4>Admin Users</h4>
              <p>{stats?.adminUsers ?? 0}</p>
            </article>
            <article className="metric-card">
              <h4>Pending Approvals</h4>
              <p>{stats?.pendingApprovals ?? 0}</p>
            </article>
            <article className="metric-card">
              <h4>Reviewed 24h</h4>
              <p>{stats?.reviewedApprovals24h ?? 0}</p>
            </article>
            <article className="metric-card">
              <h4>Sensitive Actions 24h</h4>
              <p>{stats?.recentSensitiveActions24h ?? 0}</p>
            </article>
          </div>
        )}
      </section>

      <section className="panel mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Audit Logs</h3>
            <p className="mt-1 text-sm muted">Filter, inspect and paginate security events.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              Previous
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
              Next
            </button>
          </div>
        </div>

        <div className="filter-grid mt-4">
          <input
            className="admin-input"
            onChange={(event) => setAuditDraftFilter((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Search action..."
            type="text"
            value={auditDraftFilter.q}
          />
          <input
            className="admin-input"
            onChange={(event) => setAuditDraftFilter((prev) => ({ ...prev, action: event.target.value }))}
            placeholder="Exact action type"
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
            <option value="10">10 rows</option>
            <option value="20">20 rows</option>
            <option value="50">50 rows</option>
          </select>
          <button
            className="primary-button"
            onClick={() => {
              setAuditCursor(null);
              setAuditCursorStack([]);
              setAuditFilter({ ...auditDraftFilter });
            }}
            type="button"
          >
            Apply Filters
          </button>
        </div>

        {auditError ? <p className="error-banner mt-3 text-sm">{auditError}</p> : null}
        {auditLoading ? (
          <p className="mt-4 text-sm muted">Loading audit logs...</p>
        ) : (
          <div className="table-shell mt-4 overflow-x-auto">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target User</th>
                  <th>Created At</th>
                  <th>Meta</th>
                </tr>
              </thead>
              <tbody>
                {(audit?.logs ?? []).length === 0 ? (
                  <tr>
                    <td className="muted" colSpan={5}>
                      No audit logs found.
                    </td>
                  </tr>
                ) : (
                  (audit?.logs ?? []).map((log) => (
                    <tr key={log.id}>
                      <td>{log.action_type ?? "-"}</td>
                      <td>{truncateText(log.actor_user_id ?? "-", 18)}</td>
                      <td>{truncateText(log.target_user_id ?? "-", 18)}</td>
                      <td>{formatDateTime(log.created_at)}</td>
                      <td>{truncateText(JSON.stringify(log.metadata_json ?? {}), 68)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Users & Approvals</h3>
            <p className="mt-1 text-sm muted">
              Pending approvals in this page: <strong>{pendingCount}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              Previous
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
              Next
            </button>
          </div>
        </div>

        <div className="filter-grid mt-4">
          <input
            className="admin-input"
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Search user by email, name, role, status..."
            type="text"
            value={userSearch}
          />
          <label className="inline-toggle">
            <input
              checked={showPendingOnly}
              onChange={(event) => setShowPendingOnly(event.target.checked)}
              type="checkbox"
            />
            Pending approvals only
          </label>
          <button
            className="ghost-button"
            disabled={usersLoading}
            onClick={() => {
              void loadUsers();
            }}
            type="button"
          >
            {usersLoading ? "Refreshing..." : "Refresh Users"}
          </button>
        </div>

        {usersError ? <p className="error-banner mt-3 text-sm">{usersError}</p> : null}
        {usersMessage ? <p className="success-banner mt-3 text-sm">{usersMessage}</p> : null}

        {usersLoading ? (
          <p className="mt-4 text-sm muted">Loading users...</p>
        ) : (
          <div className="table-shell mt-4 overflow-x-auto">
            <table className="audit-table users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td className="muted" colSpan={5}>
                      No users found for current filter.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <p className="font-semibold">{user.full_name || "-"}</p>
                        <p className="mt-1 text-xs muted">{user.email || "-"}</p>
                        <p className="mt-1 text-xs muted">{truncateText(user.id, 22)}</p>
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
                      <td>{formatDateTime(user.created_at)}</td>
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
                            Approve
                          </button>
                          <button
                            className="ghost-button compact-button"
                            disabled={actingUserId === user.id}
                            onClick={() => {
                              void patchUser(user.id, { status: "disabled" });
                            }}
                            type="button"
                          >
                            Disable
                          </button>
                          <button
                            className="danger-button compact-button"
                            disabled={actingUserId === user.id}
                            onClick={() => {
                              void deleteUser(user.id);
                            }}
                            type="button"
                          >
                            Delete
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
    </>
  );
}
