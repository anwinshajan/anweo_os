# Anweo OS — Phase 1

Login system, role-based dashboards, service selection and client portal.
Next.js 14 + Supabase. Installable on Android and iPhone as a web app (PWA).

## What's inside
- **Brand:** built from the Anweo brand sheet: forest green `#0E5A44`, lime `#C9F25A`, ink, off-white, rounded-square logo.
- **Clients:** search, add, see services, work, content and billing at a glance.
- **Services & packages:** managers create services and packages with prices and feature lists. Picking a package fills in the price.
- **Approvals:** content queue with approve / reject / mark as posted.
- **Client portal:** plan and monthly total, next post, work progress, upcoming and published content, billing, and a history timeline.
- **History is private by default:** clients only see events deliberately marked client-visible.
- **Installable:** works as an app on Android and iPhone.

## Roles
| Role | Can do |
|---|---|
| **Admin / Founder** | Everything, including creating and disabling logins |
| **Manager** | Clients, services and prices, billing, approvals |
| **Developer** | See clients and work, add tasks. Cannot see prices or invoices. Can create posts only if an admin enables "social access" |
| **Client** | Sees only their own services, upcoming posts, work, posted history and billing |

New sign-ups can never become admin. Accounts are created by an admin under **Team**.

## Setup (about 10 minutes)
The Supabase project `anweo-os` (London) is already created and the database is loaded.
1. Copy `.env.example` to `.env.local`. The URL and public key are filled in. Paste the **secret key** from Supabase → Project Settings → API Keys.
2. In Supabase → **Authentication → Sign In / Providers → Email**, turn **off** "Allow new users to sign up" so nobody can self-register.
3. Create your own login: **Authentication → Users → Add user** (tick auto-confirm), then run this once in the **SQL editor**, using your email:

```sql
update public.profiles
set role = 'admin', status = 'active', full_name = 'Anwin Shajan'
where email = 'YOUR-EMAIL';
```
4. `npm install` then `npm run dev`, open http://localhost:3000 and sign in.
5. Under **Team**, create logins for your manager, developers and clients. Under **Clients**, add a client and pick their services.

## Deploy
Push to GitHub, import into Vercel, and add the three environment variables.
Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser; it is only read in server code.

## Install on phones
- **Android:** open the site in Chrome → menu → *Install app* (a PWA; an APK wrapper can be added later).
- **iPhone:** open in Safari → Share → *Add to Home Screen*.

## Branding
All colours live in `tailwind.config.ts`. Replace the `brand`, `gold`, `ink` values with the Anweo brand sheet and the whole app updates.

## Posting
Phase 1 is semi-manual: staff create content, a manager approves, then someone posts and taps **Mark as posted**. The client sees the status live.

## Tests
The database rules were verified with 39 automated checks (client isolation, private history, no privilege escalation, developer and package limits). Run the SQL in `supabase/migrations/` in order: 0001, then 0002.
