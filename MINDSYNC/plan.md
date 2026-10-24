# MINDSYNC Prototype — Supabase Integration Plan

## Product scope

Upgrade the existing responsive MINDSYNC prototype from browser-only persistence to a shared Supabase Postgres database, while deploying the static Vite app through the user's GitHub repository and Vercel. The selected access model is **researcher login plus anonymous learner sessions**. Researchers manage checklists and review aggregated and individual study feedback. Learners do not provide an email or password and can access only their own sessions and feedback. Only instructor-reviewed checklists marked **Approved for Simulation** are available to learners.

Keep the research prototype within its existing simulation-only boundary. Do not collect patient information; include no preloaded procedure content; make no clinical efficacy or safety claims. The app must not present Supabase Auth identities as study participant identifiers. No cloud records are deleted by the existing local-data clearing action.

## Implementation approach

- **Frontend/deployment:** Retain the Vite + React + TypeScript app and static Vercel deployment. Use `@supabase/supabase-js` from the browser with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Map the values the user supplied under `NEXT_PUBLIC_` names to the Vite variable names. Keep the project URL and publishable key in an ignored `.env.local` for local development; do not put them in source or commit the file. The publishable key is intended for browser use; never use a secret/service-role key in the client. Vercel users must add the same two browser-safe values in project environment settings after syncing the code to GitHub.
- **Authentication:** Add a sign-in gate. The researcher interface supports email/password sign-in only; do not provide public researcher registration or researcher role editing in the app. Authorized learners use Supabase anonymous sign-in without email. Persist the Supabase session in the same browser so an anonymous learner can resume there; explain that clearing browser storage or switching devices loses access to that anonymous identity. Include sign-out and a safe switch-user flow. The app requires the owner to create the first researcher account in Supabase and promote that exact account with a one-time bootstrap SQL statement; there is no hard-coded email/password.
- **Database and ownership:** Add repeatable SQL migrations under `supabase/migrations/` for `profiles`, `checklists`, `sessions`, and `evaluations`, matching the existing TypeScript records. A profile trigger gives new users a non-researcher role by default. A guarded helper function allows policies to test researcher status without exposing or allowing users to edit their role. Researchers can create, edit, archive, and read all checklists and can read all session/evaluation data. Learners can read only active approved checklists, create and update only their own session records, and submit/read only their own evaluation responses associated with their own session. User IDs and account emails are never displayed or included in reports/exports.
- **Row-level security:** Enable RLS on every exposed table and write separate least-privilege grants/policies for the required actions. The public/`anon` database role receives no access to study tables. Anonymous Auth users are authenticated users in Postgres, so policies must also verify the JWT `is_anonymous` claim for learner-specific actions. Researcher access is checked against the private profile role. Include a separate one-time SQL bootstrap file with an email placeholder; it only promotes an Auth account selected by the project owner. Do not add sample rows, open `using (true)` policies, or include the Supabase secret key.
- **Application data access:** Replace synchronous localStorage-as-source-of-truth with a typed asynchronous Supabase repository. Load data according to the signed-in role; save edits only after successful database writes; show actionable loading, connection, permission, and save errors. If Supabase environment variables or the migration are missing, show a setup/error state instead of silently falling back to local-only mode. Keep the old localStorage data intact and offer no automatic migration or deletion of those legacy records. `Clear local data` is explicitly limited to old browser-local data and cannot delete shared cloud records.
- **Role-specific app UI:** Researchers see the educator workspace, checklist management, all sessions, reports, individual responses, CSV/JSON exports, and privacy/sign-out controls. Anonymous learners see only approved checklists, their own session history and progress, the feedback form, and privacy/sign-out controls; they never see Reports or other learners' records. Starting a learner session obtains/uses an anonymous Supabase session before inserting a session row.
- **Supabase setup and Vercel:** Keep the `vercel.json` static build settings and root route manifest. Update README and the step-by-step tutorial with the user's GitHub-to-Vercel import path, local `.env.local` variables, dashboard environment-variable names, applying the migration in Supabase SQL Editor, creating/promoting the first researcher account, enabling anonymous sign-in, and Auth redirect URL setup. The user owns syncing these changes into their separate GitHub repo, running the SQL in their Supabase project, and adding Vercel environment settings. CAPTCHA protection is recommended before broad public anonymous access; do not pretend it has been configured without the needed provider settings.
- **Compatibility and safety:** Keep the existing learner checklist progression, pause/resume, review, completion/incomplete states, evaluation questions, and readable in-app feedback display. Preserve all local data already saved in the browser; do not migrate, overwrite, or delete it automatically. Keep the concise persistent simulation notice and do not add clinical content, patient fields, or private identifiers to exports.

