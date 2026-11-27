# Deploying Ancog Apartment

Going live, in order. Steps marked **(you)** need your own accounts; nothing here is done
automatically. Keep every key and password out of the repo: **the repo is public**.

## 1. Choose the host (you)

The app is a standard Next.js 16 server (`next build` + `next start`). It uses Cache
Components, `after()`, the proxy and a service worker.

| Option                                                                            | Cost        | Notes                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel Pro**                                                                    | US$20/month | Made by the Next.js team, so every feature works without setup. **Vercel Hobby (free) is for non-commercial use only**, and collecting rent is commercial, so Hobby is out. |
| A small server or container running `next start` (Railway, Render, Fly.io, a VPS) | ~US$5/month | Exactly what CI and the browser tests run. You keep it updated and set up HTTPS (most platforms do HTTPS for you).                                                          |
| Netlify / Cloudflare free plans                                                   | Free        | Commercial use is allowed, but they run Next.js through adapters. Check that Cache Components and `after()` work there before choosing.                                     |

Whichever you choose: a Singapore region is closest to Davao for both the app and Supabase.

## 2. Production database (you, then one command)

1. Create a Supabase project at <https://supabase.com/dashboard>, region **Southeast Asia
   (Singapore)**. Save the database password in your password manager.
2. **Authentication → Sign In / Providers:** turn **off** “Allow new users to sign up”
   (only admins create logins). **Authentication → URL Configuration:** set the Site URL
   to the app's address, e.g. `https://ancog.example.com`.
3. Push the schema (migrations only; the demo seed is **not** pushed):

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

   This also schedules the database jobs (`pg_cron`): daily billing (00:05 Manila),
   the overdue summary (00:10) and push dispatch (every 5 minutes).

## 3. Environment variables in the host (you)

