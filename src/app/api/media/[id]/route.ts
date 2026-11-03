import { NextResponse } from "next/server";
import { getMe, supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Opens a studio image or video. Row-level security decides whether this person may see the row at all
// (clients only once the post is approved); only then is a short-lived signed link made for the private file.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me || me.status !== "active") return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const sb = await supabaseServer();
  const { data: m } = await sb.from("post_media").select("storage_path").eq("id", id).single();
  if (!m) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from("documents").createSignedUrl(m.storage_path, 300);
  if (error || !data) return new NextResponse("File unavailable", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("cache-control", "private, max-age=240");
  return res;
}
