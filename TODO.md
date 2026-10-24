# MINDSYNC Prototype — Delivery Outcomes

## 1. Truthful empty states and user-created content — Implemented in source; live data not verified

- A fresh database must contain no fake or seeded sessions, placeholder procedure, sample evaluation, sample counts, fake chart, fabricated activity, or prefilled clinical checklist.
- A new researcher workspace must show an intentional empty checklist state such as “No checklists created yet” and a working **Create checklist** action.
- Reports, session history, and evaluation data appear only after actual user interactions create them. Empty reports show useful guidance and no fabricated metrics.
- Do not insert sample rows into Supabase migrations or seed data into the user's Supabase project.

## 2. Researcher checklist management and review metadata — Implemented in source; Supabase setup pending

- Only a signed-in user whose private profile role is **researcher** can create, edit, duplicate, reorder, or archive checklists and steps.
- Researchers enter the checklist title and ordered steps themselves; no clinical procedure or nursing step is prefilled. Steps support title, optional explanatory text, required/optional designation, and optional user-added attention labels. Validate a checklist title and at least one titled step.
- Checklist statuses include **Draft**, **Awaiting Expert Review**, and **Approved for Simulation**. This status is an administrative prototype label, not regulatory approval or proof of clinical safety.
- Checklist content must be reviewed against current institutional protocols by qualified nursing faculty and at least two qualified evaluators as planned in the paper; the app must not claim to verify qualifications.
- Learners can read only active checklists with **Approved for Simulation** status. They cannot create, edit, archive, approve, or restore checklists.
- Confirm archive actions and show useful empty, loading, permission, and database-error states.

## 3. Anonymous learner session workflow — Implemented in source; Supabase setup pending

- Learners can continue using Supabase anonymous sign-in without providing an email or password. The app must not offer public researcher registration or let a user choose or edit their role.
- A learner can start a session from an active approved checklist and may enter an optional anonymous participant ID. Do not collect names, patient identifiers, health records, or other protected health information.
- Keep the Auth identity private. Learners see only their own sessions and feedback; database ownership checks use the authenticated user ID without displaying or exporting that ID.
- Explain that an anonymous session is recoverable only in the same browser while its local Auth session remains. Clearing site storage or changing devices may make that anonymous identity inaccessible, even though the cloud record remains.
- Show one ordered step at a time, a numeric step position, progress, and checklist/review status. A required step must be explicitly marked complete before **Next** is available; never auto-check or auto-advance. Previous navigation preserves completion, learners can correct an accidental completion, and optional steps do not block progression.
- Save session creation, progress updates, pause/resume, completion, and early ending to Supabase. A failed write must show an error and must not claim the change was saved. Ending early requires confirmation and records **Ended incomplete**. A session is complete only after every required step is explicitly completed.
- Provide an accurate summary with checklist title/status, completion state, completed and remaining counts, start/end and elapsed time when available, and next actions. Do not suggest completion proves competence or improved safety. Step notes warn against patient-identifying or sensitive content.

## 4. Usability and acceptability evaluation — Implemented in source; Supabase setup pending

- After a session, offer an optional evaluation with a five-point Likert scale and visible labels from **Strongly disagree (1)** through **Strongly agree (5)**.
- Include ease of use; learnability; clarity of instructions/step labels; tracking completed and remaining steps; whether features worked as expected; and willingness to use a tool like this during supervised skills-lab practice.
- Include optional open-response fields for what worked well, what was confusing/difficult, and what should be improved.
- Save a response only for the signed-in learner and a session owned by that learner. Researchers can read study responses; learners can read only their own. Do not allow client users to change their profile role or write another user's evaluation.
- Do not collect names, contact details, patient data, or other unnecessary identifying information. State that responses are for prototype evaluation and must be managed under approved study consent and data-management procedures.

## 5. Researcher reports and optional exports — Implemented in source; Supabase setup pending

- Researchers can see de-identified operational summaries of actual Supabase session/evaluation records only: session counts and completion states, checklist usage, and aggregated Likert responses.
- In Reports, researchers can view each actual submitted feedback response in the app, including all six ratings with Likert labels and each optional written comment. Keep optional **Feedback CSV** and JSON exports, excluding Auth user IDs, email addresses, and patient fields.
- Learners must not see Reports, other learners' sessions, individual responses, aggregate study results, or exports.
- Reports show a truthful empty state before any actual records exist. Do not present small datasets or operational summaries as statistically significant or as evidence of clinical effectiveness.
- No in-app “clear all cloud data” action is provided. The existing local-data clearing action may clear only legacy browser-local prototype data; it must never delete shared Supabase records.

## 6. Responsive, accessible interface and safety boundaries — Implemented in source