Generate new VAPID keys and a new dispatch secret for production (don't reuse local ones):

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

| Variable                        | Where it comes from                       | Secret?                                    |
| ------------------------------- | ----------------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API         | no                                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same (anon / publishable key)             | no                                         |
| `SUPABASE_SERVICE_ROLE_KEY`     | same (service_role / secret key)          | **yes. Server only, never `NEXT_PUBLIC_`** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | `publicKey` from the command above        | no                                         |
| `VAPID_PRIVATE_KEY`             | `privateKey`                              | **yes**                                    |
| `VAPID_SUBJECT`                 | `mailto:` plus an email address you check | no                                         |
| `PUSH_DISPATCH_SECRET`          | the random string                         | **yes**                                    |

Mark the secret ones as secret or encrypted in the host's settings. Deploy, then open the
site and check that `/login` loads over HTTPS.

## 4. Connect the database to the app (one SQL statement)

In Supabase → SQL Editor, so the 5-minute job can ask the app to send push notifications:

```sql
insert into private.push_dispatch (url, secret)
values ('https://<your-app>/api/push/dispatch', '<PUSH_DISPATCH_SECRET>');
```

## 5. Rooms, admins and the notebook

Make a file named **`.env.remote`** (git ignores it) with the production
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The `remote:` scripts use it.
Next.js never reads `.env.remote`, so a local build or test run can't touch production by
accident.

```bash
# 13 rooms with their rent (and meter serials if you have them)
cp imports/templates/rooms.csv imports/private/rooms.csv    # then edit the rents
npm run remote:setup-rooms -- --file imports/private/rooms.csv            # dry run
npm run remote:setup-rooms -- --file imports/private/rooms.csv --commit

# The 2 admin accounts; each prints a one-time password to share in person
npm run remote:create-admin -- --email <admin email> --name "<Full Name>"

# The notebook (imports/README.md): dry run until every balance says ✓ matches, then commit
npm run remote:import-notebook -- --dir imports/private
npm run remote:import-notebook -- --dir imports/private --commit --received-by <admin email>
```

Then sign in as an admin, choose a new password, and fill in **Settings**: the GCash name,
number and QR, the receipt signature, and the meter serials. **Delete `.env.remote`** when
you're done.

## 6. Backups (you, about 15 minutes)

`.github/workflows/backup.yml` runs every Sunday at 02:00 Manila. It dumps the database
(roles, schema, all data including logins), optionally copies the storage files, encrypts
everything with your passphrase (GPG, AES-256), and uploads it to **your own private
S3-compatible bucket**. It never stores anything in GitHub, because the repo, its logs and
its artifacts are public. Until it's set up, it skips with a warning.

1. Create a private bucket. Cloudflare R2's free tier (10 GB) is plenty; Backblaze B2 or AWS
   S3 work too. Create an API token that can write **only to that bucket**. Add a lifecycle
   rule that deletes files after about 6 months.
2. Make a long backup passphrase and save it in your password manager. **Without it, the
   backups can't be opened.**
3. GitHub → repo → Settings → Secrets and variables → Actions:

   | Kind     | Name                          | Value                                                                                                                            |
   | -------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
   | Secret   | `SUPABASE_DB_URL`             | Supabase → Connect → **Session pooler** connection string, with the password (GitHub's machines can't reach the direct IPv6 one) |
   | Secret   | `BACKUP_PASSPHRASE`           | the passphrase                                                                                                                   |
   | Secret   | `BACKUP_S3_ACCESS_KEY_ID`     | the bucket token's access key                                                                                                    |
   | Secret   | `BACKUP_S3_SECRET_ACCESS_KEY` | the bucket token's secret                                                                                                        |
   | Variable | `BACKUP_S3_ENDPOINT`          | e.g. `https://<account-id>.r2.cloudflarestorage.com`                                                                             |
   | Variable | `BACKUP_S3_BUCKET`            | the bucket name                                                                                                                  |
   | Variable | `BACKUP_S3_REGION`            | optional (`auto` for R2)                                                                                                         |

   **Storage files too (recommended):** Supabase → Storage → S3 Connection → create access
   keys, then add the variables `SUPABASE_S3_ENDPOINT` and `SUPABASE_S3_REGION` and the
   secrets `SUPABASE_S3_ACCESS_KEY_ID` and `SUPABASE_S3_SECRET_ACCESS_KEY`. Without them,
   meter photos, payment screenshots, receipt PDFs and the settings images aren't backed
   up (receipt PDFs can be made again from the data).

4. Actions → **Weekly backup** → **Run workflow**, and check the file appears in the bucket.

**Restoring** (practise once, into a spare Supabase project):

```bash
gpg -d ancog-YYYY-MM-DD-HHMM.tar.gz.gpg | tar -xzf -     # asks for the passphrase
psql "<new project's session pooler URL>" \
  --single-transaction -v ON_ERROR_STOP=1 \
  -f roles.sql -f schema.sql \
  -c 'SET session_replication_role = replica' -f data.sql
```

Then upload the `storage/<bucket>/` folders back into the buckets with the same names.

## 7. Keep the free Supabase project awake (you, 2 minutes)

Free projects pause after a week without activity. `.github/workflows/keep-alive.yml`
reads one row through the API on Mondays and Thursdays. Add two repository **variables**
(not secrets: both are already public in the app's pages): `SUPABASE_URL` and
`SUPABASE_ANON_KEY`.

> GitHub turns off scheduled workflows in a public repo after 60 days without commits and
> sends an email when it does. If that happens, re-enable **Weekly backup** and **Keep
> Supabase awake** under Actions.

## 8. Final checks on real phones (you)

- [ ] Sign in as each admin and change the temporary password
- [ ] Android Chrome: **Install app** → opens full screen; notifications on
- [ ] iPhone Safari: Share → **Add to Home Screen** → open from the Home Screen; notifications on
- [ ] A tenant signs in, sees their bills, sends a small GCash payment; the admin confirms it
- [ ] The next morning: daily billing ran (Dashboard), and the overdue summary arrived
- [ ] The first Sunday backup is in the bucket
