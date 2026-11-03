# Anweo OS

Client portal and team workspace for Anweo. Next.js 16 + Supabase. Installs as an app on Android and iPhone.

## What's inside
**For the team**
- **Clients:** add, edit, search and archive clients. Each client has tabs for Overview, Projects, Documents, Work & content, and Billing (admin only).
- **Services & packages:** managers create packages with prices and features. Picking a package fills in the price.
- **Projects & milestones:** progress bars the client can see.
- **Documents & contracts:** private file storage. Share a contract and the client can read it and accept it with their name (recorded with a timestamp).
- **Tasks:** assign work to people. Everyone has a "My tasks" page.
- **Content approvals:** social media managers draft, a manager or admin approves, then it is marked as posted.
- **Chat:** one thread per client (the whole team can reply), a staff-only team channel, and **Anweo AI**.
- **Finance (admin only):** monthly recurring revenue, pending client payments, expenses, payroll, and net for the month, with each currency kept separate.
- **My pay:** every team member sees only their own pay.

**For clients**
Their plan and monthly total, projects with progress, work, upcoming and published content, contracts to accept, documents, billing history, a live history timeline, chat with the team, and Anweo AI.

## Payments and billing (admin only)
Open a client, then the **Billing** tab.
- **Payment terms per client:** pay within N days, a grace period, and a weekly late fee (a percent of the unpaid amount). The client can see these terms.
- **One-time payment:** a total split into up to four payments, for example 50% advance + 50% final. Give a payment a date and it is invoiced automatically 7 days before it is due (an advance due today is invoiced straight away). Leave the date blank to invoice it by hand later, for example on delivery, with **Invoice now**.
- **Recurring payment:** monthly, quarterly or yearly, with an optional end date. With "create invoices automatically" on, the invoice is created on its date. With it off, it waits under **Finance, Ready to invoice** for you to create. You can also create the next invoice early from the plan.
- **Late fee:** after the grace period, every full week an invoice stays unpaid adds the agreed percent of the unpaid amount (flat, not compounded). It is shown on each overdue invoice and you choose whether to charge it. Charging creates a separate invoice and records what has been charged, so the same interest is never charged twice.
- **Finance** shows overdue invoices by their real due date, interest not yet charged, and the queue of invoices ready to create.
- **Daily job:** every morning at 06:00 UTC `/api/cron/billing` creates the invoices that are due from automatic plans. It is protected by `CRON_SECRET` and is safe to run twice because nothing is ever created twice.
- Check the terms against your contract. Interest on business debts can also be governed by law where you operate.

## Currencies
Clients and staff are in different countries, so money is handled per person and **never converted or added across currencies**.
- **Each client has a billing currency.** Picking their country suggests one (India: INR, UK: GBP, UAE: AED, US: USD, euro countries: EUR, and more). You can change it. Services and invoices for that client default to it, and the client sees everything in it.
- **Packages can have a price in every currency you sell in** (for example £300 / ₹30,000 / $380). Adding the package to a client uses that client's own currency price. If a package has no price in their currency, its main price is used and the screen tells you.
- **Each team member has a pay currency.** Payroll defaults to it.
- **Totals keep every currency on its own line.** Pounds and rupees are never combined, so there are no exchange rates to maintain.
- **Rupees show with Indian number formatting** (for example ₹12,34,567).
- Supported: GBP, INR, USD, EUR, AED, SAR, QAR, CAD, AUD, SGD. Add more in `src/lib/currency.ts`.

## Roles
| Role | Access |
|---|---|
| **Admin / Founder** | Everything, including Finance, payroll and creating logins |
| **Manager** | Clients, services and packages, projects, contracts, approvals. No invoices, finance or payroll |
| **Social media manager** | Creates posts, marks approved posts as posted. Cannot approve |
| **Developer, Designer, Marketing** | See clients, work on tasks and projects, upload assets, chat. No prices, invoices or finance |
| **Client** | Only their own business, and only what the team has shared |

Everyone can see their own pay on **My pay**. Nobody except the admin can see anyone else's.

## Setup
1. Create a Supabase project and run the SQL files in `supabase/migrations/` **in order**: 0001 to 0014. Run 0003 on its own (it adds new role names).
2. Supabase → Authentication → Sign In / Providers: enable Email, and turn **off** "Allow new users to sign up".
3. Copy `.env.example` to `.env.local` and fill it in (see below).
4. Create your own login in Supabase (Authentication → Users → Add user, tick auto-confirm), then run once in the SQL editor:
```sql
update public.profiles set role = 'admin', status = 'active', full_name = 'Your Name' where email = 'YOUR-EMAIL';
```
5. `npm install`, then `npm run dev`. On Windows PowerShell use `npm.cmd`.

## Environment variables
| Name | What for | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Creating logins and private file access | **Yes** |
| `AI_BASE_URL` | Your AI router's OpenAI-compatible base URL (the app calls `<base>/chat/completions`) | For Anweo AI |
| `AI_API_KEY` | Your router API key | For Anweo AI |
| `AI_MODEL` | The model ID to use | For Anweo AI |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notifications (generate with `npx web-push generate-vapid-keys`) | For push |
| `ANTHROPIC_API_KEY` | Optional alternative: Anthropic directly, if the three above are not set | No |
| `CRON_SECRET` | Lets only Vercel's daily job run billing. Any long random string | **Yes** |

Never prefix the secret ones with `NEXT_PUBLIC_`. Without the AI variables everything works except Anweo AI, which shows a friendly "not switched on yet" message.

