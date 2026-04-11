import Link from "next/link";
import { env } from "@/lib/env";
import { requireAdminSession } from "@/lib/auth";
import { resolveAdminLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const locale = await resolveAdminLocale();
  const { profile } = await requireAdminSession();

  return (
    <>
      <main className="office-shell p-6 md:p-7">
        <header className="panel">
          <span className="badge">Helpdesk Backoffice</span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{t(locale, "appTitle")}</h1>
          <p className="mt-2 max-w-4xl text-sm md:text-[15px] muted">{t(locale, "appSubtitle")}</p>
        </header>

        <section className="office-grid mt-4">
          <article className="panel col-span-12 md:col-span-6 xl:col-span-3">
            <h2 className="text-lg font-semibold">{t(locale, "serviceDesk")}</h2>
            <p className="mt-2 text-sm muted">{t(locale, "serviceDeskHint")}</p>
          </article>
          <article className="panel col-span-12 md:col-span-6 xl:col-span-3">
            <h2 className="text-lg font-semibold">{t(locale, "auditCenter")}</h2>
            <p className="mt-2 text-sm muted">{t(locale, "auditCenterHint")}</p>
          </article>
          <article className="panel col-span-12 md:col-span-6 xl:col-span-3">
            <h2 className="text-lg font-semibold">{t(locale, "billingCenter")}</h2>
            <p className="mt-2 text-sm muted">{t(locale, "billingCenterHint")}</p>
          </article>
          <article className="panel col-span-12 md:col-span-6 xl:col-span-3">
            <h2 className="text-lg font-semibold">{t(locale, "roleControl")}</h2>
            <p className="mt-2 text-sm muted">{t(locale, "roleControlHint")}</p>
          </article>
        </section>

        <section className="office-grid mt-4">
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

          <article className="panel col-span-12 lg:col-span-6">
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

        <section className="panel mt-4">
          <h3 className="text-base font-semibold">{t(locale, "authorityTitle")}</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <article className="rounded-xl border border-[var(--line-soft)] bg-white/70 p-4">
              <h4 className="text-sm font-bold">{t(locale, "authorityApprover")}</h4>
              <p className="mt-2 text-sm muted">{t(locale, "authorityApproverDesc")}</p>
            </article>
            <article className="rounded-xl border border-[var(--line-soft)] bg-white/70 p-4">
              <h4 className="text-sm font-bold">{t(locale, "authorityAdmin")}</h4>
              <p className="mt-2 text-sm muted">{t(locale, "authorityAdminDesc")}</p>
            </article>
            <article className="rounded-xl border border-[var(--line-soft)] bg-white/70 p-4">
              <h4 className="text-sm font-bold">{t(locale, "authorityOwner")}</h4>
              <p className="mt-2 text-sm muted">{t(locale, "authorityOwnerDesc")}</p>
            </article>
          </div>
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
