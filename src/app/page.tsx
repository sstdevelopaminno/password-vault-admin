import Link from "next/link";
import { env } from "@/lib/env";
import { requireAdminSession } from "@/lib/auth";

export default async function HomePage() {
  const { profile } = await requireAdminSession();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{env.NEXT_PUBLIC_APP_NAME}</h1>
      <p className="mt-3 text-sm text-neutral-600">
        Standalone admin app is running. This project is separated from the user app and can be deployed to a new Vercel project.
      </p>

      <section className="mt-8 grid gap-4 rounded-xl border border-neutral-200 p-5">
        <h2 className="text-lg font-medium">Current Session</h2>
        <p className="text-sm">Name: {profile.full_name ?? "-"}</p>
        <p className="text-sm">Email: {profile.email ?? "-"}</p>
        <p className="text-sm">Role: {profile.role}</p>
        <p className="text-sm">Status: {profile.status}</p>
      </section>

      <section className="mt-6 grid gap-2 text-sm">
        <Link className="underline" href="/api/health">
          /api/health
        </Link>
        <Link className="underline" href="/api/whoami">
          /api/whoami
        </Link>
      </section>
    </main>
  );
}