## Design direction

**Chosen direction: Swiss clinical editorial**, preserved from the approved implementation plan.

- **Design Movement:** Swiss International Typographic Style adapted to a friendly clinical-learning tool.
- **Core Principles:** explicit hierarchy; calm, precise microcopy; checklist states always legible; touch-first, low-friction interactions.
- **Color Philosophy:** warm off-white backgrounds and ink navy keep the workspace composed; a distinct teal accent marks forward action and progress; muted amber indicates review-needed; red is reserved for destructive confirmation and errors.
- **Layout Paradigm:** an asymmetric two-zone workspace: a narrow persistent navigation rail on desktop and a focused reading/action column on the right; on mobile, collapse navigation into a bottom bar/menu and keep the active task as the primary column. Avoid dense dashboard grids.
- **Signature Elements:** the custom interlocking-loop/check MINDSYNC mark; a slim progress ruler with numbered steps; small status chips with both icon and explicit label.
- **Interaction Philosophy:** interactions affirm user intent; checklist completion is explicit; progression is never automatic; pause and resume preserve context; destructive actions require confirmation.
- **Animation:** restrained 120–180 ms opacity/position transitions for navigation and confirmations; reduced-motion preference disables nonessential movement; never animate progress in a way that masks state changes.
- **Typography System:** system sans-serif for body/UI with a restrained serif display treatment for a few page headings; maintain large step text and clear 12/14/16/24/32 px scale. Avoid depending on a remote font service.
- **Brand Essence:** “A clear, user-controlled checklist companion for nursing skills-lab practice”; precise, reassuring, practical.
- **Brand Voice:** concise and encouraging, never clinical-authoritative. Examples: “Create the checklist your instructor reviewed.” “Your progress is saved to your MINDSYNC workspace.”
- **Wordmark & Logo:** custom wordmark paired with a small linked-loop mark whose center resolves into a check, drawn with CSS/SVG rather than an off-the-shelf logo.
- **Signature Brand Color:** deep teal, used selectively for the MINDSYNC mark and primary action.

## Project structure

- `src/auth/` — Supabase session state, researcher role lookup, sign-in, anonymous learner entry, sign-out, and role gate.
- `src/components/` — existing reusable accessible controls plus loading/connection/setup states and the sign-in screen.
- `src/features/checklists/` — existing checklist library/editor with remote persistence and researcher-only mutations.
- `src/features/sessions/` — learner-owned remote session creation, progress updates, history, resume, and summary.
- `src/features/evaluations/` — optional feedback submission linked to the current learner-owned session.
- `src/features/reports/` — researcher-only real-data summaries, individual response viewer, and CSV/JSON export.
- `src/lib/supabaseClient.ts` — browser client from the public URL and publishable key.
- `src/lib/repository.ts` — typed, role-aware database reads/writes and response-to-domain mapping.
- `src/lib/storage.ts` — retain legacy localStorage reading/export/clear only; no silent cloud fallback.
- `src/types.ts` — shared domain types for the existing checklist/session/evaluation model and access roles.
- `supabase/migrations/` — versioned schema, triggers, grants, RLS policies, and protected helper functions.
- `supabase/bootstrap_researcher.sql` — owner-run, parameterized first-researcher role assignment with no embedded credential.
- `.env.example` — placeholder-only local environment template; `.env.local` remains ignored.
- `README.md`, `SUPABASE_SETUP_TUTORIAL.md` — setup, access model, migration, Vercel/GitHub steps, privacy limits, and current deployment state.
- `vercel.json` — static Vite build declaration; the required static route manifest declares `/` for the one-page app.

## Serving and implementation boundary

The app remains a static Vite frontend; Supabase Auth and the PostgREST Data API provide the hosted identity and database through the publishable key, with Postgres RLS as the authorization boundary. No Vercel Function or Supabase secret key is required for the planned browser operations. The Vercel production deployment must use the same Project URL and Publishable key as local development. The project's Supabase schema and Vercel environment settings are external steps that the user must apply; no live database data will be inserted, changed, or deleted as part of code implementation without confirming setup and the test-data plan.

## Scope boundaries

Do not trigger publication from this workspace or make changes to the user's separate GitHub repository unless separately requested. Do not add patient information, procedure content, diagnoses, treatment or medication advice, clinical decision support, or real-world clinical integrations. Do not auto-migrate browser-local data, seed the database, make feedback publicly readable, or expose a secret/service-role key. The app remains a research prototype for supervised simulation, not a clinical records system or validated clinical tool.
