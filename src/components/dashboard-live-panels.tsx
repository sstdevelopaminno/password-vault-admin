"use client";

import { useEffect, useState } from "react";

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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

export function DashboardLivePanels() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadDashboardData(isManualRefresh = false) {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setErrorMessage(null);

    try {
      const [statsResponse, auditResponse] = await Promise.all([
        fetch("/api/admin/stats", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/admin/audit-logs?limit=10", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      if (statsResponse.status === 401 || statsResponse.status === 403) {
        window.location.href = "/login";
        return;
      }

      if (auditResponse.status === 401 || auditResponse.status === 403) {
        window.location.href = "/login";
        return;
      }

      if (!statsResponse.ok) {
        const body = await statsResponse.text();
        throw new Error(body || "Unable to load system stats.");
      }

      if (!auditResponse.ok) {
        const body = await auditResponse.text();
        throw new Error(body || "Unable to load audit logs.");
      }

      const statsBody = (await statsResponse.json()) as StatsPayload;
      const auditBody = (await auditResponse.json()) as AuditPayload;

      setStats(statsBody);
      setAudit(auditBody);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to load dashboard data.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();
  }, []);

  return (
    <section className="panel mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Live Operations Snapshot</h3>
          <p className="mt-1 text-sm muted">Real-time stats and latest security activities from admin APIs.</p>
        </div>
        <button
          className="ghost-button"
          disabled={isLoading || isRefreshing}
          onClick={() => void loadDashboardData(true)}
          type="button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {errorMessage ? <p className="error-banner mt-3 text-sm">{errorMessage}</p> : null}

      {isLoading ? (
        <p className="mt-4 text-sm muted">Loading dashboard data...</p>
      ) : (
        <>
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
                      <td>{truncateText(JSON.stringify(log.metadata_json ?? {}), 64)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
