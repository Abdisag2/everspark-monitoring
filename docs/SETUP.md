# Setup & Deployment

Two ways to run: **demo mode** (zero config, mock data) and **live mode**
(real Supabase + hardware). Start with demo, then wire Supabase.

---

## 1. Prerequisites
- **Node.js 18+** and npm
- A **GitHub** account (for Vercel deploys)
- A **Supabase** account (free tier) — for live mode
- A **Vercel** account — to host the dashboard
- *(For hardware)* an **AWS** account + the gear in [HARDWARE.md](./HARDWARE.md)

---

## 2. Local development (demo mode)

```bash
git clone https://github.com/<you>/everspark-monitoring.git
cd everspark-monitoring
npm install
npm run dev            # http://localhost:3000
```

With **no `.env.local`**, the app runs in demo mode:
- Login screen shows **demo quick-sign-in** chips (Admin / Manager / Viewer).
- Password for every demo account: **`everspark`**.
- All data is seeded from `lib/mock-data.ts`; CRUD works in-memory.

Use the **"Preview as"** bar (top, when signed in as admin) to see how data
isolation looks for each role.

### Useful scripts
```bash
npm run dev      # dev server
npm run build    # production build (also type-checks + lints)
npm run start    # serve the production build
npm run lint     # eslint
```

---

## 3. Supabase setup (live mode)

### 3.1 Create the project
1. [supabase.com](https://supabase.com) → **New Project**. Choose a strong DB
   password and a region near your users.
2. Wait for it to provision.

### 3.2 Run the schema
**SQL Editor → New query** → paste the entire contents of
[`supabase/schema.sql`](../supabase/schema.sql) → **Run**. This creates the 5
tables, RLS policies, helper functions, and the signup trigger.

### 3.3 Grab the keys
**Project Settings → API**:

| App env var | Supabase field | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key | **server-only, secret** |

### 3.4 Wire env vars locally
Copy the template and fill it in:
```bash
cp .env.local.example .env.local
```
```ini
NEXT_PUBLIC_SUPABASE_URL="https://YOUR-REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
```
Restart `npm run dev`. The demo chips disappear → you're in live mode.

> The app decides demo vs live with `isSupabaseConfigured = Boolean(URL && ANON)`.
> Leave the values empty to stay in demo mode.

### 3.5 Create your first admin
With live Supabase, the demo accounts no longer exist — auth is real.
1. **Authentication → Users → Add user** (email + password, tick *Auto Confirm*).
   The signup trigger auto-creates a `profiles` row (role `viewer`).
2. **SQL Editor:**
   ```sql
   update public.profiles set role = 'admin', name = 'System Administrator'
   where email = 'you@example.com';
   ```
3. Sign in at `/login`. (If you ever see *"No profile linked"*, insert the
   profile manually — see the snippet in the project chat history.)

### 3.6 Auth redirect URLs (for invites & password reset)
**Authentication → URL Configuration:**
- **Site URL:** your deployed URL (e.g. `https://your-app.vercel.app`)
- **Redirect URLs → add:** `https://your-app.vercel.app/**` (and
  `http://localhost:3000/**` for local testing)

Without this, invite/reset email links fall back to the Site URL root.

---

## 4. Deploy the dashboard (Vercel)

1. Push the repo to GitHub.
2. **vercel.com → Add New → Project** → import the repo. Next.js auto-detects;
   no build config needed.
3. **Settings → Environment Variables** → add the same three vars from 3.3
   (select Production + Preview + Development).
4. **Deploy.**

### Verify the deploy
- `https://your-app.vercel.app/login` — demo chips **gone** ⇒ public keys baked in.
- `https://your-app.vercel.app/api/ingest` (GET) — health JSON ⇒ app is up.
- `curl -X POST https://your-app.vercel.app/api/ingest --data "token=x&data=;1,1,0,0,0,0,1,0,7:"`
  → `{"error":"Unknown token …"}` (404) ⇒ server reached Supabase (good);
  `{"mode":"demo"}` ⇒ server env vars not set / not redeployed.

### Deployment gotchas (learned the hard way)
- **`NEXT_PUBLIC_*` are baked in at build time.** If you add them *after* a
  deploy, you must **redeploy** for the browser to pick them up.
- **Vercel commit-author verification:** on Hobby plans Vercel blocks deploys
  whose commit author it can't match to a team member. If you see *"This commit
  author could not be automatically verified"*, set git to commit as the account
  that owns the Vercel project:
  ```bash
  git config user.name "<YourGitHubUser>"
  git config user.email "<id>+<YourGitHubUser>@users.noreply.github.com"
  ```
  then push a fresh commit (rewrite history with `filter-branch` if needed).
- **Windows + Git TLS errors** (`unable to get local issuer certificate`):
  `git config --global http.sslBackend schannel`.

---

## 5. Environment variable reference

| Variable | Where | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | dashboard (Vercel + local) | live mode | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dashboard | live mode | public |
| `SUPABASE_SERVICE_ROLE_KEY` | dashboard `/api/*` + ingest VM | live mode | **secret** |
| `SUPABASE_URL` | ingest VM only | hardware | same value as `NEXT_PUBLIC_SUPABASE_URL` |
| `PORT` | ingest VM (HTTP server) | optional | default 8080 |
| `MQTT_URL` / `MQTT_USERNAME` / `MQTT_PASSWORD` / `MQTT_TOPIC` | ingest VM (subscriber) | optional | broker connection |

Next: wire up hardware in **[HARDWARE.md](./HARDWARE.md)**.
