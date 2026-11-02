import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* called from a Server Component: middleware refreshes the session */
          }
        },
      },
    }
  );
}

// Service-role client. Server only. Bypasses RLS, so every caller must check the role first.
export function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export type Role = "admin" | "manager" | "developer" | "client";

export interface Me {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  status: "pending" | "active" | "disabled";
  client_id: string | null;
  can_manage_social: boolean;
}

export async function getMe(): Promise<Me | null> {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data } = await sb
    .from("profiles")
    .select("id,email,full_name,role,status,client_id,can_manage_social")
    .eq("id", auth.user.id)
    .single();
  return (data as Me) ?? null;
}
