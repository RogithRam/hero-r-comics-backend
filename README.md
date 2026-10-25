# Hero-R Comics — standalone site

This is the real, standalone version of Hero-R Comics: one static `index.html`
file, no Claude-specific APIs. Because it runs on its own domain (not inside
a Claude artifact), it's free to call your AI backend over the network —
which is the whole reason this version exists.

## What changed from the artifact version

- **Accounts, login, password reset** → now use [Supabase](https://supabase.com)
  Auth instead of Claude's built-in database. Supabase gives you real
  email-based password reset out of the box (much better than the
  artifact version's workaround).
- **Saved comics** → stored in a Supabase Postgres table (`projects`),
  restricted so each user can only see their own.
- **Downloads** → a plain browser download (click → file saves), no
  platform capability needed.
- **AI art** → calls your deployed backend (`hero-r-comics-backend` on
  Render) directly, since this page isn't sandboxed like the artifact was.
- Character builder, comic panels, and the 4-panel dialogue strip are
  unchanged.

## 1. Set up Supabase (free)

1. Sign up at https://supabase.com and create a new project.
2. Go to **SQL Editor** → New query → paste the contents of
   `supabase-setup.sql` (sent alongside this file) → Run. This creates the
   `projects` table with the right permissions.
3. Go to **Project Settings → API**. Copy:
   - **Project URL**
   - **anon public** key (not the `service_role` key — never expose that one)
4. Open `index.html`, find this near the top of the `<script>` block:
   ```js
   var SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   var SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
   ```
   Replace both with your real values.
5. Optional: by default Supabase requires users to confirm their email
   before they can log in. For quicker testing, go to
   **Authentication → Providers → Email** and turn off "Confirm email" —
   turn it back on before any real users sign up.

## 2. Point it at your AI backend

Near the same config block:
```js
var AI_BACKEND_URL = 'https://hero-r-comics-backend.onrender.com';
```
This should already match your deployed Render URL — update it if that
ever changes.

Note: Render's free tier spins a service down after inactivity, so the
first AI request after a quiet period can take 30–50 seconds to "wake up."
The page waits up to 60 seconds, then falls back to showing the in-browser
character so a slow backend never breaks the flow.

## 3. Deploy this page somewhere

Any static host works. Two easy options:

**Render (same account you already have):**
1. Push this folder (`index.html`, `supabase-setup.sql`, this README) to a
   new GitHub repo, e.g. `hero-r-comics-site`.
2. In Render: **New → Static Site** → connect that repo.
3. Build command: leave blank. Publish directory: `.` (just the root).
4. Deploy. Render gives you a URL like `https://hero-r-comics-site.onrender.com`
   — that's your real, shareable Hero-R Comics site.

**Netlify (drag-and-drop, no GitHub needed):**
1. Go to https://app.netlify.com/drop
2. Drag `index.html` onto the page.
3. It deploys instantly with its own URL.

## About payments and episode 2

Same as before — fill in `STRIPE_PAYMENT_LINK` and `EPISODE2_PRICE` with a
real Stripe Payment Link once you have one. There's still no
payment-verification server, so unlocking Episode 2 after paying is
honor-system (a visitor could tap "I've paid" without paying). A proper
fix adds a Stripe webhook to the backend — ask me when you're ready for
that and I'll add it to `server.js`.
