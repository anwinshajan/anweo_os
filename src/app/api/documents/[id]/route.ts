import { NextResponse } from "next/server";
import { getMe, supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Opens a document. Row-level security decides whether this person may see the row at all;
// only then is a short-lived signed link created for the private file.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me || me.status !== "active") return NextResponse.redirect(new URL("/login", req.url));

  const { id } = await params;
  const sb = await supabaseServer();
  const { data: doc } = await sb.from("documents").select("storage_path").eq("id", id).single();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await supabaseAdmin().storage.from("documents").createSignedUrl(doc.storage_path, 60);
  if (error || !data) return new NextResponse("File unavailable", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
