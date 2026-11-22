# PINGO — global messaging platform

PINGO is a Supabase-backed messaging web application and a separate
administration console. This repository previously contained a Convex "ping
board" prototype; Convex has been removed entirely. There is no second database.

- **Web app:** React 19, TypeScript, Vite, Tailwind v4, shadcn/ui, Lucide icons
- **Backend:** Supabase PostgreSQL, Auth, Storage, Realtime, Row Level Security
- **Admin app:** separate `/admin` console guarded by database roles
- **Design:** neutral surfaces with a teal accent (`#167C80` light / `#38B7A8` dark), Inter, Lucide icons
- **Deploy:** Vercel static SPA + one serverless TURN function; see `DEPLOYMENT.md`

## 1. Required setup

PINGO refuses to pretend it is connected. Until these steps are done, `/` and
`/app/*` show a setup screen instead of a broken UI. The root URL is the
application entry point: signed-out visitors see phone sign-in, not a marketing
page.

1. Create a Supabase project.
2. Add these variables in the project's **Keys** tab:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (the publishable anon key — never the service role key)
3. Apply both migrations in order:
   - `supabase/migrations/0001_pingo_core.sql`
   - `supabase/migrations/0002_test_auth_calls_notifications.sql`
   - `supabase/migrations/0003_media_waveforms.sql`
   - `supabase/migrations/0004_terms_acceptance.sql`

   With the Supabase CLI:

   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```

   These create every table, index, trigger, view, RPC, RLS policy, storage
   bucket and Realtime authorization policy, plus the auth-mode switch and
   notification triggers.
4. For **test sign-in** (the default), enable **Anonymous sign-ins** in
   Supabase → Authentication → Providers. Test mode sends no SMS; any six-digit
   code signs a tester in. Each browser profile becomes one test account, so do
   not sign out unless you intend to start a fresh account.
5. For **live SMS**, enable the **Phone** provider and connect an SMS provider
   (Twilio, MessageBird, Vonage, etc.). Then switch the mode in
   `/admin/settings` → Phone sign-in codes → Live SMS.
6. Optionally enable email confirmations for recovery addresses.
7. Visit `/admin/setup` while signed in and claim super admin. The bootstrap RPC
   works only while no administrator exists and writes an audit entry.

No credentials are committed to this repository. `VITE_*` values are public by
definition; privileged keys must never be used client-side. See
[`DEPLOYMENT.md`](./DEPLOYMENT.md) for Vercel, environment variables and TURN
setup, and [`env.example`](./env.example) for the full list.

## 2. What is implemented

### Phase 1 — foundation

- Supabase client, session provider, profile/bootstrap trigger fallback.
- Phone-first authentication: searchable country selector, dial codes, SMS OTP,
  resend timer, friendly error messages.
- **Admin-controlled sign-in mode:** `/admin/settings` switches between **Test**
  (default, no SMS, any six digits, anonymous Supabase session) and **Live SMS**
  (real codes through Supabase + your SMS provider). The switch is a
  security-definer RPC with an audit entry; the client reads the mode from the
  database before showing the code step.
- Onboarding: unique `@username` check against the database, display name,
  optional profile photo upload, cropping, contact picker and an explicit
  agreement step that records the accepted policy version and timestamp.
- Branded startup splash while the session/profile is restored; no marketing
  page at `/`. Legal pages live at `/terms`, `/privacy` and `/guidelines`.
- Full responsive shell: 76px desktop rail, 350px conversation list, mobile
  bottom navigation, safe-area padding, offline banner, light/dark/system theme,
  font-size and wallpaper preferences persisted in `user_settings`.
- Deterministic initials avatars, stable colour per account ID, broken-image
  fallback, private profile photos via signed URLs.
- Server-side photo privacy: `public_profiles` returns the primary photo path
  only when the viewer is allowed; otherwise the public fallback URL. Storage
  policies enforce the same rule for the private bucket.
- Presence: real Supabase Realtime Presence (not account existence), green dot
  only while a live client is tracking. Privacy setting is respected in the UI.

### Phase 2 — core messaging

- Real conversations and messages in Postgres, with RLS on every table.
- Realtime inserts/updates through private `conversation:<id>` channels.
- Typing indicators over Supabase Broadcast: throttled, expire after 3.5s,
  stopped on send/disconnect; glass capsule and header “Typing…” state.
- Delivery/read receipts stored in `message_receipts`; read receipts opt-out.
- Replies, reactions, editing, delete-for-me, delete-for-everyone (no tombstone),
  copy, report, block.
- Direct chat creation and group creation with the caller as owner.
- Global message search plus conversation search; unread counts, mute, archive,
  pin state in the schema, message-day separators, attachment upload to private
  storage, image previews, file downloads, voice recording via MediaRecorder.
- Disappearing-message expiry is stored per message; `purge_expired_messages()`
  is provided for a scheduled job (see gaps).

### Updates, communities, channels

- 24-hour text/photo/video statuses with upload, viewer tracking, reply-to-status,
  deletion, unseen/viewed rings and a full-screen sequential viewer.
- Public channel discovery, follow/unfollow, channel creation, real posts and an
  owner/admin composer.
- Community creation, join/leave, and attaching groups you administer.

### Calling (Phase 6, 1:1)

- Real WebRTC peer connections with STUN and server-minted TURN credentials from
  `/api/turn` (Twilio Network Traversal Service); Supabase Realtime broadcast
  signalling over private `user:<id>` topics.
- Voice and video call buttons in direct conversations, incoming-call overlay,
  accept/decline, mute, camera toggle, camera switch, minimize, live duration,
  end call.
- ICE restart and a visible reconnecting state for network changes instead of an
  immediate disconnect; no artificial maximum call duration.
- Video quality adapts from measured `getStats()` packet loss; the displayed
  resolution and bitrate come from the actual inbound stream, never a fixed
  claim of 4K.
- Call outcomes (ringing, accepted, declined, missed, failed, ended, duration)
  are written to `calls` and `call_participants`; the Calls page reads them in
  realtime. Ring timeouts mark missed calls instead of pretending success.
- Group calls are intentionally disabled until an SFU (LiveKit) is connected.

### Notifications (Phase 4)

- Database triggers create notifications for new messages (respecting muted
  conversations) and incoming calls.
- Realtime bell in the app with unread badge, mark-as-read, deep links to the
  conversation, and optional browser notifications through the Notification API.
- Per-channel push delivery (FCM/APNs/Web Push service worker) is still pending.

### Administration (`/admin`)

- Separate layout and routes, guarded by `admin_user_roles` + RLS, not just UI.
- Live dashboard via `admin_dashboard()` (no hardcoded numbers).
- User search, account review, suspension/restoration with mandatory reason and
  audit log entries.
- Moderation queue with resolve/dismiss, internal notes, `moderation_actions`
  and audit records.
- Administrator roster and role grants (super admin only), immutable audit log
  (no update policy exists for audit rows).

### Redesigned navigation and dedicated creation routes

- `/app/new/message` — people discovery, contact list and duplicate-safe direct
  conversation creation.
- `/app/search` — people, message and public channel search in one page.
- `/app/profile/:userId` — full profile information with message, voice/video
  call, add contact, block and report actions.
- `/app/groups/create` — multi-step member selection, details, permissions and
  review; creates the group and opens it. `/app/groups/:id` is real group info
  with member list, add members, mute, leave and editable details.
- `/app/channels/create` and `/app/channels/:id` — real channel creation, follow
  state, subscriber count and post feed. Owners publish from
  `/app/channels/:id/compose` with a preview; scheduled posts are not offered.
- `/app/updates/create` — full-page status editor for text, photo and video.
- `/app/communities/create` — dedicated community creation page.
- The mobile Chats plus button opens New message / New group / New channel /
  New community and every entry navigates to its own page, not a modal.

### Message sending

- Optimistic UI: the message appears immediately with a sending state, then is
  replaced by the server row (realtime insert duplication is de-duplicated).
- Failures stay visible with **Failed · Retry**; successful sends clear the
  composer immediately. Repeated taps are blocked with a synchronous guard.
- `waveform` is only sent when present and retried without it if migration 0003
  has not been applied, so text messages never fail because of the voice column.
- Inline replies, reactions, forwarding (including media re-upload), editing,
  delete-for-me and delete-for-everyone are wired to Supabase.

## 3. Database architecture

`supabase/migrations/0001_pingo_core.sql` contains:

- Profiles, settings, contacts, blocks, devices, security events.
- Conversations, members, messages, receipts, reactions, deletions, pins.
- Status updates, views, reactions, audience rules.
- Communities, community members, community groups.
- Channels, members, posts, reactions.
- Calls, participants, events (schema ready; media layer not built).
- Notifications, push tokens.
- Admin roles, user roles, audit logs, moderation reports/actions, announcements,
  platform settings.
- Privacy helper functions, `public_profiles` projection, `conversation_list`
  view, `start_direct_conversation()`, `create_group()`, `admin_dashboard()`,
  `claim_super_admin()`.
- Storage buckets: `avatars` (public), `profile-photos` (private), `media`
  (private, conversation-scoped), `status-media` (private), `channel-media`.
- Realtime publication and RLS policies on `realtime.messages` for private
  conversation/presence topics.

## 4. Honest gaps (not claimed as finished)

These are deliberately **not** faked. Buttons that would imply them are disabled
or absent.

1. **Group calling / SFU (Phase 6 remainder).** 1:1 calls are implemented; group
   calls need LiveKit or another SFU and are disabled with an explanation. TURN
   is wired through `/api/turn` but requires Twilio credentials before it can
   relay media across strict NATs.
2. **End-to-end encryption.** PINGO does not claim E2EE. Transport is TLS and
   data is protected by RLS, not the Signal protocol.
3. **Push notifications.** In-app and browser notifications work while the app is
   running; FCM/APNs and a Web Push service worker for closed apps are not built.
4. **Test sign-in is insecure by design.** It uses anonymous Supabase sessions
   gated by the admin switch. Do not leave test mode on for a public launch.
5. **Offline queue / IndexedDB cache.** Not implemented; the app shows an offline
   banner and relies on realtime reconnect.
6. **Mobile apps (Phase 9).** No Expo project exists yet.
7. **Presence privacy enforcement.** Presence is broadcast on an
   authenticated-only topic; the viewer honours `online_visibility`, but a
   determined authenticated client could observe the topic. Production should
   split presence into per-conversation private topics.
8. **Receipt reciprocity.** Read receipts can be turned off, which stops the
   sender emitting receipts and hides ticks; other users' setting is not exposed
   to the client.
9. **Scheduled jobs.** `purge_expired_messages()` must be scheduled (pg_cron or
   an Edge Function cron); it is not scheduled automatically.
10. **Media optimisation.** Images are uploaded as-is; thumbnail generation and
    compression are not implemented.
11. **Status audience exceptions** are schema-ready (`status_audience`) but the
    settings UI exposes contacts/everyone/nobody only.
12. **Device/session management** lists the current Supabase session and offers
    global sign-out; per-device revocation UI is not built.
13. **Account deletion** records an audited support request; a service-role
    deletion Edge Function is required to actually erase auth users.
14. **Channels** appear in Chats once followed; channel comments/discussion
    groups, scheduled posts and analytics are not in the UI.
15. **Communities** do not yet create groups inline or manage member permissions
    beyond owner/member.
16. **No runtime testing on this host.** TypeScript passes, but sign-in,
    messaging, uploads, waveforms, TURN relay and calls could not be exercised
    without a Supabase project, a TURN account and two testers. Nothing below is
    claimed as runtime-verified.
17. **Attachment uploads** send via XHR for real byte-level progress and fall
    back to the Supabase SDK if the direct endpoint is blocked.

## 5. Verification performed

- `bun tsc -b --noEmit` passes for the whole client after the redesign, the
  notification fix, the four-step onboarding, the waveform/attachment work and
  the call reliability changes.
- `api/turn.ts` compiles with `bun build --target=node`; `vercel.json` parses as
  valid JSON.
- Convex packages, config and generated code removed; `bun install` clean.
- The migrations were written but **not executed** against a live Supabase project
  because no credentials are configured on this host. Apply them before expecting
  sign-in or messaging to work.
- No Supabase project, TURN account, browser session, camera/microphone or second
  tester is available on this host. Test-mode sign-in, OTP, profile upload,
  messaging, typing, voice waveforms, notification realtime, TURN relay and
  WebRTC calls have **not** been executed. TypeScript passing is not runtime
  proof.

## 6. Next phases

1. **Phase 3 remaining:** channel scheduling/analytics, community group creation,
   contact discovery with hashed identifiers.
2. **Phase 4:** push notifications, offline outbox, image thumbnails, downloads to
   device storage.
3. **Phase 5:** 2FA, device sessions, audited account deletion Edge Function,
   Signal-protocol E2EE design (or an explicit decision not to claim it).
4. **Phase 6:** LiveKit SFU for group calls, TURN credential refresh for very
   long sessions, bandwidth probing beyond loss-based adaptation.
5. **Phase 7 remaining:** announcements composer, storage/database health panels,
   infrastructure metrics.
6. **Phase 8:** run the test matrix from the brief against a real deployment.
7. **Phase 9:** Expo app sharing the Supabase backend and validation package.

## 7. Repository map

```
src/
  components/       UI primitives, avatars, chat, admin shell
  hooks/            useAuth
  lib/              supabase client, chat data access, types, formatting
  pages/            Home, Auth, Onboarding, 404
    app/            Chats, Updates, Communities, Calls, Settings
    admin/          Dashboard, Users, Reports, Access, Setup
  pages/app/         Chats, Search, NewMessage, Profile, GroupInfo, Groups/Create,
                     Channels, CreateChannel, ChannelCompose, Updates, StatusComposer,
                     Communities, CreateCommunity, Calls, Settings
  providers/        AuthProvider, PresenceProvider, CallProvider, NotificationsProvider
api/
  turn.ts           verified, short-lived TURN credentials
supabase/
  migrations/       0001_pingo_core.sql, 0002_test_auth_calls_notifications.sql,
                    0003_media_waveforms.sql, 0004_terms_acceptance.sql
```
