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
- **Finance (admin only):** monthly recurring revenue, pending client payments, expenses, payroll, and net for the month.
- **My pay:** every team member sees only their own pay.

**For clients**
Their plan and monthly total, projects with progress, work, upcoming and published content, contracts to accept, documents, billing history, a live history timeline, chat with the team, and Anweo AI.

## Currencies
Clients and staff are in different countries, so money is handled per person, never mixed.
- **Each client has a billing currency.** Picking their country suggests one (India: INR, UK: GBP, UAE: AED, US: USD, euro countries: EUR, and more). You can change it. Services and invoices for that client default to it.
- **Packages can have a price in every currency you sell in** (for example £300 / ₹30,000 / $380). Adding the package to a client uses that client's own currency price. If a package has no price in their currency, its main price is used and the screen tells you.
- **Each team member has a pay currency.** Payroll defaults to it.
- **Rupees show with Indian number formatting** (for example ₹12,34,567).
- **Finance shows each currency as it really is**, plus an estimate "in pounds" using the exchange rates on the Finance page (admin only). Rates can be typed in by hand or refreshed from live market rates. A currency with no rate is left out of the estimate and the page says so.
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
1. Create a Supabase project and run the SQL files in `supabase/migrations/` **in order**: 0001 to 0006. Run 0003 on its own (it adds new role names).
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
| `ANTHROPIC_API_KEY` | Switches on Anweo AI | **Yes** |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-5-5` | No |

Never prefix the secret ones with `NEXT_PUBLIC_`. Without `ANTHROPIC_API_KEY` everything works except Anweo AI, which shows a friendly "not switched on yet" message.

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
- 108 automated database checks and 17 currency checks cover all of this. Run them with `npm test`, and always after changing a migration.

## Branding
Colours are in `tailwind.config.ts` (forest `#0E5A44`, lime `#C9F25A`, ink `#141413`, paper `#F4F3EF`).
