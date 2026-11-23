# PINGO 2026 redesign — audit and implementation record

## Audit (before changes)

| Area | Problem found | Action |
| --- | --- | --- |
| Root route | Marketing landing page at `/` | Replaced with `Home`: session restore → login → onboarding → chats. `Landing.tsx` deleted. |
| Startup | Generic spinner, no branding | Added `BrandSplash` with the real PINGO mark; only while auth/profile or route chunks load. |
| Navigation | Flat rail + wide mobile bar; settings mixed into main nav | Compact rail, floating glass mobile nav with Profile entry, Settings via profile menu. |
| Chats | Oversized header, hidden search, plus button opened one dialog for everything | Compact header, inline search, dedicated global search, plus menu with four creation routes, floating mobile plus. |
| Creation | Group, channel, community and status creation lived in modals | Added `/app/groups/create`, `/app/channels/create`, `/app/communities/create`, `/app/updates/create`, `/app/channels/:id/compose` with review steps. |
| Message sending | Waited for upload + insert before the message appeared; no retry; duplicate risk | Optimistic local message, immediate send state, server replacement, de-duplication against realtime, Failed · Retry, synchronous tap guard. |
| Attachments | File sent without a preview/caption step; progress was coarse | Image preview in the composer, caption uses the message text, XHR byte progress with SDK fallback. |
| Voice | Sent immediately after recording; waveform derived separately | Preview + discard/send step; live analyser waveform; stored decoded peaks; seek and 1×/1.5×/2×. |
| Emoji | No picker | Searchable category emoji picker with recent items, inserted at the composer. |
| Message actions | No forwarding | Forward dialog; attachments are downloaded and re-uploaded into the target conversation. |
| Profile | No profile information page | `/app/profile/:userId` with message, call, add contact, block/report; group info at `/app/groups/:id`. |
| Channels | Channel creation in a modal; no channel page | Real channel page, follow state, subscriber count, owner publishing and preview. |
| Search | Only a small conversation filter | Dedicated `/app/search` for people, messages and public channels. |
| Status | Modal composer | Full-page text/photo/video composer with audience selection and 24-hour expiry. |
| Login | No agreement links or recorded acceptance | Links to `/terms`, `/privacy`, `/guidelines`; onboarding requires explicit acceptance and stores version + timestamp (migration 0004). |
| Settings | Four tabs, no notification/security controls | Added notification preferences, read receipts and session/security panel. |
| Design | Inconsistent rounded cards and bright accents | New neutral palette, Inter, restrained teal, glass only on floating controls, reduced-motion support, fast entrance/send animations. |
| Realtime | Duplicate notification subscriptions crashed the client | Single `NotificationsProvider`; all listeners registered before `subscribe()`; unique topics and cleanup. |

## Deliberately not shipped

These are not represented by fake controls:

- Group calls / SFU. The 1:1 WebRTC path remains; LiveKit is documented as the next step.
- Scheduled channel posts. No Schedule button is shown; only Publish now.
- Status drawing, stickers, video trimming. The editor supports text, photo, video, caption, background and audience; unsupported tools are absent rather than decorative.
- Push notifications for closed apps.
- Group/channel editing beyond schema-supported fields.
- Full admin module expansion (conversations, communities, calls, moderation).
- Language switching. Storage/language settings categories are omitted because
  they have no working backend rather than shown as dead rows.

## Verification

`bun tsc -b --noEmit` passes. No Supabase project, two testers, camera/microphone or TURN account were available on this host, so runtime flows are **not** claimed as tested. Apply migrations 0001–0006 before exercising the app.

## Owner-directed RLS removal and follow-up

- `supabase/migrations/0005_disable_rls.sql` (and `supabase/remove-rls.sql`)
  drops every policy and disables RLS in `public`, Storage and Realtime. This is
  a deliberate, explicitly requested security reduction: the anon key can read
  and write exposed data. Do not apply it unless that is understood.
- `0006_public_branding.sql` adds public branding read plus an admin-checked
  publish RPC. `/admin/branding` uploads app icon, light/dark logos, splash
  assets and default group/channel/community/user images to Storage, previews
  them, then publishes to `platform_settings`.
- The splash now reads the published splash icon/background and shows only the
  mark, wordmark and three subtle loading dots. No “Opening PINGO…” label or fake
  progress bar remains.
- Primary mobile navigation is hidden in chats (`?c=`), search, new message,
  group/channel/community creation and detail, status creation, other-user
  profiles and all settings pages. Chats rows now write `?c=` so back navigation
  and nav visibility agree. The Chats bell and floating plus are removed; the
  compact header compose control opens the four creation routes.
- Chats navigation shows a real summed unread badge from `conversation_list`,
  refreshed on message inserts. Chat rows and bubbles share receipt semantics:
  one tick = stored, two muted = a real recipient delivery receipt, teal two =
  read (group read requires every other member). Recipient devices upsert a
  delivery receipt even when read receipts are disabled.
- Settings is now a list home at `/app/settings` with dedicated
  `/app/settings/{profile,account,privacy,security,notifications,appearance,about}`
  pages. Own profile and settings summary show the verified phone number.

Still not implemented: multi-select media tray with per-item editor, camera
capture screen, contacts/location attachments, full admin modules, community
detail page, channel admin/invite screens, session revocation RPC, and runtime
tests. These are not represented as working controls.
