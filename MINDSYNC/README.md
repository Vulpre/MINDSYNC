# MINDSYNC Clinical Checklist Prototype

MINDSYNC is a responsive research prototype for supervised nursing skills-lab simulations. Researchers create and manage checklists; learners use anonymous Supabase Auth sessions to work through approved checklists, pause and resume, and optionally submit usability feedback. Researchers can view real feedback in the app and export CSV or JSON. The first installation has no sample checklists, sessions, evaluations, or fabricated report metrics.

The app code is integrated with Supabase, but it is not connected to or configured in your Supabase project until you apply the migration and complete the setup below. A successful Vercel build does not confirm that your database or access policies are configured.

## Run locally

Requirements: Node.js 20 or newer and pnpm 11.25.0.

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` to your Supabase Project URL and `VITE_SUPABASE_PUBLISHABLE_KEY` to your Supabase Publishable key. Do not use a secret or service-role key.
3. Complete the Supabase setup in [SUPABASE_SETUP_TUTORIAL.md](SUPABASE_SETUP_TUTORIAL.md), including applying the migration and enabling anonymous Auth.
4. Run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm dev
```

The Vite development server listens on port 3000. The app will show a connection/setup state if the environment values or required Supabase database setup are missing; it does not silently switch to local-only storage.

## Deploy to Vercel from GitHub

The project is a static Vite site. Import the GitHub repository containing `package.json`, `pnpm-lock.yaml`, and `vercel.json` at its root. Use the following settings if Vercel does not detect them automatically:

- Framework preset: **Vite**
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm run build`
- Output directory: `dist`

In the Vercel project's Environment Variables, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for each environment that should connect to Supabase. Redeploy after changing variables. Consider using a separate Supabase project for Preview deployments so test activity is kept separate from production. Never add `sb_secret_`, database passwords, or `service_role` keys to Vercel browser variables.

The included [Supabase setup tutorial](SUPABASE_SETUP_TUTORIAL.md) explains project setup, applying the SQL migration, creating the first researcher account, enabling anonymous learner sign-in, environment variables, and Auth URL settings. No deployment is performed by this repository package.

## Data and privacy

Shared checklists, session progress, and submitted feedback are stored in the configured Supabase project. Anonymous learner access is tied to the browser's persisted Supabase Auth session. Clearing site storage or switching devices may make that anonymous identity inaccessible; existing cloud records are not automatically deleted. Old data from the earlier local prototype is not imported into Supabase. **Data & privacy** can download or clear only those legacy browser-local records, never shared Supabase records.

Researchers can see operational summaries and actual learner-submitted feedback. CSV/JSON exports exclude Auth user IDs and account email addresses. Participant IDs and free-text comments are user-entered, so do not put names, patient identifiers, health records, or other identifying or sensitive information in them. Browser-visible Supabase configuration is not an authorization boundary; the database's row-level security policies control access.

## Safety and research-content limitations

**Simulation prototype only — not for real-patient care. Follow instructor-approved protocols.** MINDSYNC is not clinically validated and does not replace nursing knowledge, professional judgment, faculty supervision, or institutional protocols. It contains no clinical procedure steps, medication features, diagnoses, treatment advice, clinical decision support, patient profiles, or real-world clinical integrations. It does not establish that checklist use prevents errors or improves patient outcomes.

The research team must select the procedure, prepare content from current institutional protocols, and have it reviewed by qualified nursing faculty before study evaluation. The research plan calls for review by at least two qualified evaluators. The app's **Approved for Simulation** status is an administrative label only; it does not verify reviewer qualifications or establish clinical or regulatory approval. Collect feedback only under the study's approved consent and data-management procedures.

Before collecting real study feedback, apply the Supabase migration and test researcher and learner access in a separate/staging project using synthetic information. Anonymous sign-in should be protected appropriately before broad public access; this package does not configure CAPTCHA.
