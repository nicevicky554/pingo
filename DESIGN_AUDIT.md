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

`bun tsc -b --noEmit` passes. No Supabase project, two testers, camera/microphone or TURN account were available on this host, so runtime flows are **not** claimed as tested. Apply migrations 0001–0008 before exercising the app.

## Latest implementation pass

- RLS is enabled again by `0007_restore_rls.sql`; every public table, Storage
  object and Realtime topic gets an explicit policy. The browser uses only the
  publishable key. `0008_phone_auth_only.sql` removes the old auth-mode switch.
- Authentication is Supabase Phone OTP only. There is no anonymous session and
  no in-app arbitrary-code path. Existing users keep the same `auth.users` ID;
  the verified phone is mirrored into `profiles.phone`.
- Navigation is now Chats, Updates, Communities, Calls and Settings. Profile is
  not a tab. Mobile uses a layered Liquid Glass bar with safe-area padding and a
  raised active surface; desktop keeps the compact rail.
- Settings has a list home plus account, privacy, security, devices, chats,
  notifications, storage, appearance, help and about pages, with Log out at the
  bottom. Detail pages hide the primary navigation.
- Active statuses now produce green/teal rings in the Chats list, chat header and
  profile page. Tapping an avatar with a status opens the full-screen status
  viewer; tapping a name opens the profile.
- Dedicated channel discovery, administrator and subscriber pages were added at
  `/app/channels`, `/app/channels/:id/admins` and `/app/channels/:id/subscribers`.
- Swipe-right reply was added to message bubbles; long-press/right-click actions
  remain.
- The photo picker now opens a single-photo preview with caption/remove before
  sending, rather than treating an image as an immediate attachment.

Still not implemented: group topics, channel discussion groups, per-post
comments, View Once, blurred media auto-download preferences, camera capture
review screen, storage/device revocation RPC, and full admin modules. These are
not represented as working controls.

## Historical note

An earlier owner request removed RLS. That file was deleted; the current product
requires and restores RLS for normal users.
