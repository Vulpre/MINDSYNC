# MINDSYNC: Supabase and Vercel Setup

This guide sets up the Supabase-backed MINDSYNC prototype and deploys the static Vite app through GitHub and Vercel. The app code is ready for this configuration, but the SQL migration, Auth settings, researcher role, Vercel environment variables, and deployment must still be completed by you. Do not collect real study feedback until you have tested access controls with synthetic data in a separate or staging Supabase project.

## 1. Create a Supabase project

1. Sign in to the Supabase Dashboard and create a project in an organization you control.
2. Choose a region suitable for your study participants.
3. Create a strong database password and keep it in a password manager. Do not put it in the website code, `.env.local`, or a GitHub repository.
4. Wait until the project is ready.

## 2. Copy the browser-safe connection values

In your Supabase project, open **Connect** or the API/project settings and copy:

- **Project URL**, typically `https://<project-ref>.supabase.co`
- **Publishable key**, typically starting with `sb_publishable_`

MINDSYNC uses the Vite variable names `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. A Supabase Publishable key is designed for browser applications; database access is restricted by the migration's row-level security policies. Never use a `sb_secret_` key, database password, or legacy `service_role` key in a `VITE_` variable.

## 3. Apply the MINDSYNC database migration

1. Open **SQL Editor** in the Supabase project.
2. Open `supabase/migrations/20261024_mindsync_schema.sql` from the MINDSYNC project folder.
3. Copy the entire file into a new SQL Editor query and run it once.
4. Confirm the query completed successfully before continuing.

The migration creates the profile, checklist, private review-note, session, and evaluation tables; Auth profile handling; validation and timestamp triggers; limited grants; indexes; and row-level security policies. It does not insert sample checklist, session, or feedback rows. Do not add public read/write policies or service-role keys to the browser app.

## 4. Enable anonymous learner sign-in

In Supabase **Authentication** settings, enable the **Anonymous** sign-in provider. This lets learners start without email or password and associates their records with a Supabase Auth identity saved in that browser. Clearing site storage or switching devices can make that identity inaccessible.

Before allowing broad public anonymous access, consider abuse protections such as CAPTCHA and rate limits. This app currently calls Supabase anonymous sign-in without a CAPTCHA token; if you require a CAPTCHA challenge, the client flow must be extended before learner sign-in will work with that challenge enabled. Do not treat anonymous access as identity verification.

## 5. Create and promote the first researcher

1. In Supabase **Authentication → Users**, create the intended researcher account with an email and password. Do not enable public researcher registration in the app.
2. Open `supabase/bootstrap_researcher.sql` in the project folder.
3. Replace `REPLACE_WITH_RESEARCHER_EMAIL` with the exact email of the Auth user you just created. Preserve the single quotes around the email.
4. Run that script in the same Supabase project's SQL Editor while signed in as the project owner.
5. Store the researcher password securely. The app itself has no role-selection or public sign-up flow.

The bootstrap script promotes only the exact matching existing Auth user. Review the email before running it. Anonymous users receive the learner role by default.

## 6. Configure local development

From the MINDSYNC project root, copy `.env.example` to `.env.local` and replace its placeholders:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_WITH_YOUR_KEY
```

Keep `.env.local` private. It is excluded from Git by `.gitignore` and is intentionally not included in the deployment ZIP. Do not rename these variables to `NEXT_PUBLIC_`; this project uses Vite and reads the `VITE_` names above. After saving them, start the app with `pnpm dev` and open the local Vite site. The app requires the migration and Auth setup; missing configuration is shown as a setup state rather than triggering a local-storage fallback.

## 7. Push the project files to GitHub

Extract the deployment ZIP so `package.json`, `pnpm-lock.yaml`, `vercel.json`, `src/`, `public/`, and `supabase/` are at the repository root (or note the subfolder containing those files). Keep `.env.local`, `.git/`, `node_modules/`, and build output out of Git. Commit and push the source and the placeholder-only `.env.example` to your own GitHub repository.

## 8. Import the repository into Vercel

1. In Vercel, choose **Add New → Project** and import your MINDSYNC GitHub repository.
2. Set **Root Directory** to the folder containing `package.json` and `vercel.json`.
3. Select or confirm the **Vite** framework preset.
4. Confirm the build settings:
   - Install command: `pnpm install --frozen-lockfile`
   - Build command: `pnpm run build`
   - Output directory: `dist`
5. Add the following environment variables in **Settings → Environment Variables** for each environment that should connect to Supabase:
   - `VITE_SUPABASE_URL` — your Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — your Publishable key
6. Save the variables and deploy or redeploy.

Vercel embeds `VITE_` values in browser JavaScript, so they must contain only the project URL and publishable key. Never add a Supabase secret/service-role key or database password. If using Preview deployments, consider connecting them to a separate staging Supabase project; Preview and Production records share a database if you give both environments the same values.

## 9. Set the Supabase Auth site URL

After Vercel provides your production domain, set the Supabase **Site URL** to the exact HTTPS production origin, such as `https://your-project.vercel.app`. Add the local development origin and your actual Vercel production/Preview origins to the allowed redirect URLs if you later use email confirmation, password reset, or another redirect-based Auth flow. Keep allowed origins specific to domains you control.

The current prototype uses direct email/password sign-in for the owner-created researcher account and anonymous learner sign-in; it does not include password reset or public sign-up screens.

## 10. Test access safely before study use

Use a separate/staging Supabase project and synthetic, non-clinical content to confirm that:

- A researcher can sign in, create a checklist, and view reports.
- An anonymous learner can see only active checklists marked **Approved for Simulation**, complete a test session, and optionally submit feedback.
- The researcher can read the resulting feedback, while an unrelated or signed-out user cannot read the records or edit researcher-owned checklists.
- CSV and JSON exports contain only expected study fields and no Auth user IDs or account email addresses.
- An anonymous session can be resumed only in the same browser while that Auth session remains.

Do not test by writing sample records to a production study project. The app has no in-app action for deleting shared Supabase records. A successful Vercel build is not evidence that RLS, Auth, or the study workflow is correctly configured.

## Data and safety boundaries

Do not enter patient names, patient identifiers, health records, or other sensitive information in checklist text, participant IDs, session notes, or feedback comments. Do not use this prototype for real-patient care. Follow instructor-approved protocols and the researchers' approved study consent and data-management procedures. The **Approved for Simulation** status is not clinical or regulatory approval and does not verify reviewer qualifications. The research plan calls for review by at least two qualified nursing evaluators before study evaluation.

The app preserves old browser-local records from the earlier prototype but does not import them into Supabase. Its local-data clearing control affects only those legacy browser records and cannot delete shared Supabase data.
