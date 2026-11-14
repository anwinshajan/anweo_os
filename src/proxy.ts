import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the session cookie and sends signed-out users to /login.
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data } = await sb.auth.getUser();
  const path = req.nextUrl.pathname;
  const isLogin = path.startsWith("/login");
  // Password reset pages must work signed out. If the email link lands on the home page with a code, hand it to /reset.
  if (path === "/" && !data.user && req.nextUrl.searchParams.get("code")) {
    const url = req.nextUrl.clone();
    url.pathname = "/reset";
    return NextResponse.redirect(url);
  }
  const isPublic = isLogin || path.startsWith("/forgot") || path.startsWith("/reset");
  if (!data.user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (data.user && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon.*|api/cron|api/leads|s/|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