- Preserve the calm, professional, mobile-first healthcare-education visual system, Font Awesome icons, keyboard operation, visible focus, accessible labels, readable contrast, large touch targets, reduced-motion support, and statuses not communicated by color alone.
- Add an accessible sign-in/entry state, loading and connection errors, role-specific navigation, sign-out/switch-user action, and explicit setup guidance without exposing the publishable key or account email in screens.
- Keep the concise persistent notice: **“Simulation prototype only — not for real-patient care. Follow instructor-approved protocols.”** Do not imply clinical validation, error prevention, or improved patient outcomes. The tool supplements, but does not replace, professional nursing judgment, faculty supervision, or institutional protocols.
- Do not include diagnoses, treatment advice, medication functionality, invasive procedure instructions, AI-generated clinical advice, patient profiles, clinical decision support, or clinical integrations.

## 7. Supabase authentication and roles — Implemented in source; owner setup pending

- Use `@supabase/supabase-js` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. If either value or required database setup is missing, show a clear connection/setup state instead of silently falling back to localStorage.
- Researchers use email/password sign-in only. There is no in-app public researcher sign-up and no client-side role assignment. The project owner creates the first researcher Auth user in Supabase and promotes that exact account using a separate owner-run bootstrap SQL file with an email placeholder, not a hard-coded credential.
- Learners use Supabase anonymous sign-in with no email/password. The UI supports starting, retaining in the same browser, signing out, and safely switching identities. Setup instructions state that anonymous sign-in must be enabled in Supabase Auth and CAPTCHA protection is recommended before broad public anonymous access.
- Profiles default to a non-researcher role and cannot be promoted or edited by client users. RLS checks researcher access against the private profile role.

## 8. Supabase schema, persistence, and row-level security — Migration ready; not applied live

- Add versioned migrations for `profiles`, `checklists`, `sessions`, and `evaluations`, including the appropriate profile trigger, timestamp fields, foreign keys, constraints, indexes, and the protected helper used by RLS to check researcher role.
- Enable RLS on every exposed table and use least-privilege grants and policies. The unauthenticated `anon` database role has no access to study tables. Anonymous Auth users are authenticated in Postgres; learner policies verify the `is_anonymous` claim and the current `auth.uid()` owner.
- Researchers can manage checklists and read study sessions/evaluations. Learners read only active approved checklists, create/read/update only their own sessions, and submit/read only their own feedback tied to their own session. Learners cannot read another learner's records, reports, roles, or private checklist-review notes.
- Use no open `using (true)` rule, public feedback table, service-role key, secret key, sample record, or patient field. Auth IDs and account emails are not rendered or exported.
- Replace app data localStorage persistence with a typed async repository that loads role-permitted rows, maps them to existing app types, and reflects a write only after Supabase confirms it. Show actionable database, permission, loading, and save errors.
- Preserve old browser-local records; do not auto-import, overwrite, or delete them. Clearly distinguish legacy local data from new shared cloud records. The clear-local-data control can affect only legacy local storage.

## 9. Vercel configuration and environment setup — Ready; not deployed

- Preserve static Vite deployment using the checked-in pnpm lockfile, `pnpm run build`, and output directory `dist`; no Vercel Function or service-role key is required for the planned browser-client architecture.
- Document that the Vercel project must define `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for each environment it uses, then be redeployed after changes. The values are browser-visible configuration, not secret authorization; RLS protects database access.
- Keep Vercel local linkage files and `.env.local` out of Git. Do not make changes to the user's separate GitHub repository or trigger a deployment without a separate request.

## 10. Supabase migration and setup documentation — Updated; manual setup remains

- Update `README.md` and `SUPABASE_SETUP_TUTORIAL.md` for the approved researcher-login/anonymous-learner model, Vite environment variable names, applying the SQL migration in Supabase, enabling anonymous sign-in, creating/promoting the first researcher, Vercel environment settings, and Auth redirect URLs.
- Include no actual key, database password, or private credential in Git. Keep `.env.example` placeholder-only and `.env.local` ignored.
- State that the user must apply the migration, create/promote a researcher, enable anonymous sign-in, and enter the environment values in Vercel. A successful frontend build alone does not mean the live database is configured or secured.
- Do not claim cross-browser learner recovery for anonymous sessions, automatic migration of local records, configured CAPTCHA, or completed Vercel deployment unless each is actually implemented/configured.

## 11. Build, run, and project declaration — Build checks passed; live flow checks remain

- Use Vite, React, TypeScript, Font Awesome, the Supabase browser client, and the configured WebDev runtime port 3000. Keep the static route manifest accurate for the actual page routes.
- Run configured diagnostics, frozen dependency install, TypeScript check, and production build. Validate generated static artifacts and configuration without exposing user-supplied values.
- Exercise researcher sign-in/role gating, anonymous learner access, checklist management, session progress/resume, feedback submission and Reports/export using only synthetic test data; do not insert or delete test records in the user's live database without explicit approval. Report setup steps that still require the user, and do not publish unless separately requested.
- Verification evidence: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, and an HTTP 200 JSON check of `/manus-routes.json` passed. No live Supabase Auth/RLS/database interaction, browser end-to-end session, or Vercel deployment has been performed.