## Deploy
Push to GitHub and import into Vercel. Add the variables above under Settings → Environment Variables. Mark the two secrets as **Sensitive**, then redeploy.

## Install on phones
- **Android:** open the site in Chrome, menu, **Install app**.
- **iPhone:** open in Safari, Share, **Add to Home Screen**.

## Security notes
- Row-level security is on for every table. Clients can only ever read their own data, and a contract can only be accepted by the client it belongs to.
- Invoices, expenses and payroll are visible to the admin only. Clients see their own non-draft invoices.
- Approving a post cannot be done by anyone below manager, even by calling the API directly.
- Files are in a private bucket. The server checks the database permission first, then hands out a 60-second link.
- Anweo AI reads data with the signed-in person's own access, so it can never see more than they can. It is rate limited to 30 questions an hour per person and cannot change anything.
- 229 database checks, 11 currency, 29 payment-maths and 10 invoice checks cover all of this. Run them with `npm test`, and always after changing a migration.

## Branding
Colours are in `tailwind.config.ts` (forest `#0E5A44`, lime `#C9F25A`, ink `#141413`, paper `#F4F3EF`).

## Invoices

Every invoice has a branded page (`/invoices/<id>`, print-ready A4) and a PDF download in the Anweo template: logo, billed-to / from, dates, amount due, how to pay, payment terms. The admin sets the company name, address, tax number and bank/UPI details under **Settings**, and each client's billing address and tax ID on their details tab. Invoice numbers (`ANW-0001`) are assigned automatically.

Limits: invoices show a tax number but do not calculate VAT/GST (add it into the amount if it applies), and in the PDF the rupee is shown as "INR 42,000.00" because the embedded font has no rupee glyph (the on-screen invoice shows ₹).

## Transactions (admin only)

`/transactions` lists every invoice, expense and team payment in one place, newest first, with money in, money out, net and still-to-collect per currency. Filter by type, status, currency, date or search text; edit, delete or mark paid on any row; add expenses and team payments; export what you see as CSV. Finance keeps the overview (overdue, ready to invoice, late fees).

## Smoothness and errors

Pages show a skeleton immediately while loading, forms lock their buttons while saving (no double submits), and every save shows a small confirmation. Server-side validation errors come back as a message toast instead of a broken page (production hides thrown messages, so actions return them).

## Pricing a project

When you create a project (Projects tab) the admin can enter a total price and an advance (none, 30, 50, 70 or 100 percent). The advance is invoiced straight away; the rest is invoiced automatically when the project is marked completed, and the client's payment window and weekly late fee then apply. Monthly services are priced in the Overview tab, where picking a package fills the price in.

## Notifications

Every event is saved in the in-app bell (`/notifications`) and, if the person turned it on, pushed to their device (Web Push: browsers, Android, and iPhone once the app is added to the home screen). Triggers: chat messages, tasks assigned, content waiting for approval / approved / changes requested, new invoices, payments received, invoices due in 2 days and overdue (daily job), documents shared, projects completed. The `notifications` table is the source of truth and `push_subscriptions.kind` already allows `fcm`, so the Android app only needs to register its token and a sender added in `src/lib/notify.ts`.

## Clock in / out

`/clock`: staff clock in and out with a live timer, today/this-week totals and recent shifts. One open shift per person, clock-in times can't be edited or back-dated, and a forgotten clock-out can be corrected with the real finish time. Managers and the admin see the team's hours; only the admin can delete an entry.

## Social studio

`/studio`: the social and creative team (social managers, marketing, designers) plan ideas, draft captions and hashtags, upload photos and videos (private storage), comment on each other's work and send it for review. A manager or the admin approves it (or asks for changes with a note). Clients only see content after it is approved, with its media; editing approved content sends it back for review automatically.

## Invoices

Invoices have a branded header, company seal, signature block and your terms and conditions (edit them under Settings).

## Paying from the app

Clients get a **Pay now** button on every unpaid invoice (their home page and the invoice page). Rupee invoices open a UPI payment link (Google Pay, PhonePe, Paytm…) with your UPI ID and the exact amount filled in, plus a QR code with the same details for scanning from another device. Every other currency opens WhatsApp with the message typed ("I need to finish the due… how should I pay my GBP to you?"). Set the UPI ID and WhatsApp number under Settings. Rupee invoices also print the QR code on the PDF. A client can tap **I've paid** (with an optional reference) which notifies the admin; the admin confirms and marks the invoice paid, because transfers can't be verified automatically.

## Support tickets

Clients raise tickets (something broken, a change request, a new service request, a billing question) from **Support**; the team triages them in **Tickets** (status, priority, who is handling it), replies, and can leave internal notes the client never sees. Both sides are notified of replies; a client can close or reopen their own ticket. Only the admin can delete a ticket.

## Project updates

Under each project the team posts short progress updates (for example "Homepage is ready for review"). The client sees them under the project on their dashboard and gets a notification.

## Search

The search icon in the header searches everything the signed-in person is allowed to see: staff find clients, projects, tickets, tasks and content; clients find their own projects, tickets, invoices and documents.

## Editing a client's history

The admin has a **History** tab on every client: the full timeline (automatic entries like "Invoice issued" and manual ones). Each entry can be reworded, re-dated, hidden from or shown to the client, or deleted, and new entries can be added (back-dated if needed). The client's dashboard shows exactly the entries marked "client sees".
