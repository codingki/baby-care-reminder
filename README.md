# Baby Care Reminder

A mobile-first PWA for families tracking diaper changes, feeds in millilitres, a chiller for milk and pump parts, and breast-pump reminders. This phase is the foundation: the app shell, installable PWA, Supabase magic-link sign-in, and the first database migration. Logging, invites, and web push are not wired up yet.

The interface is English and Bahasa Indonesia. Millilitres are the volume unit.

## Stack

- Next.js (App Router) and TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, and row-level security
- Vercel

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login). The other routes send you there until you are signed in.

In the Supabase dashboard for project `bhovselkwcedelwxpkfa`, add these redirect URLs:

- `http://localhost:3000/auth/callback`
- your Vercel URL plus `/auth/callback`

Magic links use the browser that requested them.

## Environment variables

`.env.example` lists the public client values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Both are safe in the browser. Do not add a service-role key, and never prefix one with `NEXT_PUBLIC_`. Phase 0 does not use the service role. That key bypasses row-level security.

## Language

Copy lives in `src/i18n/messages/en.ts` and `src/i18n/messages/id.ts`. The shell, login page, and the other screens use those files.

On a first visit the app follows `Accept-Language`. Indonesian (`id` or the legacy `in`) selects Bahasa Indonesia. Anything else, including an unsupported language, uses English.

Choosing a language in **Settings** stores `bcr_locale` for one year on this device. That cookie wins over the browser language. The same choice has a home in `member_settings.language` (`en` or `id`). Volume unit lives on `families.unit` and defaults to `ml`, with no check that forbids a later `oz`. The settings screen reads the cookie today. Writing the row waits until family membership exists.

## Database migration

The schema is `supabase/migrations/20261105180018_phase0_foundation.sql`, plus `supabase/migrations/20261105184540_family_unit_and_harmony_name.sql`. Neither file is applied to the hosted database by this repo. `/bottles` and `/bottles/[id]` redirect to `/chiller`. The follow-up moves `unit` onto `families` and renames the Medela seed from `Harmony (manual)` to `Harmony`.

Tables:

| Table | What it stores |
| --- | --- |
| `families` | A household, `pump_parts_wash_by_hours` (default 24, allowed 1–24), and `unit` (default `ml`, not limited to ml) |
| `family_members` | Users and roles: owner, caregiver, viewer |
| `babies` | Name, birth date, sex, weight in grams |
| `invites` | Single-use invites that expire within 7 days |
| `logs` | Diaper, bottle feed in ml, and pump (one total ml, duration, and the owned pump). No side |
| `pump_models` | Catalog of brands and models. Any signed-in user can read it |
| `family_pumps` | Pumps a family owns, including a custom name and nickname |
| `chiller_items` | Milk or pump parts: location, `stored_at`, `expires_at`, optional `pump_id`, optional `volume_ml` |
| `reminders` | One schedule row per baby and type. Each pump-parts chiller item adds a reminder due 30 minutes before `expires_at`, for owners and caregivers |
| `push_subscriptions` | Browser push subscriptions for a later phase |
| `member_settings` | Quiet hours, snooze, and `language`. Volume unit is on the family |

Row-level security is on for every table. `anon` has no table grants. Signed-in users only reach families they belong to. Viewers can read family care data and cannot change it. Each person manages their own push subscription and settings. Invite acceptance is `public.accept_invite`, which calls a privileged function in the unexposed `private` schema.

Apply it when you are ready:

```bash
npx supabase login
npx supabase link --project-ref bhovselkwcedelwxpkfa
npx supabase db push
```

`db push` updates the linked hosted project. Do not put the service-role key in the app to run it.

For a local Supabase stack (Docker), `npx supabase start` then `npx supabase migration up`.

## PWA

`public/manifest.webmanifest`, icons under `public/icons/`, and `public/sw.js` make the app installable. The service worker registers from the root layout, serves an offline page when navigation fails, and does not send push messages.

- Android: install from the browser menu once the site is on HTTPS (or localhost).
- iOS: Share, then Add to Home Screen. Web push on iOS needs 16.4 or newer and only works after the app is on the Home Screen. Sending pushes is later.

Session refresh lives in `src/proxy.ts`. Next.js 16 uses that file instead of `middleware.ts`. It renews the Supabase cookies and sends signed-out visitors to `/login`. Pages also check the user with `getClaims()`.

## Deploy to Vercel

1. Import this GitHub repository. The framework preset is Next.js.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Production and Preview. Copy them from `.env.example` or the Supabase API settings. Do not add a service-role key.
3. Deploy.
4. Add `https://<your-domain>/auth/callback` to the Supabase Auth redirect URLs.

## Later

- Save diaper, feed, pump, chiller, and baby-profile rows to Supabase. The chiller and My pumps screens currently keep that data on this device
- Sync the language cookie to `member_settings.language`
- Schedule reminders and send web push, including quiet hours and snooze
- Create and share invites from the family screen
