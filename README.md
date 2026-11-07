# Baby Care Reminder

A mobile-first PWA for one family sharing diaper changes, bottle feeds in millilitres, a chiller for milk and pump parts, and reminders. The interface is English and Bahasa Indonesia. The type is the system font. The palette is white, soft gray, and sage.

Feeds are bottle only. A pump log is one total in ml, an optional duration, and the pump that was used. There is no side split.

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

Open [http://localhost:3000/login](http://localhost:3000/login). Other routes send you there until you are signed in.

In the Supabase dashboard for project `bhovselkwcedelwxpkfa`, add these redirect URLs:

- `http://localhost:3000/auth/callback`
- your Vercel URL plus `/auth/callback`

Magic links use the browser that requested them. An invite link returns to `/join/<token>` after sign-in.

## Environment variables

Copy `.env.example`. Do not commit real secrets.

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js | Supabase project URL. Safe in the browser. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Next.js | Publishable client key. Safe in the browser. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Next.js | Public Web Push key. Safe in the browser. Leave blank until you generate a pair. |
| `VAPID_PUBLIC_KEY` | Supabase secret | Same public key, for the `send-reminders` function. |
| `VAPID_PRIVATE_KEY` | Supabase secret | Private Web Push key. Never put this in the Next.js app or in git. |
| `VAPID_SUBJECT` | Supabase secret | A `mailto:` contact for the push service. |
| `CRON_SECRET` | Supabase secret | Optional bearer token for the cron caller. |
| `SUPABASE_URL` | Edge runtime | Injected for the function. Do not copy it into `.env.local` as a service credential. |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge runtime | Injected for the function. Bypasses row-level security. Never prefix it with `NEXT_PUBLIC_` and never commit it. |

Generate a VAPID pair with `npx web-push generate-vapid-keys`. Put only the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Set the function secrets in the Supabase dashboard.

## Language

Copy lives in `src/i18n/messages/en.ts` and `src/i18n/messages/id.ts`.

On a first visit the app follows `Accept-Language`. Indonesian (`id` or the legacy `in`) selects Bahasa Indonesia. Anything else uses English. Settings stores `bcr_locale` for one year on this device. The same choice is saved on `member_settings.language` when a family exists. Volume unit lives on `families.unit` and defaults to `ml`.

## Database migrations

None of these files are applied to the hosted database by this repo. Apply them in this order when you are ready. Do not edit a migration that is already merged. Add a new file instead.

1. `supabase/migrations/20261105180018_phase0_foundation.sql`
2. `supabase/migrations/20261105184540_family_unit_and_harmony_name.sql`
3. `supabase/migrations/20261105185046_phase1_onboarding_and_feeding.sql`
4. `supabase/migrations/20261105185328_optional_pump_duration.sql`
5. `supabase/migrations/20261105191000_phase2_leftover_location.sql`
6. `supabase/migrations/20261105193000_phase3_reminders.sql`
7. `supabase/migrations/20261105195000_phase4_family_sharing.sql`

```bash
npx supabase login
npx supabase link --project-ref bhovselkwcedelwxpkfa
npx supabase db push
```

`db push` updates the linked hosted project. Do not put the service-role key in the app to run it.

For a local Supabase stack (Docker), `npx supabase start` then `npx supabase migration up`.

What the schema holds:

| Table | What it stores |
| --- | --- |
| `families` | Household, `pump_parts_wash_by_hours` (1–24, default 24), and `unit` (default `ml`) |
| `family_members` | Roles owner, caregiver, and viewer, plus the name shown on logs |
| `babies` | Name, birth date, sex, weight, and optional bottle amounts |
| `feeding_guidelines` | Starting bottle amounts by age and weight |
| `invites` | Single-use links. They expire within 7 days and can add a caregiver or a viewer, not an owner |
| `logs` | Diaper (wet, dirty, or both), bottle feed in ml, or one pump total |
| `pump_models` | Catalog. The Medela seed name is Harmony |
| `family_pumps` | Pumps the family owns |
| `chiller_items` | Milk or pump parts, with `stored_at` and `expires_at` |
| `reminders` | One row per baby and type. A pump-parts item has its own row, due 30 minutes before expiry |
| `push_subscriptions` | Browser push subscriptions for the signed-in member |
| `member_settings` | Quiet hours, snooze, language, and which alerts this member wants |

Row-level security is on for every table. `anon` has no table grants. Signed-in users only reach families they belong to. Viewers can read care data and cannot change it. Owners and caregivers can log. A log by either of them moves the shared reminder, so it clears for everyone. Invite acceptance is `public.accept_invite`. Privileged helpers stay in the unexposed `private` schema.

Milk storage times follow the CDC defaults: room 4 hours, fridge 4 days, freezer 6 months, cooler 24 hours, thawed 24 hours, leftover 2 hours. Pump parts use the family's wash-by hours.

## Logging and offline

Diaper, feed, and pump sheets write to `logs`. Saving milk or pump parts writes `chiller_items`. If the device is offline, the row waits in local storage and `SyncQueue` sends it when the browser is online again. The chiller list and detail pages count down from `expires_at`. Today, at `/timeline`, totals feeds, pumps, and diapers since midnight and shows who logged each row.

## Reminders and push

`private.touch_schedule_reminder` runs after each log. Feeds use the baby's interval, then the guideline, then 3 hours. Diaper and pump use 3 hours. The edge function `supabase/functions/send-reminders` reads due reminders, milk expiring within 30 minutes, and pump-part wash times. It skips viewers for caregiver-only alerts, and it skips a member who is snoozed, inside quiet hours, or who turned that alert off.

Deploy and schedule it after the migrations and secrets are in place:

```bash
npx supabase functions deploy send-reminders --project-ref bhovselkwcedelwxpkfa
```

In the Supabase dashboard, schedule `send-reminders` every minute with a POST and `Authorization: Bearer <service-role key or CRON_SECRET>`. The cron query should call it only when something is due. The function refuses other callers.

Notifications on iPhone need iOS 16.4 or newer, and they only work after the app is added to the Home Screen and opened from that icon. Settings walks through that, then asks for permission and stores the subscription.

## Family sharing

Owners and caregivers create a link on the Family screen. The link is single-use, expires within 7 days, and carries caregiver or viewer. The person who created the family is the owner. Opening `/join/<token>` while signed in calls `accept_invite`. Each member picks a name and which alerts they want.

## PWA

`public/manifest.webmanifest`, icons under `public/icons/`, and `public/sw.js` make the app installable. The service worker precaches the offline page, uses network-first navigation, skips `/auth`, and shows a notification when a push arrives.

Check the installable PWA criteria against the deployed HTTPS URL (Lighthouse in Chrome DevTools, or `npx lighthouse <url> --only-categories=pwa`). Confirm the manifest, a controlling service worker, theme color `#5f7f6c`, and the 192 and 512 icons. Localhost can register the worker, but a store install and iOS push need the production origin.

## Deploy to Vercel

1. Import this GitHub repository. The framework preset is Next.js.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and, when you have one, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for Production and Preview.
3. Do not add a service-role key or a VAPID private key to Vercel.
4. Deploy.
5. Add `https://<your-domain>/auth/callback` to the Supabase Auth redirect URLs.
6. Apply the migrations, set the function secrets, deploy `send-reminders`, and schedule it.

```bash
npm run lint
npm run build
```
