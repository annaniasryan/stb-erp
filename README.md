# Kalender & Fasilitas Taruna Bangsa

Kalender pendidikan semua unit (TK–SMA) dan booking fasilitas bersama, dengan cek bentrok otomatis.

- **Frontend:** plain HTML/CSS/JS (no build step), hosted on Vercel
- **Database & login:** Supabase (Postgres + Google sign-in)
- **No double booking:** the database itself refuses two bookings of the same facility at overlapping times, even if two people press Save at the same second.

```
index.html        page
styles.css        design
app.js            app logic
config.js         ← Supabase URL + anon key (already filled in)
privacy.html      privacy policy (for Google's consent screen)
favicon.svg
vercel.json       Vercel settings (no build needed)
supabase/schema.sql   ← run once in Supabase
```

---

## Setup (about 30 minutes, one time)

### 1. Create the Supabase project
1. Go to <https://supabase.com> → sign up → **New project**.
2. Name: `kalender-stb`. Region: **Southeast Asia (Singapore)**. Save the database password somewhere safe.
3. Wait until the project finishes setting up.

### 2. Create the database
1. Open `supabase/schema.sql` and edit the two marked lines in section 0:
   - `'tarunabangsa.sch.id'` → your school's email domain (or `''` to allow any Google account)
   - `'annaniasryan@gmail.com'` → the first admin's email
2. In Supabase: **SQL Editor → New query**, paste the whole file and click **Run**. It should say "Success".

### 3. Turn on Google sign-in
1. Go to <https://console.cloud.google.com> (preferably signed in with the school Google Workspace admin account).
2. Create a project → **APIs & Services → OAuth consent screen**.
   - User type **Internal** if you use Google Workspace. Then only school accounts can sign in at all.
   - App name: `Kalender Taruna Bangsa`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URI: `https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback`
     (copy it from Supabase → **Authentication → Sign In / Providers → Google**, which shows the exact callback URL)
4. Copy the **Client ID** and **Client secret** into Supabase → **Authentication → Sign In / Providers → Google**, turn it on and save.

### 4. Connect the app to Supabase
In Supabase → **Project Settings → API**, copy the **Project URL** and the **anon public** key into `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://abcdxyz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  GOOGLE_DOMAIN: "tarunabangsa.sch.id"
};
```

The anon key is safe to publish. The access rules in the database protect the data. **Never** put the `service_role` key in this file.

### 5. Put it on GitHub
1. <https://github.com/new> → repository name `kalender-stb` → Private → Create.
2. Click **uploading an existing file**, drag in all files and folders from this zip, then **Commit**.

### 6. Deploy on Vercel
1. <https://vercel.com> → sign in with GitHub → **Add New… → Project** → import `kalender-stb`.
2. Framework Preset: **Other**. Leave the Build Command empty and the Output Directory as default.
3. Click **Deploy**. You get a URL such as `https://kalender-stb.vercel.app`.

### 7. Tell Supabase your Vercel address
Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://kalender-stb.vercel.app`
- **Redirect URLs:** add `https://kalender-stb.vercel.app/**` (and `http://localhost:3000/**` if you test locally)

Open the Vercel URL, click **Masuk dengan Google**, and you're in as admin.

---

## Who can do what

| Role | Who | Can |
|---|---|---|
| **admin** | listed in `members` | everything: manage facilities, edit or delete any activity |
| **editor** | anyone signed in with the school domain (default) | view all, add bookings, edit or delete **their own** |
| **viewer** | listed in `members` as viewer | view only |

To change someone's access, go to Supabase → **Table Editor → members** → Insert row with `email`, `role` and optionally `unit` (TK/SD/SMP/SMA/YYS, which pre-selects their unit in forms). That's also how you let in someone without a school email, such as a personal Gmail.

To change the allowed domain later, edit **Table Editor → settings**.

## Updating the app
Edit the files in GitHub (or push from your computer). Vercel redeploys automatically within a minute.

## Testing locally (optional)
```
npx serve . -l 3000
```
Then open <http://localhost:3000>.
