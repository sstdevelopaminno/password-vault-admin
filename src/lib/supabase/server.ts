import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export async function createServerSupabase() {
  const store = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(items) {
        items.forEach(({ name, value, options }) => {
          try {
            // In Server Components, Next.js blocks cookie writes.
            // Route Handlers / Server Actions can still set cookies normally.
            store.set(name, value, options);
          } catch {
            // Ignore write attempts in read-only contexts.
          }
        });
      },
    },
  });
}
