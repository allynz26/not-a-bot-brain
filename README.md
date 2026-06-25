# Not a Bot Brain — Supabase + GitHub Pages

The brain as a real shared web app: Postgres on **Supabase**, hosted free on **GitHub Pages**, **realtime** so you and Greg see each other's edits live, and **magic-link login** so only the two of you can read or write.

```
index.html        the app (UI + login gate)
app.js            logic: auth, CRUD, realtime, importer
config.sample.js  copy to config.js and add your keys
schema.sql        run once in Supabase: tables, security, realtime, seed data
```

No build step. It's plain static files — perfect for GitHub Pages.

---

## Setup (~15 min, one time)

### 1. Create the Supabase project
1. Go to supabase.com → **New project** (free tier is fine). Pick a name and a region near you.
2. When it's ready, open **SQL Editor → New query**, paste all of `schema.sql`, and **Run**.
   - *Or:* connect the **Supabase connector** in Cowork and ask Claude to run `schema.sql` for you.
3. In `schema.sql` (or the `allowed_emails` table afterward) **add Greg's email** so he's allowed in. Yours (`zane.allyn@gmail.com`) is already there.

### 2. Get your keys
Supabase → **Project Settings → API**. Copy:
- **Project URL** (e.g. `https://abcd1234.supabase.co`)
- **anon public** key

Duplicate `config.sample.js` → `config.js` and paste both in. (Both are safe to publish — the anon key is useless without the row-level-security rules from `schema.sql`.)

### 3. Put it on GitHub Pages
1. Create a new GitHub repo (e.g. `not-a-bot-brain`). It can be **public** — your data lives in Supabase, not the repo, and login protects it.
2. Upload these four files (`index.html`, `app.js`, `config.js`, and optionally `schema.sql`).
3. Repo **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
4. After a minute your app is live at `https://YOUR-USERNAME.github.io/not-a-bot-brain/`.

### 4. Allow that URL to log in
Supabase → **Authentication → URL Configuration**: add your GitHub Pages URL to **Site URL** and **Redirect URLs**. (Magic links won't work until you do.)

### 5. Log in
Open the app, enter your email, click the link Supabase emails you. Done — you're in, and so is Greg once you've added his email.

---

## Moving your existing notes over

The seed data (this week's talking points, your recurring "voice" frames, and the Glasswing episode) is already inserted by `schema.sql`, so the app won't be empty.

For anything you added in the in-app (Cowork) brain afterward:
1. In the Cowork brain, click **🔄 Sync now** — it writes `not-a-bot-brain-data.json` to your Google Drive ("Not a Bot Brain" folder).
2. Open that file, copy its contents.
3. In this app, click **⤓ Import old data**, paste the JSON, OK. It upserts everything (safe to run more than once).

---

## Keeping the weekly auto-refresh

The Monday auto-refresh currently lives in Cowork and updates the in-app brain. To feed *this* app instead, the scheduled task can write the week's talking points into the `roundup` table (id = 1) via the Supabase connector. Ask Claude to "repoint the weekly task to Supabase" once the connector is linked, and the live site updates itself every Monday.

---

## Notes
- **Security:** all tables have row-level security; only emails in `allowed_emails` can read or write, and only after logging in.
- **Realtime:** edits sync live between you and Greg (enabled in `schema.sql`).
- **Cost:** Supabase free tier and GitHub Pages free tier comfortably cover a two-person tool.
