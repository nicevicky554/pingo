# Deploying PINGO on Vercel + Supabase

PINGO is a static Vite SPA with one serverless function (`api/turn.ts`) and
Supabase as the only database, auth, storage and Realtime provider. There is no
Convex dependency.

## 1. Create the Supabase project

1. Create a project at <https://supabase.com>.
2. Open **Project Settings → API** and copy:
   - Project URL
   - `anon` / publishable key (**never** the `service_role` key)
3. Apply the migrations in order with the Supabase CLI:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```

   The migrations are:

   - `supabase/migrations/0001_pingo_core.sql`
   - `supabase/migrations/0002_test_auth_calls_notifications.sql`
   - `supabase/migrations/0003_media_waveforms.sql`
   - `supabase/migrations/0004_terms_acceptance.sql`
   - `supabase/migrations/0006_public_branding.sql`
   - `supabase/migrations/0007_restore_rls.sql`
   - `supabase/migrations/0008_phone_auth_only.sql`
   - `supabase/migrations/0009_verification.sql`
   - `supabase/migrations/0010_media_preferences.sql`
   - `supabase/migrations/0011_view_once.sql`
   - `supabase/migrations/0012_one_reaction_per_user.sql`
   - `supabase/migrations/0013_status_media_rotation.sql`
   - `supabase/migrations/0014_whatsapp_otp.sql`

    Migration 0007 enables RLS and recreates all public, Storage and Realtime
    policies. Normal browser requests use the publishable key and the user's
    JWT. Do not add a `VITE_` secret key and do not disable RLS for convenience.

4. **Authentication → Providers**
   - Enable **Phone** as a fallback provider. The primary PINGO code is sent to
     **WhatsApp** by `/api/auth/send-otp` and verified by
     `/api/auth/verify-otp`; if `/api` or WhatsApp delivery is unavailable the
     client falls back to Supabase's SMS provider.
   - Enable the **Email** provider. WhatsApp sign-in uses a confirmed,
     non-deliverable email (`p<digits>@phone.pingo.app`) only as the session
     holder; the phone number remains the identity. Disabling Email sign-in
     prevents the session exchange.
   - **Disable Anonymous sign-ins.** PINGO never calls anonymous auth.
   - For testers, add fixed numbers and codes under **Authentication → Phone →
     Test phone numbers**; these create real Supabase users.
   - Add your production URL under **Authentication → URL Configuration →
     Redirect URLs**.
5. Create the first administrator: sign in, visit `/admin/setup`, claim the
   super-admin role. The RPC is bootstrap-only and audited.

## 2. Environment variables

Copy `env.example` to `.env.local` for local development. In Vercel, add the
same names under **Project → Settings → Environment Variables** for Production,
Preview and Development.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | client | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | client | yes | Public anon/publishable key |
| `SUPABASE_URL` | server | yes | Same URL, used by `/api/turn` to verify sessions |
| `SUPABASE_PUBLISHABLE_KEY` | server | optional | Server-side publishable key alias |
| `SUPABASE_SECRET_KEY` | server only | yes for media/message fallback | Privileged server key; never expose to Vite. Used by `api/media/upload-url.ts` and `api/messages/send.ts` after token/membership checks. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | server only | optional | Short-lived rate-limit counters for uploads and message sends. PostgreSQL remains authoritative. |
| `SUPABASE_ANON_KEY` | server | yes | Legacy alias for the publishable key |
| `TWILIO_ACCOUNT_SID` | server | for TURN | Twilio account identifier |
| `TWILIO_API_KEY` | server | for TURN | Twilio API Key SID |
| `TWILIO_API_SECRET` | server | for TURN | Twilio API Key secret |
| `TWILIO_TURN_TTL` | server | optional | Credential lifetime, default 3600s |
| `TWILIO_WHATSAPP_FROM` | server | for WhatsApp sign-in | Approved Twilio WhatsApp sender, e.g. `whatsapp:+14155238886` |
| `TWILIO_MESSAGING_SERVICE_SID` | server | optional | Alternative to `TWILIO_WHATSAPP_FROM` when the sender lives in a Messaging Service |
| `TWILIO_WHATSAPP_CONTENT_SID` / `TWILIO_WHATSAPP_CONTENT_VARIABLE` | server | optional | Approved WhatsApp authentication template; the code is passed as the variable |
| `TWILIO_AUTH_TOKEN` | server | optional | Alternative to the API Key pair for WhatsApp delivery |
| `OTP_TTL_SECONDS` / `OTP_HASH_SECRET` | server | optional | Code lifetime (default 300s) and digest secret (defaults to the secret key) |
| `VITE_TURN_URL` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` | client | no | Development-only static fallback. Never use permanent secrets here. |

`VITE_*` values are compiled into the browser bundle. Permanent TURN provider
credentials must never be prefixed with `VITE_`. The browser only receives
short-lived credentials from `/api/turn`.

