import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// Runs every morning (see vercel.json). Creates every invoice that is due from recurring plans
// set to "automatic" and from dated instalments. It is safe to run twice: nothing is created twice.
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !same(auth, `Bearer ${secret}`)) return new NextResponse("Unauthorized", { status: 401 });

  const { data, error } = await supabaseAdmin().rpc("run_billing", { p_include_manual: false });
  if (error) {
    console.error("billing job failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, invoicesCreated: data });
}
