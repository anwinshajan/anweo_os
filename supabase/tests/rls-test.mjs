import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => readFileSync(path.join(here, "..", "migrations", f), "utf8");

const db = new PGlite();
const sql = mig("0001_anweo_os.sql");
const sql2 = mig("0002_activity_visibility.sql");
const sql3 = mig("0003_roles.sql");
const sql4 = mig("0004_phase2.sql");
const sql6 = mig("0006_currencies.sql");
const sql7 = mig("0007_payment_plans.sql");
const sql8 = mig("0008_invoice_documents.sql");
const sql9 = mig("0009_project_payment_link.sql");

// Minimal Supabase auth stubs
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role authenticated nologin;
  create role anon nologin;
  grant usage on schema public, auth to authenticated;
`);
await db.exec(sql);
await db.exec(sql2);
await db.exec(sql3);
await db.exec(sql4);
await db.exec(sql6);
await db.exec(sql7);
await db.exec(sql8);
await db.exec(sql9);
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
               grant usage on all sequences in schema public to authenticated;
               grant execute on all functions in schema public to authenticated;`);

await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
               grant usage on all sequences in schema public to authenticated;`);
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name); };

async function as(uid, fn) {
  await db.exec(`set test.uid = '${uid ?? ""}'; set role authenticated;`);
  try { return await fn(); } finally { await db.exec(`reset role; set test.uid = '';`); }
}
const q = (s, p) => db.query(s, p);

// --- seed as superuser (like service role) ---
const id = async (email) => (await q(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id;
const admin = await id("admin@a.com"), mgr = await id("mgr@a.com"), dev = await id("dev@a.com"),
      devSocial = await id("devs@a.com"), cA = await id("clienta@a.com"), cB = await id("clientb@a.com"), rando = await id("rando@a.com");

const clA = (await q(`insert into clients(business_name) values ('Client A') returning id`)).rows[0].id;
const clB = (await q(`insert into clients(business_name) values ('Client B') returning id`)).rows[0].id;
const set = (u, role, cid, social=false) =>
  q(`update profiles set role=$2, status='active', client_id=$3, can_manage_social=$4, full_name=$5 where id=$1`, [u, role, cid, social, role]);
await set(admin, "admin", null); await set(mgr, "manager", null); await set(dev, "developer", null);
await set(devSocial, "developer", null, true); await set(cA, "client", clA); await set(cB, "client", clB);
// rando stays pending client

const svc = (await q(`select id from services limit 1`)).rows[0].id;
await q(`insert into client_services(client_id, service_id, price_monthly) values ($1,$2,100),($3,$2,200)`, [clA, svc, clB]);
await q(`insert into work_items(client_id,title,visible_to_client) values ($1,'A visible',true),($1,'A internal',false),($2,'B work',true)`, [clA, clB]);
await q(`insert into social_posts(client_id,caption,status) values ($1,'A idea','idea'),($1,'A awaiting','awaiting_approval'),($2,'B posted','posted')`, [clA, clB]);
await q(`insert into invoices(client_id,period_label,amount) values ($1,'Nov',100),($2,'Nov',200)`, [clA, clB]);
await q(`insert into invoices(client_id,period_label,amount,status) values ($1,'Draft',50,'draft')`, [clA]);

await q(`insert into activity_log(client_id,action,detail,client_visible) values
  ($1,'service_assigned','Service added: Social',true),
  ($1,'work_added','INTERNAL: chase payment',false),
  ($2,'service_assigned','B service',true)`, [clA, clB]);
await q(`insert into packages(service_id,name,price_monthly) values ($1,'Growth',300)`, [svc]);

// --- new signup defaults ---
const newU = await id("new@a.com");
const np = (await q(`select role,status from profiles where id=$1`, [newU])).rows[0];
ok("new signup is pending client (never admin)", np.role === "client" && np.status === "pending");

// --- client isolation ---
await as(cA, async () => {
  ok("client A sees only own client row", (await q(`select id from clients`)).rows.length === 1);
  ok("client A sees only own subs", (await q(`select id from client_services`)).rows.length === 1);
  const w = (await q(`select title from work_items`)).rows;
  ok("client A sees only visible own work", w.length === 1 && w[0].title === "A visible");
  const p = (await q(`select caption from social_posts`)).rows;
  ok("client A sees awaiting post but not idea", p.length === 1 && p[0].caption === "A awaiting");
  ok("client A sees only own invoices", (await q(`select id from invoices`)).rows.length === 1);
  const act = (await q(`select detail from activity_log`)).rows;
  ok("client A sees only own client-visible history", act.length === 1 && act[0].detail === "Service added: Social");
  ok("client A cannot see internal activity notes", !act.some(a => a.detail.startsWith("INTERNAL")));
  ok("client A can read the package list", (await q(`select id from packages`)).rows.length === 1);
  ok("client A cannot read other profiles", (await q(`select id from profiles`)).rows.length === 1);
  // writes
  let blocked = 0;
  for (const stmt of [
    `insert into work_items(client_id,title) values ('${clA}','x')`,
    `insert into social_posts(client_id,caption) values ('${clA}','x')`,
    `insert into invoices(client_id,period_label,amount) values ('${clA}','x',1)`,
    `insert into clients(business_name) values ('evil')`,
    `insert into client_services(client_id,service_id) values ('${clA}','${svc}')`,
    `insert into activity_log(client_id,action,client_visible) values ('${clA}','fake',true)`,
    `insert into packages(service_id,name,price_monthly) values ('${svc}','Free',0)`,
    `insert into services(name) values ('Hacked')`,
  ]) { try { await q(stmt); } catch { blocked++; } }
  ok("client A cannot insert work/posts/invoices/clients/subs/history/packages/services", blocked === 8);
  // update affecting 0 rows counts as blocked
  const u1 = await q(`update invoices set status='paid' where client_id='${clA}'`);
  ok("client A cannot mark own invoice paid", u1.affectedRows === 0);
  // privilege escalation
  let esc = false;
  try { await q(`update profiles set role='admin' where id='${cA}'`); } catch { esc = true; }
  ok("client cannot promote self to admin", esc);
  esc = false;
  try { await q(`update profiles set client_id='${clB}' where id='${cA}'`); } catch { esc = true; }
  ok("client cannot switch to another client's data", esc);
});
await as(rando, async () => {
  let esc = false;
  try { await q(`update profiles set status='active' where id='${rando}'`); } catch { esc = true; }
  ok("pending user cannot self-activate", esc);
  esc = false;
  try { await q(`update profiles set role='admin', status='active' where id='${rando}'`); } catch { esc = true; }
  ok("pending user cannot self-promote to admin", esc);
});

// --- pending user sees nothing ---
await as(rando, async () => {
  ok("pending user sees no clients", (await q(`select id from clients`)).rows.length === 0);
  ok("pending user sees no services list", (await q(`select id from services`)).rows.length === 0);
  ok("pending user sees no packages", (await q(`select id from packages`)).rows.length === 0);
});
await as(newU, async () => {
  ok("pending user sees no invoices", (await q(`select id from invoices`)).rows.length === 0);
});

// --- developer ---
await as(dev, async () => {
  ok("developer sees all clients", (await q(`select id from clients`)).rows.length === 2);
  ok("developer sees internal work", (await q(`select id from work_items`)).rows.length === 3);
  ok("developer cannot see invoices", (await q(`select id from invoices`)).rows.length === 0);
  ok("developer cannot see subscription prices", (await q(`select id from client_services`)).rows.length === 0);
  ok("developer sees all activity history incl. internal", (await q(`select id from activity_log`)).rows.length === 3);
  let pb = false; try { await q(`insert into packages(service_id,name,price_monthly) values ('${svc}','Dev',1)`); } catch { pb = true; }
  ok("developer cannot create packages", pb);
  let b = false; try { await q(`insert into social_posts(client_id,caption) values ('${clA}','x')`); } catch { b = true; }
  ok("developer without social access cannot create posts", b);
  await q(`insert into work_items(client_id,title) values ('${clA}','dev task')`);
  ok("developer can add work items", true);
  b = false; try { await q(`insert into clients(business_name) values ('x')`); } catch { b = true; }
  ok("developer cannot create clients", b);
});
await as(devSocial, async () => {
  await q(`insert into social_posts(client_id,caption,status) values ('${clA}','by social dev','awaiting_approval')`);
  ok("developer WITH social access can create posts", true);
});

// --- manager / admin ---
await as(mgr, async () => {
  ok("manager can NOT see invoices (finance is admin-only)", (await q(`select id from invoices`)).rows.length === 0);
  let mi = false; try { await q(`insert into invoices(client_id,period_label,amount) values ('${clA}','x',1)`); } catch { mi = true; }
  ok("manager cannot create invoices", mi);
  const md = await q(`delete from invoices where client_id='${clA}'`);
  ok("manager cannot delete invoices", (md.affectedRows ?? md.rowCount ?? 0) === 0);
  await q(`insert into clients(business_name) values ('M client')`);
  ok("manager can create clients", true);
  await q(`insert into packages(service_id,name,price_monthly) values ('${svc}','Pro',500)`);
  ok("manager can create packages", true);
  await q(`insert into services(name) values ('New service')`);
  ok("manager can create services", true);
  await q(`insert into activity_log(client_id,action,detail,client_visible) values ('${clA}','post_approved','Approved: reel',true)`);
  ok("staff can write activity history", true);
  const r = await q(`update social_posts set status='approved' where caption='A awaiting'`);
  ok("manager can approve posts", r.affectedRows === 1);
  let b = false; try { await q(`update profiles set role='admin' where id='${mgr}'`); } catch { b = true; }
  ok("manager cannot promote self", b);
});
await as(admin, async () => {
  await q(`update profiles set can_manage_social=true where id='${dev}'`);
  ok("admin can change access flags", true);
  ok("admin sees all profiles", (await q(`select id from profiles`)).rows.length >= 8);
  ok("admin sees all invoices incl. drafts", (await q(`select id from invoices`)).rows.length === 3);
  await q(`insert into invoices(client_id,period_label,amount) values ('${clB}','Del',5)`);
  const ad = await q(`delete from invoices where period_label='Del'`);
  ok("admin can delete an invoice", (ad.affectedRows ?? ad.rowCount) === 1 && (await q(`select id from invoices`)).rows.length === 3);
});


// =================== PHASE 2 ===================
const sm = await id("social@a.com"), mk = await id("market@a.com"), ds = await id("design@a.com");
await set(sm, "social_manager", null); await set(mk, "marketing", null); await set(ds, "designer", null);

// ---- client sees only non-draft own invoices
await as(cA, async () => {
  const inv = (await q(`select period_label from invoices`)).rows;
  ok("client sees own invoice but not drafts", inv.length === 1 && inv[0].period_label === "Nov");
});

// ---- new roles: staff but not lead
await as(mk, async () => {
  ok("marketing is staff (sees clients)", (await q(`select id from clients`)).rows.length >= 2);
  ok("marketing cannot see invoices", (await q(`select id from invoices`)).rows.length === 0);
  ok("marketing cannot see subscription prices", (await q(`select id from client_services`)).rows.length === 0);
  let b = false; try { await q(`insert into clients(business_name) values ('x')`); } catch { b = true; }
  ok("marketing cannot create clients", b);
});

// ---- post approval guard (closes self-approval through the API)
let postId;
await as(sm, async () => {
  postId = (await q(`insert into social_posts(client_id,caption,status) values ('${clA}','sm post','awaiting_approval') returning id`)).rows[0].id;
  ok("social manager can create a post for approval", !!postId);
  let b = false; try { await q(`insert into social_posts(client_id,caption,status) values ('${clA}','sneaky','approved')`); } catch { b = true; }
  ok("social manager cannot insert an already-approved post", b);
  b = false; try { await q(`update social_posts set status='approved' where id='${postId}'`); } catch { b = true; }
  ok("social manager cannot approve their own post", b);
  b = false; try { await q(`update social_posts set status='posted' where id='${postId}'`); } catch { b = true; }
  ok("cannot jump a post straight to posted", b);
});
await as(devSocial, async () => {
  let b = false; try { await q(`update social_posts set status='approved' where id='${postId}'`); } catch { b = true; }
  ok("developer with social access cannot self-approve", b);
});
await as(mgr, async () => {
  await q(`update social_posts set status='approved' where id='${postId}'`);
  ok("manager can approve", true);
});
await as(sm, async () => {
  await q(`update social_posts set status='posted' where id='${postId}'`);
  ok("social manager can mark an approved post as posted", true);
});

// ---- projects and milestones
await as(ds, async () => {
  const pA = (await q(`insert into projects(client_id,title,visible_to_client) values ('${clA}','A site',true) returning id`)).rows[0].id;
  await q(`insert into projects(client_id,title,visible_to_client) values ('${clA}','A internal',false)`);
  await q(`insert into projects(client_id,title,visible_to_client) values ('${clB}','B site',true)`);
  await q(`insert into milestones(project_id,title,done) values ('${pA}','Wireframes',true),('${pA}','Build',false)`);
  ok("staff (designer) can create projects and milestones", true);
});
await as(cA, async () => {
  const p = (await q(`select title from projects`)).rows;
  ok("client sees only own visible projects", p.length === 1 && p[0].title === "A site");
  ok("client sees milestones of own visible project", (await q(`select id from milestones`)).rows.length === 2);
  let b = false; try { await q(`insert into projects(client_id,title) values ('${clA}','hack')`); } catch { b = true; }
  ok("client cannot create projects", b);
  b = false; const r = await q(`update milestones set done=true`); b = r.affectedRows === 0;
  ok("client cannot tick milestones", b);
});

// ---- documents and contracts
let ctrSent, ctrDraft, ctrB;
await as(mgr, async () => {
  ctrSent = (await q(`insert into documents(client_id,kind,title,storage_path,status,visible_to_client) values ('${clA}','contract','Service agreement','a/1.pdf','sent',true) returning id`)).rows[0].id;
  ctrDraft = (await q(`insert into documents(client_id,kind,title,storage_path,status,visible_to_client) values ('${clA}','contract','Draft contract','a/2.pdf','draft',false) returning id`)).rows[0].id;
  ctrB = (await q(`insert into documents(client_id,kind,title,storage_path,status,visible_to_client) values ('${clB}','contract','B contract','b/1.pdf','sent',true) returning id`)).rows[0].id;
  ok("manager can create contracts", true);
});
await as(ds, async () => {
  await q(`insert into documents(client_id,kind,title,storage_path,visible_to_client) values ('${clA}','asset','Logo pack','a/logo.zip',true)`);
  ok("designer can upload assets", true);
  let b = false; try { await q(`insert into documents(client_id,kind,title,storage_path) values ('${clA}','contract','x','a/x.pdf')`); } catch { b = true; }
  ok("designer cannot create contracts", b);
});
await as(cA, async () => {
  const d = (await q(`select title from documents order by title`)).rows.map(r => r.title);
  ok("client sees only own visible documents (no drafts, no other client)", d.length === 2 && d.includes("Service agreement") && d.includes("Logo pack"));
  let b = false; try { await q(`insert into documents(client_id,kind,title,storage_path) values ('${clA}','asset','x','x')`); } catch { b = true; }
  ok("client cannot upload documents", b);
  b = false; let r = await q(`update documents set status='signed' where id='${ctrSent}'`); b = r.affectedRows === 0;
  ok("client cannot edit a contract row directly", b);
  b = false; try { await q(`select sign_document('${ctrB}','Hacker Name')`); } catch { b = true; }
  ok("client cannot sign another client's contract", b);
  b = false; try { await q(`select sign_document('${ctrDraft}','Alice A')`); } catch { b = true; }
  ok("client cannot sign a draft contract", b);
  b = false; try { await q(`select sign_document('${ctrSent}','A')`); } catch { b = true; }
  ok("signing needs a real name", b);
  await q(`select sign_document('${ctrSent}','Alice Anderson')`);
  const s2 = (await q(`select status, signed_by_name from documents where id='${ctrSent}'`)).rows[0];
  ok("client can accept their own sent contract", s2.status === "signed" && s2.signed_by_name === "Alice Anderson");
  const h = (await q(`select detail from activity_log where detail like 'Contract accepted%'`)).rows;
  ok("acceptance is recorded in the client-visible history", h.length === 1);
  b = false; try { await q(`select sign_document('${ctrSent}','Alice Anderson')`); } catch { b = true; }
  ok("a signed contract cannot be signed twice", b);
});

// ---- chat
await as(cA, async () => {
  await q(`insert into messages(client_id,sender_id,body) values ('${clA}','${cA}','Hello team')`);
  ok("client can message their own thread", true);
  let b = false; try { await q(`insert into messages(client_id,sender_id,body) values ('${clB}','${cA}','sneak')`); } catch { b = true; }
  ok("client cannot post into another client's thread", b);
  b = false; try { await q(`insert into messages(client_id,sender_id,body) values (null,'${cA}','into team channel')`); } catch { b = true; }
  ok("client cannot post to the team channel", b);
  b = false; try { await q(`insert into messages(client_id,sender_id,body) values ('${clA}','${admin}','impersonation')`); } catch { b = true; }
  ok("client cannot send as someone else", b);
});
await as(dev, async () => {
  await q(`insert into messages(client_id,sender_id,body) values ('${clA}','${dev}','Hi, how can we help?')`);
  await q(`insert into messages(client_id,sender_id,body) values (null,'${dev}','internal: client A is slow to pay')`);
  ok("staff can message client threads and the team channel", true);
  ok("staff see all messages", (await q(`select id from messages`)).rows.length === 3);
});
await as(cA, async () => {
  const t = (await q(`select sender_name, body from chat_thread('${clA}')`)).rows;
  ok("client reads own thread with sender names", t.length === 2 && t.some(r => r.sender_name === "developer"));
  ok("client cannot read another client's thread", (await q(`select * from chat_thread('${clB}')`)).rows.length === 0);
  ok("client cannot read the team channel", (await q(`select * from chat_thread(null)`)).rows.length === 0);
  ok("client cannot select team messages directly", (await q(`select id from messages where client_id is null`)).rows.length === 0);
});
await as(cB, async () => {
  ok("other client sees none of A's messages", (await q(`select id from messages`)).rows.length === 0);
});

// ---- AI history
await as(cA, async () => {
  await q(`insert into ai_messages(role,content) values ('user','hi')`);
  ok("user can store their AI messages", (await q(`select id from ai_messages`)).rows.length === 1);
  let b = false; try { await q(`insert into ai_messages(user_id,role,content) values ('${cB}','user','spoof')`); } catch { b = true; }
  ok("user cannot write AI messages for someone else", b);
});
await as(cB, async () => {
  ok("AI history is private per user", (await q(`select id from ai_messages`)).rows.length === 0);
});

// ---- pay and expenses
await q(`insert into pay_records(staff_id,period_label,amount,kind) values ($1,'Oct 2026',1200,'salary'),($2,'Oct 2026',900,'salary')`, [dev, sm]);
await as(dev, async () => {
  const r = (await q(`select amount from pay_records`)).rows;
  ok("worker sees only their own pay", r.length === 1 && Number(r[0].amount) === 1200);
  let b = false; try { await q(`insert into pay_records(staff_id,period_label,amount) values ('${dev}','x',99999)`); } catch { b = true; }
  ok("worker cannot give themselves pay", b);
  b = false; const u = await q(`update pay_records set amount=99999`); b = u.affectedRows === 0;
  ok("worker cannot edit pay", b);
  ok("worker cannot see expenses", (await q(`select id from expenses`)).rows.length === 0);
});
await as(mgr, async () => {
  ok("manager sees only their own pay (not company payroll)", (await q(`select id from pay_records`)).rows.length === 0);
  let b = false; try { await q(`insert into expenses(title,amount) values ('x',1)`); } catch { b = true; }
  ok("manager cannot add expenses", b);
});
await as(cA, async () => {
  ok("client sees no pay records", (await q(`select id from pay_records`)).rows.length === 0);
});
await as(admin, async () => {
  ok("admin sees all pay records", (await q(`select id from pay_records`)).rows.length === 2);
  await q(`insert into expenses(title,category,amount) values ('Software','tools',49.99)`);
  ok("admin can record expenses", (await q(`select id from expenses`)).rows.length === 1);
  await q(`update pay_records set status='paid', paid_at=current_date where staff_id='${dev}'`);
  ok("admin can mark pay as paid", true);
  ok("admin reads all documents", (await q(`select id from documents`)).rows.length === 4);
});

// =================== CURRENCIES ===================
await as(admin, async () => {
  await q(`insert into fx_rates(currency,gbp_per_unit,source) values ('INR',0.0095,'manual') on conflict (currency) do update set gbp_per_unit = excluded.gbp_per_unit`);
  ok("admin can manage exchange rates", (await q(`select currency from fx_rates`)).rows.length === 2);
  let b = false; try { await q(`insert into fx_rates(currency,gbp_per_unit) values ('USD',0)`); } catch { b = true; }
  ok("a zero exchange rate is rejected", b);
  b = false; try { await q(`insert into fx_rates(currency,gbp_per_unit) values ('usd',1.2)`); } catch { b = true; }
  ok("currency codes must be 3 capital letters", b);
  await q(`update clients set currency='INR' where id='${clB}'`);
  ok("admin can set a client's currency", (await q(`select currency from clients where id='${clB}'`)).rows[0].currency === "INR");
});
for (const [name, uid] of [["manager", mgr], ["developer", dev], ["client", cA]]) {
  await as(uid, async () => {
    ok(`${name} cannot read exchange rates`, (await q(`select currency from fx_rates`)).rows.length === 0);
    let b = false; try { await q(`insert into fx_rates(currency,gbp_per_unit) values ('EUR',0.85)`); } catch { b = true; }
    ok(`${name} cannot write exchange rates`, b);
  });
}
await as(mgr, async () => {
  await q(`update packages set prices = '{"INR": 30000, "USD": 380}'::jsonb where name = 'Growth'`);
  const g = (await q(`select prices from packages where name = 'Growth'`)).rows[0].prices;
  ok("manager can set per-currency package prices", g.INR === 30000 && g.USD === 380);
  let b = false; try { await q(`update clients set currency='rupees' where id='${clA}'`); } catch { b = true; }
  ok("a client currency must be a 3-letter code", b);
});
await as(cA, async () => {
  const p = (await q(`select prices from packages where name = 'Growth'`)).rows[0];
  ok("clients can read package prices in their currency", p.prices.INR === 30000);
});

// =================== PAYMENT PLANS & BILLING ===================
const day = (offset) => `(current_date + (${offset}))::date`;
await as(admin, async () => {
  // ---- terms constraints
  let b = false; try { await q(`update clients set payment_terms_days = -1 where id='${clA}'`); } catch { b = true; }
  ok("payment terms cannot be negative", b);
  b = false; try { await q(`update clients set late_interest_percent = 60 where id='${clA}'`); } catch { b = true; }
  ok("late interest is capped (50% a month)", b);
  await q(`update clients set payment_terms_days = 10, late_grace_days = 3, late_interest_percent = 2 where id='${clA}'`);
  const t = (await q(`select payment_terms_days d, late_grace_days g, late_interest_percent p from clients where id='${clA}'`)).rows[0];
  ok("admin can save a client's payment terms", t.d === 10 && t.g === 3 && Number(t.p) === 2);
  b = false; try { await q(`insert into payment_plans(client_id,title,kind,currency) values ('${clA}','bad','recurring','GBP')`); } catch { b = true; }
  ok("a recurring plan must have an amount, interval and start date", b);
  b = false; try { await q(`insert into payment_plans(client_id,title,kind,currency,total_amount,recurring_amount) values ('${clA}','bad','one_time','GBP',100,50)`); } catch { b = true; }
  ok("a one-time plan cannot also carry a recurring amount", b);

  // ---- date helpers
  const m = (await q(`select to_char(_next_period('2026-01-31','monthly',1),'YYYY-MM-DD') a, to_char(_next_period('2026-01-31','monthly',2),'YYYY-MM-DD') b, to_char(_next_period('2026-01-15','quarterly',1),'YYYY-MM-DD') c, to_char(_next_period('2026-03-01','yearly',2),'YYYY-MM-DD') d`)).rows[0];
  ok("month-end billing does not drift (31 Jan, 28 Feb, 31 Mar)", m.a === "2026-02-28" && m.b === "2026-03-31");
  ok("quarterly and yearly steps", m.c === "2026-04-15" && m.d === "2028-03-01");
  const lab = (await q(`select _period_label('2026-11-05','monthly') a, _period_label('2026-11-05','quarterly') b, _period_label('2026-11-05','yearly') c`)).rows[0];
  ok("invoice period labels", lab.a === "November 2026" && lab.b === "Q4 2026" && lab.c === "2026");

  // ---- recurring: three missed months catch up once, never twice
  const rec = (await q(`insert into payment_plans(client_id,title,kind,currency,recurring_amount,billing_interval,start_date,next_invoice_date,auto_invoice)
     values ('${clA}','Retainer','recurring','GBP',300,'monthly', ${day("'-2 months'::interval")}, ${day("'-2 months'::interval")}, true) returning id`)).rows[0].id;
  const n1 = (await q(`select run_billing(false) n`)).rows[0].n;
  ok("billing run catches up 3 missed months for an automatic plan", n1 === 3);
  const inv = (await q(`select count(*)::int c, min(due_date)::text dmin, min(amount)::numeric a from invoices where plan_id='${rec}'`)).rows[0];
  ok("those 3 invoices exist with the plan's amount", inv.c === 3 && Number(inv.a) === 300);
  const n2 = (await q(`select run_billing(false) n`)).rows[0].n;
  ok("running billing again creates nothing (no duplicates)", n2 === 0);
  const pl = (await q(`select periods_billed pb, to_char(next_invoice_date,'YYYY-MM-DD') nx from payment_plans where id='${rec}'`)).rows[0];
  ok("the plan moves on to next month", pl.pb === 3);
  const dues = (await q(`select due_date >= current_date as ok from invoices where plan_id='${rec}'`)).rows;
  ok("invoice due dates are never in the past (terms start from today)", dues.every((r) => r.ok));
  const lg = (await q(`select count(*)::int c from activity_log where client_id='${clA}' and action='invoice_issued' and client_visible`)).rows[0].c;
  ok("each issued invoice is recorded in the client's history", lg >= 3);

  // ---- manual plans only run when asked
  const man = (await q(`insert into payment_plans(client_id,title,kind,currency,recurring_amount,billing_interval,start_date,next_invoice_date,auto_invoice)
     values ('${clA}','Hosting','recurring','GBP',20,'monthly', ${day("'0 days'::interval")}, ${day("'0 days'::interval")}, false) returning id`)).rows[0].id;
  ok("a non-automatic plan is skipped by the daily job", (await q(`select run_billing(false) n`)).rows[0].n === 0);
  ok("but the admin's 'create invoices now' includes it", (await q(`select run_billing(true) n`)).rows[0].n === 1);

  // ---- end date completes a plan
  const ending = (await q(`insert into payment_plans(client_id,title,kind,currency,recurring_amount,billing_interval,start_date,next_invoice_date,end_date,auto_invoice)
     values ('${clA}','Short deal','recurring','GBP',50,'monthly', ${day("'-1 months'::interval")}, ${day("'-1 months'::interval")}, ${day("'0 days'::interval")}, true) returning id`)).rows[0].id;
  await q(`select run_billing(false)`);
  const e = (await q(`select status::text s, (select count(*)::int from invoices where plan_id='${ending}') c from payment_plans where id='${ending}'`)).rows[0];
  ok("a plan that reaches its end date is marked completed", e.s === "completed" && e.c === 2);

  // ---- paused plans are not billed
  const paused = (await q(`insert into payment_plans(client_id,title,kind,currency,recurring_amount,billing_interval,start_date,next_invoice_date,auto_invoice,status)
     values ('${clA}','On hold','recurring','GBP',75,'monthly', ${day("'-1 months'::interval")}, ${day("'-1 months'::interval")}, true, 'paused') returning id`)).rows[0].id;
  await q(`select run_billing(true)`);
  ok("a paused plan creates no invoices", (await q(`select count(*)::int c from invoices where plan_id='${paused}'`)).rows[0].c === 0);

  // ---- one-time plan: advance now, final on delivery
  const one = (await q(`insert into payment_plans(client_id,title,kind,currency,total_amount) values ('${clA}','Website build','one_time','GBP',1000) returning id`)).rows[0].id;
  await q(`insert into plan_installments(plan_id,label,percent,amount,due_date,sort_order) values ('${one}','Advance',50,500,current_date,1)`);
  const fin = (await q(`insert into plan_installments(plan_id,label,percent,amount,due_date,sort_order) values ('${one}','Final',50,500,null,2) returning id`)).rows[0].id;
  ok("the advance is invoiced by the billing run, the undated final is not", (await q(`select run_billing(true) n`)).rows[0].n === 1);
  const adv = (await q(`select i.amount::numeric a, i.due_date = current_date as due_today from plan_installments p join invoices i on i.id = p.invoice_id where p.plan_id='${one}' and p.label='Advance'`)).rows[0];
  ok("the advance invoice is for half and due on its date", Number(adv.a) === 500 && adv.due_today);
  const finInv = (await q(`select invoice_installment('${fin}') id`)).rows[0].id;
  const fi = (await q(`select amount::numeric a, (due_date - current_date)::int d from invoices where id='${finInv}'`)).rows[0];
  ok("'invoice now' issues the final using the client's payment terms (10 days)", Number(fi.a) === 500 && fi.d === 10);
  b = false; try { await q(`select invoice_installment('${fin}')`); } catch { b = true; }
  ok("an installment cannot be invoiced twice", b);

  // dated final: issued only within 7 days of its due date
  const two = (await q(`insert into payment_plans(client_id,title,kind,currency,total_amount) values ('${clA}','App build','one_time','GBP',600) returning id`)).rows[0].id;
  await q(`insert into plan_installments(plan_id,label,percent,amount,due_date,sort_order) values ('${two}','Stage 1',50,300,${day("'30 days'::interval")},1),('${two}','Stage 2',50,300,${day("'5 days'::interval")},2)`);
  ok("only the installment due within 7 days is issued", (await q(`select run_billing(true) n`)).rows[0].n === 1);
  ok("the one 30 days away waits", (await q(`select count(*)::int c from plan_installments where plan_id='${two}' and invoice_id is null`)).rows[0].c === 1);

  // recurring: invoice the next period now
  const nowPlan = (await q(`insert into payment_plans(client_id,title,kind,currency,recurring_amount,billing_interval,start_date,next_invoice_date) values ('${clA}','Maintenance','recurring','GBP',40,'monthly',${day("'20 days'::interval")},${day("'20 days'::interval")}) returning id`)).rows[0].id;
  await q(`select invoice_recurring_now('${nowPlan}')`);
  const np = (await q(`select periods_billed pb from payment_plans where id='${nowPlan}'`)).rows[0];
  ok("'create next invoice now' works ahead of schedule and advances the plan", np.pb === 1);

  ok("admin sees all plans", (await q(`select id from payment_plans`)).rows.length >= 6);
});

// ---- who can run billing or see plans
await q(`insert into payment_plans(client_id,title,kind,currency,total_amount) values ('${clB}','B project','one_time','GBP',900)`);
for (const [name, uid] of [["manager", mgr], ["developer", dev], ["marketing", mk]]) {
  await as(uid, async () => {
    ok(`${name} cannot see payment plans`, (await q(`select id from payment_plans`)).rows.length === 0);
    ok(`${name} cannot see installments`, (await q(`select id from plan_installments`)).rows.length === 0);
    let b = false; try { await q(`select run_billing(true)`); } catch { b = true; }
    ok(`${name} cannot run billing`, b);
    b = false; try { await q(`insert into payment_plans(client_id,title,kind,currency,total_amount) values ('${clA}','x','one_time','GBP',1)`); } catch { b = true; }
    ok(`${name} cannot create plans`, b);
  });
}
await as(cA, async () => {
  const p = (await q(`select title from payment_plans`)).rows.map((r) => r.title);
  ok("a client sees only their own payment plans", p.length > 0 && !p.includes("B project"));
  ok("a client sees their installments", (await q(`select id from plan_installments`)).rows.length > 0);
  let b = false; try { await q(`select run_billing(true)`); } catch { b = true; }
  ok("a client cannot run billing", b);
  b = false; try { await q(`select invoice_installment((select id from plan_installments limit 1))`); } catch { b = true; }
  ok("a client cannot issue an invoice", b);
  b = false; const u = await q(`update payment_plans set status='cancelled'`); b = u.affectedRows === 0;
  ok("a client cannot change a plan", b);
  const iv = (await q(`select plan_id from invoices where plan_id is not null`)).rows;
  ok("a client sees the invoices their plans created", iv.length > 0);
});
await as(cB, async () => {
  ok("another client sees only their own plan", (await q(`select title from payment_plans`)).rows.map((r) => r.title).join() === "B project");
});

// =================== INVOICE DOCUMENTS ===================
await as(admin, async () => {
  const nums = (await q(`select invoice_no n from invoices order by invoice_no`)).rows.map((r) => r.n);
  ok("every invoice has a number", nums.length > 0 && nums.every((n) => Number.isInteger(n) && n > 0));
  ok("invoice numbers are unique", new Set(nums).size === nums.length);
  const a = (await q(`insert into invoices(client_id,period_label,amount) values ('${clA}','num test 1',1) returning invoice_no n`)).rows[0].n;
  const b = (await q(`insert into invoices(client_id,period_label,amount) values ('${clA}','num test 2',1) returning invoice_no n`)).rows[0].n;
  ok("new invoices get the next number automatically", b === a + 1 && a > Math.max(...nums));
  let dup = false; try { await q(`update invoices set invoice_no = ${a} where invoice_no = ${b}`); } catch { dup = true; }
  ok("two invoices can never share a number", dup);

  await q(`update company_settings set legal_name='Anweo Ltd', payment_details='Bank: Example Bank, Sort 00-00-00, Acc 12345678', tax_number='GB123456789' where id = 1`);
  ok("admin can edit the company details", (await q(`select legal_name from company_settings`)).rows[0].legal_name === "Anweo Ltd");
  let b2 = false; try { await q(`insert into company_settings(id) values (2)`); } catch { b2 = true; }
  ok("there can only ever be one company settings row", b2);
  await q(`update clients set address='12 High Street, Kochi', tax_id='GSTIN-TEST-1' where id='${clA}'`);
  ok("client address and tax number can be saved", (await q(`select address from clients where id='${clA}'`)).rows[0].address.includes("Kochi"));
});
for (const [name, uid] of [["client", cA], ["developer", dev], ["manager", mgr]]) {
  await as(uid, async () => {
    const r = (await q(`select legal_name, payment_details from company_settings`)).rows;
    ok(`${name} can read the company details printed on invoices`, r.length === 1 && r[0].legal_name === "Anweo Ltd" && r[0].payment_details.includes("Bank"));
    let w = false; const u = await q(`update company_settings set legal_name='Hacked'`); w = u.affectedRows === 0;
    ok(`${name} cannot change the company details`, w);
  });
}
await as(rando, async () => {
  ok("a pending (not yet active) user cannot read company details", (await q(`select id from company_settings`)).rows.length === 0);
});
await as(cA, async () => {
  const inv = (await q(`select invoice_no from invoices`)).rows;
  ok("a client's invoices carry their numbers", inv.length > 0 && inv.every((r) => r.invoice_no > 0));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
