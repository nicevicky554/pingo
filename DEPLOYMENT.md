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

4. **Authentication → Providers**
   - **Test mode (default):** enable **Anonymous sign-ins**.
   - **Live SMS:** enable **Phone**, connect an SMS provider (Twilio, Vonage,
     MessageBird, …), and add your production URL under
     **Authentication → URL Configuration → Redirect URLs**.
5. Create the first administrator: sign in, visit `/admin/setup`, claim the
   super-admin role. The RPC is bootstrap-only and audited.
6. Sign-in mode is switched only from `/admin/settings`; every change is written
   to the audit log. Test mode never sends SMS and accepts any six-digit code.
   Do not leave it enabled for a public launch.

## 2. Environment variables

Copy `env.example` to `.env.local` for local development. In Vercel, add the
same names under **Project → Settings → Environment Variables** for Production,
Preview and Development.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | client | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | client | yes | Public anon/publishable key |
| `SUPABASE_URL` | server | yes | Same URL, used by `/api/turn` to verify sessions |
| `SUPABASE_ANON_KEY` | server | yes | Same anon key, used server-side |
| `TWILIO_ACCOUNT_SID` | server | for TURN | Twilio account identifier |
| `TWILIO_API_KEY` | server | for TURN | Twilio API Key SID |
| `TWILIO_API_SECRET` | server | for TURN | Twilio API Key secret |
| `TWILIO_TURN_TTL` | server | optional | Credential lifetime, default 3600s |
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
vercel env add SUPABASE_ANON_KEY
vercel env add TWILIO_ACCOUNT_SID
vercel env add TWILIO_API_KEY
vercel env add TWILIO_API_SECRET
vercel --prod
```

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

- Sign in in test mode; refresh; confirm the session is restored.
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