## 3. Deploy to Vercel

1. Push the repository to GitHub/GitLab/Bitbucket.
2. In Vercel, **Add New → Project** and import the repository.
3. Framework preset: **Vite**. Build command: `bun run build` (already set in
   `vercel.json`). Output directory: `dist`.
4. Add the environment variables from the table above.
5. Deploy. `vercel.json` rewrites `/auth`, `/app/*` and `/admin/*` to the SPA and
   registers `api/turn.ts` with a 10s maximum duration.
6. After the first deploy, add the production domain to Supabase
   **Authentication → URL Configuration** (Site URL and Redirect URLs), then
   redeploy if needed.
7. Open the deployment, sign in, and switch between test/live modes from
   `/admin/settings` only when you intend to.

### CLI alternative

```bash
bun add -g vercel
vercel
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add SUPABASE_URL
vercel env add SUPABASE_SECRET_KEY
vercel env add TWILIO_ACCOUNT_SID
vercel env add TWILIO_API_KEY
vercel env add TWILIO_API_SECRET
vercel env add TWILIO_WHATSAPP_FROM
vercel --prod
```

### WhatsApp phone sign-in

1. In Twilio, open **Messaging → Try it out → Send a WhatsApp message** and copy
   the sandbox sender, or use your approved WhatsApp sender. Add it as
   `TWILIO_WHATSAPP_FROM` (`whatsapp:+…`).
2. While testing with the sandbox, each tester sends the sandbox join code to the
   Twilio number from their own WhatsApp once. Production senders instead use an
   approved authentication template (`TWILIO_WHATSAPP_CONTENT_SID`).
3. Apply migration `0014_whatsapp_otp.sql`. Codes are stored only as HMAC
   digests; the table has RLS enabled with no user-facing policy.
4. Deploy. `POST /api/auth/send-otp` sends the code; `POST /api/auth/verify-otp`
   verifies it and returns a single-use Supabase token hash. The browser then
   calls `supabase.auth.verifyOtp`, so the session is a normal Supabase session.
5. The API surface stays at six routes (limit: nine): `/api/turn`,
   `/api/media/upload-url`, `/api/messages/send`, `/api/messages/view-once`,
   `/api/auth/send-otp`, `/api/auth/verify-otp`.

## 4. TURN credentials (required for strict networks)

The current one-to-one calls use WebRTC peer connections with Supabase Realtime
signalling. STUN alone fails on symmetric NATs, corporate firewalls and some
mobile carriers, so a TURN relay is required for reliable calls.

`/api/turn`:

1. Reads the caller's Supabase access token.
2. Verifies it with `GET /auth/v1/user`.
3. Requests a short-lived token from Twilio’s Network Traversal Service.
4. Returns only `{ iceServers, configured, ttl }` to the client.

Get Twilio credentials:

1. Create an account at <https://www.twilio.com>.
2. Copy **Account SID** from the Twilio Console dashboard.
3. Create an **API Key** (Console → Account → API keys & tokens) and store its
   SID and secret. These are not your Auth Token.
4. Add `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET` to Vercel.
5. Redeploy. `GET /api/turn` should return `configured: true` and a list of
   `stun:`/`turn:` URLs after signing in.

TURN relays media; it does not limit call duration. PINGO has no artificial
maximum call length. Calls survive ICE restarts and show “Reconnecting…” rather
than ending immediately. Credentials are refreshed on each new call because
they are requested when the peer connection is created.

If `/api/turn` returns `configured: false`, calls still attempt STUN-only
connections and the UI reports a failure honestly instead of pretending to
connect.

## 5. Group calls (future)

The current client is one-to-one only. Do not build group calls as a
peer-to-peer mesh. The planned architecture is an SFU:

- LiveKit Cloud (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
- Mint participant tokens in a serverless function; never expose the API secret.
- Keep call records in Supabase and keep signalling separate from media.
- Supabase Realtime is never used to carry audio or video.

The commented LiveKit variables in `env.example` are reserved for that phase.

## 6. Verify after deployment

```bash
bun tsc -b --noEmit
```

Then, with a real Supabase project:

- Sign in with a configured phone number; refresh; confirm the same user ID and session are restored.
- Sign out and back in; confirm notifications are not duplicated and the
  previous account's notifications disappear.
- Send messages between two accounts; check typing, read receipts and attachments.
- Upload a photo/video/document and confirm real progress and the full-screen
  image viewer.
- Record a voice note, confirm the waveform matches the audio, seek and change
  speed.
- Place a voice and a video call between two browsers. Confirm the header stats
  show real resolution/bitrate, mute/camera/switch camera work, minimizing keeps
  audio alive, and a network change shows “Reconnecting…” instead of ending.
- Confirm `/api/turn` supplies relay credentials before claiming TURN works.
