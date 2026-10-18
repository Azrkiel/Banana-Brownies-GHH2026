# GitHub accounts and personal sign recognition

The **My signs** screen (`#/training`) uses Supabase Auth with GitHub only.
First sign-in creates the account. Guest calls and the existing local recorder
remain available. Each account has its own saved examples; they do not modify
the shared seven-word forest or train a global model.

## Configure your Supabase project

1. Create a Supabase project. In its SQL editor, run
   [`supabase/migrations/202610180001_personal_signs.sql`](../supabase/migrations/202610180001_personal_signs.sql)
   once. Alternatively apply that migration with the Supabase CLI. Keep RLS
   enabled; do not create a public storage bucket or grant access to anonymous users.
2. In **Authentication → Sign In / Providers → GitHub**, enable GitHub. Copy the
   callback URL shown there (normally
   `https://<project-ref>.supabase.co/auth/v1/callback`).
3. Create a [GitHub OAuth App](https://github.com/settings/applications/new).
   Use your app's homepage, and use the **Supabase callback URL** above for
   **Authorization callback URL**. Copy its client ID and client secret into
   the Supabase GitHub provider settings. Keep that secret out of this repository,
   browser settings, and chat. No GitHub repository scope is requested.
4. In **Authentication → URL Configuration**, set Site URL to your deployed
   frontend origin. Add these exact redirect URLs for the origins you use:

   ```text
   http://127.0.0.1:5173/?auth_callback=github
   http://localhost:5173/?auth_callback=github
   https://signline-api.fly.dev/?auth_callback=github
   ```

   Replace the deployed hostname if using another site. For a Vite base path,
   include that path before `?auth_callback=github`. Avoid wildcard production
   redirects. Complete sign-in in the same browser that initiated it; PKCE stores
   a single-use verifier there.
5. Copy the project URL and **publishable key** from Supabase's project/API
   settings. A legacy **anon** key also works. Create ignored `web/.env.local`
   without overwriting any existing file, with these **public** settings:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Never use a secret/service-role key here; the app refuses those keys.
   Restart Vite after changing these settings. In Codex cloud, these names can
   instead be supplied through environment settings. Permit the exact project
   hostname if cloud network policy restricts it. The project URL/key are still
   pending in the onboarding environment until the user creates the project.

Supabase handles the GitHub client secret and token exchange. The browser uses
the public key plus the user's Supabase JWT. No Supabase service-role key or
backend proxy is needed. Check that new GitHub signups are enabled in the project.
See [Supabase's GitHub guide](https://supabase.com/docs/guides/auth/social-login/auth-github).

## Use and train a personal model

1. Open **My signs** and sign in with GitHub. Enter a short custom sign label.
2. Read and accept the landmark-storage consent, then explicitly start the
   camera. No microphone is requested.
3. Capture the isolated sign over about one second. Review its label, then save
   or discard it. Capture three varied examples, keeping one hand visible.
4. Repeat for at least one different sign. Every included label needs at least
   three examples; incomplete labels prevent training until completed or deleted.
5. The personal nearest-neighbor model builds automatically from saved examples.
   Choose **Test a fresh sign** to check a new capture. Tests stay on the device
   and do not add the test sample to training or report training-set accuracy.
6. In a signer call, choose **Personal signs** under **Your trained signs**, then
   enable recognition. Review the suggestion, add it to the caption, edit if
   needed, and send manually. Calls still require LiveKit configuration.

The model uses the same mirrored, wrist-relative one-hand landmarks for training
and inference: 30 frames × 42 x/y features. It normalizes hand scale and compares
the nearest three saved examples. It requires a neighbor majority, a margin and
absolute distance gates, plus a hand in at least 24 frames. These gates are
heuristics, not measured recognition accuracy. Poor examples, different timing,
lighting or hand choice can reduce performance. This does not recognize arbitrary
ASL, two-handed signs, or continuous signing. Use typed captions when uncertain.

## Privacy, data lifecycle and limits

- The database stores only the label, landmark vector, hand-frame count, UUIDs,
  feature version and timestamp. It receives no raw video/audio. Only explicit
  **Save** uploads a captured example.
- Every row references `auth.users` and belongs to one account. SQL grants
  authenticated users only SELECT, INSERT and DELETE. RLS checks `auth.uid()` on
  each operation. Samples are immutable; UPDATE is not granted. Labels and
  feature dimensions/versions are validated, and the insert trigger bounds
  numbers and serializes a 500-example per-account quota.
- Model weights are the saved examples themselves; no separate artifact or
  remote training job exists. The model rebuilds from the account's examples on
  the training page and when enabling personal recognition in a call. Disable
  and re-enable recognition to fetch examples changed in another session.
- Delete a label's examples or delete all examples after confirmation. Removing
  the Supabase auth account also cascades deletion of its samples. Sign-out and
  account changes dispose private in-memory state and stop owned cameras.
- Camera capture stops on navigation, Stop, consent withdrawal or sign-out.
  Call recognition reuses the call's video and never starts a second camera.
- Up to 500 samples and 64 labels are supported. Use small vocabularies and
  fresh test captures to assess usefulness for a particular signer. There is no
  automatic global data sharing or promise of better accuracy.

## Production build

Vite embeds public project settings in its build. Setting only server runtime
variables after a build will not configure the browser. The Dockerfile accepts
public build args for Fly:

```sh
fly deploy --remote-only \
  --build-arg VITE_SUPABASE_URL=https://<project-ref>.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Use the real public settings and the corresponding redirect origin. This feature
has not been deployed by the implementation task. No paid services are provisioned.

## Validation

From the repository root:

```sh
npm --prefix web test
npm --prefix web run build
npm --prefix web run lint
npm --prefix web run test:accounts
```

`test:accounts` needs Chromium at `/usr/bin/chromium`, or set
`BROWSER_EXECUTABLE` to an installed Chromium executable. It launches and stops
its own Vite instance on port 5188 with explicitly fake public settings. Its
Supabase, GitHub redirect and MediaPipe responses are intercepted, and its camera
is synthetic. It exercises consent, sample capture/save, reload, training, fresh
testing, deletion, cross-tab sign-out, account isolation, PKCE redirects/callback
cleanup and mobile layout. It does not contact a real Supabase project.

The unit suite also applies the actual SQL migration to embedded PostgreSQL
(PGlite), supplies test-only Supabase auth roles/claims, and tests owner access,
cross-account denial, anonymous denial, numeric validation, quota and account
deletion. This validates PostgreSQL policies; live Supabase setup is a separate
check.

After configuration, verify a real GitHub login and sign-out, capture examples
with a real camera, log in from another device to check persistence, and try a
second GitHub account to confirm it starts empty. Verify personal suggestions
in a real two-person call. None of those live checks are claimed by mocked tests.
The canonical ASL roadmap and task 4.5's dependencies remain open in `plan.md`;
this separate account feature does not promote their ledger status.
