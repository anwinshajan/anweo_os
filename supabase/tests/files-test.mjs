import { detectProvider, normalizeUrl, descendantIds, pathTo, reachable, isMissingTable, newToken } from "../../src/lib/files.ts";
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };

ok("Google Drive and Docs links are recognised", detectProvider("https://drive.google.com/drive/folders/abc") === "google_drive" && detectProvider("https://docs.google.com/document/d/1") === "google_drive");
ok("other providers", detectProvider("https://www.dropbox.com/s/x") === "dropbox" && detectProvider("https://www.figma.com/file/1") === "figma" && detectProvider("https://canva.com/design/1") === "canva" && detectProvider("https://youtu.be/abc") === "youtube");
ok("look-alike domains are not mistaken for Drive", detectProvider("https://drive.google.com.evil.example/x") === "link" && detectProvider("https://notgoogle.com") === "link");
ok("an unknown site is a plain link", detectProvider("https://example.com/a") === "link" && detectProvider("not a url") === "link");

ok("a bare address gets https", normalizeUrl("drive.google.com/drive/folders/abc") === "https://drive.google.com/drive/folders/abc");
ok("http is upgraded to https", normalizeUrl("http://example.com/a") === "https://example.com/a");
ok("dangerous or broken addresses are refused", normalizeUrl("javascript:alert(1)") === null && normalizeUrl("data:text/html,x") === null && normalizeUrl("file:///etc/passwd") === null && normalizeUrl("") === null && normalizeUrl("has space.com") === null && normalizeUrl("localhost") === null);

const rows = [
  { id: "root", parent_id: null, status: "shared" }, { id: "a", parent_id: "root", status: "shared" }, { id: "b", parent_id: "a", status: "shared" },
  { id: "c", parent_id: "root", status: "internal" }, { id: "d", parent_id: "c", status: "shared" }, { id: "e", parent_id: null, status: "pending" },
];
ok("descendants include every depth", descendantIds(rows, "root").sort().join() === "a,b,c,d");
ok("a file with nothing inside has no descendants", descendantIds(rows, "b").length === 0);
ok("the breadcrumb runs from the top", pathTo(rows, "b").map((r) => r.id).join(">") === "root>a>b" && pathTo(rows, null).length === 0);
ok("a client reaches only shared items whose folders are shared too", reachable(rows).map((r) => r.id).sort().join() === "a,b,root");
ok("a shared file inside an unshared folder stays hidden", !reachable(rows).some((r) => r.id === "d"));
ok("missing-table errors are recognised", isMissingTable({ code: "42P01" }) && isMissingTable({ code: "PGRST205" }) && isMissingTable({ message: "relation \"x\" does not exist" }) && !isMissingTable({ message: "permission denied" }) && !isMissingTable(null));
ok("tokens are long and different each time", newToken().length === 32 && newToken() !== newToken());
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
