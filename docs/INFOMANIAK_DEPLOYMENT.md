# Infomaniak production deployment

Validated on 2026-11-08: isolated dependency installation and production build
through the Manager Builder, followed by a site execution-path switch.

## Latest deployment: 2026-11-24

- Deployed source: `main`, commit `50e1037` (clean worktree; `git archive HEAD`
  reproduces the release source). Transport workflow overhaul, factsheet
  location/shipment changes and Viewer client visibility.
- Active Manager path: `/artmuse-staging-20261124-gpW1PA`.
- Active SSH path: `/srv/customer/artmuse-staging-20261124-gpW1PA`.
- Previous Manager path retained for rollback:
  `/artmuse-staging-20261123-tO06WQ`.
- Complete previous-release backup:
  `/srv/customer/artmuse-backup-20261124-9wYn8W/active-release.tar`,
  server SHA256
  `1fd7cd9ae2f59c14ed3dcc10ab9436b5854b580712587822594200de8cfcae54`.
  Archive readability and required environment, dependency and build entries
  were checked before proceeding. Confirming the off-server private copy at
  `%USERPROFILE%\ArtMuse-private-backups\20261124\active-release.tar` against
  that SHA256 remains a follow-up item.
- Source archive: `artmuse-worktree-20261124.zip`, 657 source files, without
  environment files, dependencies or generated output. Local and uploaded
  ZIP SHA256 matched:
  `2f2a8def3ccbd1d4afa08c60cf1c9a6cb0b28b769a0f10cb575b0cf5253daa37`.
- Isolated Builder installation (645 packages, 44 s) and compilation reported
  `STAGING_INSTALL_OK` and `STAGING_BUILD_OK` with no errors or warnings.
  Automatic reinstallation was **No**, and preparation wrappers ended with
  `exit 1`. Logs are in the backup directory as `candidate-install.log` and
  `candidate-build.log`.
- The user chose to skip the candidate smoke test on port 3001 entirely;
  the first startup validation happened after the production switch.
- An Administrator saved the English release notes on
  Home > Management > Updates before the switch.
- Runtime retained: Node 20, `node server.js`, port 3000, build command `true`.
  After the switch, public `/login` returned HTTP 200 (Next.js headers).
  Authenticated business workflows were verified by the user, not independently.
- Release checks: 103 test files / 1017 tests passed, TypeScript passed, and
  the isolated local production build succeeded. Supabase migrations
  `20261123190000_viewer_client_visibility.sql`,
  `20261124160000_add_quote_requested_date.sql`,
  `20261124161500_allow_editor_delete_location_history.sql` and
  `20261124164500_move_destination_to_location.sql` were applied separately
  before deployment; restoring the previous release path does not revert them.

The directory above is now active production. Never reinstall dependencies or
rebuild there. Preserve the previous release and backup for rollback.

## Previous deployment: 2026-11-23

- Deployed source: `e9349dabb08ad7bca34db7b36b72fe81a93b51eb`
  (Viewer access to all current and future clients). The release was packaged
  before committing; all 485 source files were subsequently compared with the
  clean worktree. Only the local, development-generated `next-env.d.ts` differed;
  that file was restored to the committed release version before committing.
- Active Manager path, independently checked after the restart:
  `/artmuse-staging-20261123-tO06WQ`.
- Active SSH path: `/srv/customer/artmuse-staging-20261123-tO06WQ`.
- Previous Manager path retained for rollback:
  `/artmuse-staging-20261122-R3OUOz`.
- Complete previous-release backup:
  `/srv/customer/artmuse-backup-20261123-clzbDt/active-release.tar`.
  The private off-server copy at
  `%USERPROFILE%\ArtMuse-private-backups\20261123\active-release.tar`
  matched SHA256
  `e7fea3c1d201893aab33533463732c00cd06c621dccdf11e3451bc5750390abd`.
- Source archive: `artmuse-viewer-release.zip`, 485 source files, without
  environment files, dependencies or generated output. Local and uploaded
  ZIP SHA256 matched:
  `6976003f7ef964b550a4a4ea6cdc31a313d511b900924f1dea757a0a0bb36f27`.
- Isolated Builder installation (645 packages) and compilation reported
  `STAGING_INSTALL_OK` and `STAGING_BUILD_OK`. Automatic reinstallation was
  **No**, and preparation wrappers ended with `exit 1`. Logs are in the backup
  directory as `viewer-install.log` and `viewer-build.log`.
- Candidate `/login` returned HTTP 200 on port 3001. The user chose to skip
  authenticated candidate validation through an SSH tunnel.
- The user confirmed that an Administrator saved the English Updates notes
  and that a non-administrator could read them without editing.
- Runtime retained: Node 20, `node server.js`, port 3000, build command `true`.
  After the switch, public `/login` and all of its script assets returned
  HTTP 200. The user initially reported a normal-browser loading failure,
  while private browsing worked, and then confirmed success after reloading
  with browser caching disabled. Full authenticated business workflows and
  a real Viewer all-client grant were not independently verified.
- Release checks: 101 test files / 998 tests passed, TypeScript passed, and
  the isolated local production build succeeded. The user applied Supabase
  migration `20261123170000_viewer_all_clients.sql` separately before deployment;
  restoring the previous release path does not revert it.
- Remote follow-up remains to confirm stopping the port-3001 test process and
  removing the mistakenly uploaded backup `active-release.tar` from the active
  release root, while retaining the verified backups outside the release.

This directory was replaced as production by the 2026-11-24 release above.
It is retained as the rollback target; do not reinstall or rebuild in it.

## Previous deployment: 2026-11-22

- Deployed source: `main`, commit `c5d7f4e` (clean worktree; `git archive HEAD`
  reproduces the release source).
- Active Manager path, confirmed by the user:
  `/artmuse-staging-20261122-R3OUOz`.
- Active SSH path: `/srv/customer/artmuse-staging-20261122-R3OUOz`.
- Previous Manager path retained for rollback:
  `/artmuse-staging-20261115-kCLsXz`.
- Complete previous-release backup:
  `/srv/customer/artmuse-backup-20261122-vSYG1q/active-release.tar`.
  The private off-server copy at
  `%USERPROFILE%\ArtMuse-private-backups\20261122\active-release.tar`
  matched SHA256
  `acf105dfc4dfa355fb72c13633b552b9313312409360a93d8c07d22571ba9f00`.
  Archive readability and required environment, dependency and build entries
  were checked before proceeding.
- Source archive: `artmuse-worktree-20261122.zip`, 644 source files (Outlook
  auction meetings, Art Market layout, header nav, pending-invoice alerts,
  Updated page 7-day filter), without environment files or generated output.
  Local and uploaded ZIP SHA256 matched:
  `661a8a919e3c627a7067c82c126ed8702b0cf41fc80401af67f31fbd7ca254c9`.
- Builder installation (645 packages, ~2 min) and compilation reported
  `STAGING_INSTALL_OK` and `STAGING_BUILD_OK`. The user confirmed automatic
  reinstallation was **No** for both commands, with `exit 1` preventing an
  active-site restart. Logs are in the backup directory as
  `candidate-install.log` and `candidate-build.log`.
- Candidate startup was verified on port 3001 (`/login` HTTP 200) and the user
  validated the application visually through an SSH tunnel (Art Market Outlook
  button, menus, bell badge, Home banner, Updated page).
- An Administrator reviewed and saved the English release notes on
  Home > Management > Updates before switching.
- Runtime retained: Node 20, `node server.js`, port 3000. The user restored the
  build command to `true`, switched the site location, restarted once and
  confirmed production sign-in and key pages over HTTPS.
- Release checks: 993 tests, TypeScript and `git diff --check` passed; a local
  production build succeeded. The Supabase migration
  `20261122191000_add_market_auction_city.sql` had been applied separately
  before this file deployment; restoring the previous release path does not
  revert it.

This directory was replaced as production by the 2026-11-23 release above.
It is retained as the rollback target; do not reinstall or rebuild in it.

## Previous deployment: 2026-11-15 (2026-11-16 UTC)

- Deployed source: the current `main` worktree, including uncommitted changes
  and new files, based on `011e4688062c55df74e588d1e42ebbb908ae13f8`.
  `git archive HEAD` alone does not reproduce this release. Retain the source ZIP.
- Active Manager path, confirmed by the user:
  `/artmuse-staging-20261115-kCLsXz`.
- Active SSH path: `/srv/customer/artmuse-staging-20261115-kCLsXz`.
- Previous Manager path retained for rollback:
  `/artmuse-staging-20261114-OelyVn`.
- Complete previous-release backup:
  `/srv/customer/artmuse-backup-20261115-5V97KV/active-release.tar`.
  The private off-server copy at
  `%USERPROFILE%\ArtMuse-private-backups\20261115-b50ef3b3\active-release.tar`
  matched SHA256
  `c266f4ab41b19ac253b6306bce93b2d6f9c51fd30a624bea304783c2186c9661`.
  Archive readability and required environment, dependency and build entries
  were checked before proceeding.
- Source archive: `artmuse-worktree-20261115.zip`, containing 473 source files,
  including the new Updates page and migrations, without environment files or
  generated dependencies/build output. Local and uploaded ZIP SHA256 matched:
  `85da05dc5b2e40ad8bf8b657b11d326931204cb6cd36ec987ab9e56ec5ad1100`.
  The tested local source files still matched the packaging manifest.
- Builder installation and compilation reported `STAGING_INSTALL_OK` and
  `STAGING_BUILD_OK`. The user confirmed automatic reinstallation was **No**
  for both commands, with `exit 1` preventing an active-site restart.
  Logs are in the private backup directory as `candidate-install.log` and
  `candidate-build.log`.
- Candidate startup was verified through an SSH tunnel on port 3001. Its login
  and application page shells returned HTTP 200; `/api/me` reported
  `loggedIn: false` without credentials, as implemented.
  The user validated grouping, factsheet order, auction dates and images.
- An Administrator reviewed and saved Updates before switching; persistence was
  independently verified at `2026-11-16 03:06:14.046756+00`.
  The user confirmed a non-administrator could read it without edit controls.
- Runtime retained: Node 20, `node server.js`, port 3000. The user confirmed
  restoring the build command to `true`, explicitly approved the switch, then
  confirmed saving the new path and restarting once.
- Production HTTPS login returned HTTP 200. The live Updates bundle
  `page-9440d55eb4b9d1fd.js` matched the candidate's SHA256:
  `f92d8bc102a24e42fb065c5cc02447b9c32b46fbb1b496068725a34d332d7d51`.
  The user confirmed production sign-in, Updates, proposal/factsheet sorting,
  images, filters and navigation checks. The test server was stopped;
  a remote connection to port 3001 was independently refused.
- Release checks: 77 focused tests, TypeScript and `git diff --check` passed.
  Supabase migrations had already been applied separately before this file
  deployment; restoring the previous release path does not revert them.

This directory was replaced as production by the 2026-11-22 release above.
It is retained as the rollback target; do not reinstall or rebuild in it.

## Previous deployment: 2026-11-14

- Deployed source: `main`, commit `011e4688062c55df74e588d1e42ebbb908ae13f8`.
- Active Manager path, as confirmed by the user: `/artmuse-staging-20261114-OelyVn`.
- Active SSH path: `/srv/customer/artmuse-staging-20261114-OelyVn`.
- Previous Manager path retained for rollback: `/artmuse-staging-20261112-iiQUtU`.
- Complete previous-release backup:
  `/srv/customer/artmuse-backup-20261114-pXt6Fq/active-release.tar`.
  An off-server copy was verified against SHA256
  `0de4c1b93c203d7d5c374f291ce6b09134255475685f62be4220ac8e7bc00347`.
- Source ZIP SHA256:
  `84300373f2eb4620372ea00e89f3e4dc10e0fbf86cc0a29fd6694ff91c58998c`.
- Builder installation and compilation reported `STAGING_INSTALL_OK`
  and `STAGING_BUILD_OK`. Candidate `/login` returned HTTP 200 on port 3001;
  the candidate test process was then stopped.
- Runtime retained: Node 20, `node server.js`, port 3000. The user confirmed
  the build command was restored to `true` before switching.
- The user confirmed the production restart, sign-in, images and the corrected
  sale date. `https://artmuse.ch/login` independently returned HTTP 200 after
  the switch. Other authenticated business workflows were not verified.

Recheck the active path in the Manager before the next deployment. Never install
dependencies or rebuild in the active directory listed above.

## Safety rules

- Never install dependencies or build in the active release directory.
- Read the active path from Manager > Advanced > General before each deployment.
  After a switch, the previous staging directory is the active production release.
  Do not assume `/sites/artmuse.ch` is still active.
- Retain the previous complete release and a verified off-server backup.
- Keep Node upgrades, SSL/DNS changes and Supabase migrations separate.
  File rollback does not reverse database migrations.
- Use the Node.js SFTP connection shown in the Manager, not the Apache/PHP
  connection. Verify the SSH host key through a trusted source.
- Do not use `rollback-prod.ps1` for this workflow: it targets the old fixed
  directory and uses in-place restoration rather than release switching.

## Working from either Windows PC

Keep this guide and the source code in the repository. Retrieve the same approved
commit on each PC; check for local uncommitted changes before packaging.
Do not overwrite another PC's work during synchronization.

Install Node/npm, Git, an archive tool and WinSCP (SFTP) on the deployment PC.
Use paths relative to the checkout in future automation rather than a fixed
Windows user directory. Obtain production credentials through the approved secure
channel; never commit them or sync environment files through Git.

The deployment archive must contain the intended current source files, including
new files, `package.json`, `package-lock.json`, `server.js`, Next.js/TypeScript/
PostCSS configuration, application assets and required runtime scripts.
Exclude `.git`, `.env*`, private keys, logs, local backups, `node_modules`, `.next`
and other generated output. Windows dependencies/builds must not be uploaded as
Linux release artifacts. Validate the archive file list before upload.

## 1. Back up the active release

Record the Manager execution path and current Node version, launch command,
port and build command. Map the Manager path to the actual SSH path under
`/srv/customer`; verify it before proceeding.

Create a private backup directory outside the active site with `mktemp -d`.
Its template requires six uppercase `X` characters. Save the exact returned
path; shell variables do not survive a new SSH session.

Create an uncompressed tar archive of the complete active release, including
hidden configuration, installed dependencies and `.next`. Use `umask 077`.
Do not edit or deploy into that release during the copy; mutable uploads/caches
may require a separate consistent backup strategy.

Verify archive readability with `tar -tf`, and check for:

- `.env.production`
- `package.json` and `package-lock.json`
- `.next/BUILD_ID`
- `node_modules/next/package.json`

Download through SFTP to a private local directory outside cloud-synced folders.
Compare `sha256sum` on the server with Windows
`Get-FileHash -Algorithm SHA256 -LiteralPath '<local archive path>'`.
Store the backup securely: it contains production secrets.
Archive readability and matching checksums verify transfer integrity, not a
complete disaster-recovery test. Supabase and external document storage need
their own backups.

## 2. Prepare a new release

Create a unique private directory such as
`/srv/customer/artmuse-staging-<date>-XXXXXX` using `mktemp -d`.
Upload the source archive, compare its SHA256, then extract only in that new
directory. Verify `pwd`, `package.json`, `package-lock.json` and `server.js`.

Copy `.env.production` from the currently active release without overwriting an
existing staging file, then set its permissions to `600`. Do not display its
contents. Check whether additional runtime configuration is required; copying
one environment file is not a guarantee that all configuration is complete.

The successful Infomaniak configuration in `next.config.ts` used:

```js
experimental: {
  workerThreads: true,
  webpackBuildWorker: false,
  cpus: 1,
},
```

With the previous settings, the Builder failed with `kill EACCES`; the settings
above allowed compilation to complete. Revalidate after Next.js upgrades.
These settings must be present in the candidate release; they were initially
tested by editing the staging copy on the server.

## 3. Install and compile through the Builder

The SSH console has restrictive resources. The Builder successfully installed
645 packages in approximately two minutes. This does not establish that the
SSH installation problem has been resolved.

**Important Manager behavior:** a successful Builder command automatically
restarts the active application. Selecting automatic dependency reinstallation
can delete the active site's `node_modules` before the custom command runs.

For isolated preparation:

1. Leave Node, startup command and port unchanged.
2. Always select **No** for automatic dependency reinstallation.
3. Use an exact, verified candidate path, not a wildcard.
4. Redirect output to a private log outside the active release.
5. End the wrapper with `exit 1` to prevent the documented success-triggered
   restart. The Manager failure indicator is intentional; inspect logs and
   explicit success markers to distinguish actual task success from failure.

Templates below contain placeholders: replace them with verified absolute
paths before use. Use a new log name for each attempt.

Installation:

```sh
(umask 077; cd <candidate-path> && npm ci --include=dev --no-audit --no-fund && echo STAGING_INSTALL_OK) > <private-install-log> 2>&1; exit 1
```

Compilation:

```sh
(umask 077; cd <candidate-path> && npm run build:prod && echo STAGING_BUILD_OK) > <private-build-log> 2>&1; exit 1
```

Require the corresponding success marker and inspect warnings/errors before
continuing. Do not silently treat the Manager's deliberate failure as proof of
task success. Logs can contain sensitive application details; do not publish them.

The successful release used Node 20.20.2, npm 10.8.2 and Next.js 16.2.3.
Node 20 remains a separate maintenance item; check dependency engine requirements
and supported Infomaniak runtimes before the next release.

## 4. Test the exact launch command

In the candidate directory, run:

```sh
PORT=3001 node server.js
```

Keep that SSH terminal open. Do not run the candidate on the active site's port
3000. From a second SSH terminal:

```sh
curl -I --max-time 15 http://127.0.0.1:3001/login
```

Require a ready message and HTTP 200. This is a startup smoke test only: it does
not validate OAuth, authorization, images, editing or all business functionality.
The existing custom server may listen on all interfaces; do not assume the
test port is private. For a strictly private test, bind a candidate test server
explicitly to loopback or use an approved protected staging environment.

Stop only the candidate process with Ctrl+C in its terminal. Do not use Manager
Stop, which controls the active site.

## 5. Switch production with explicit approval

**Mandatory before every production release:** an Administrator must open
**Home > Management > Updates**, review the single shared page in English,
correct or complete the release notes prepared from verified candidate changes,
and save it. If no notes have been prepared, draft them from those changes first.
Verify the saved content and Last updated timestamp, and confirm a non-administrator can
read it without edit controls. Include relevant user actions or known limitations.
Do not switch production until this step is complete. This is an operator
checklist requirement, not an automated deployment gate.

For the first release introducing Updates, apply
`20261115211000_add_application_updates.sql` separately before testing the
candidate. Populate and verify `/updates` on the authenticated candidate before
switching, since the current production UI does not yet include this page.
The content is shared through Supabase, so subsequent edits are visible
immediately to users who open or reload Updates, independently of release rollback.

Schedule a possible short interruption. Record the previous execution path for
rollback before changing any settings.

1. Reset the Manager build command to `true`; save it. Do not click Build.
2. Keep the tested Node version, `node server.js` and port 3000 unchanged.
3. Set Manager > Advanced > General > site location to the exact candidate path
   relative to `/srv/customer` (omit that prefix).
4. If a dialog proposes moving, replacing or deleting files, cancel and inspect
   it. Do not assume behavior across Manager changes.
5. Save, then restart once through the Manager.
6. Check startup logs and the main HTTPS domain without bypassing TLS checks.
7. Test sign-in, Active/All/Archives/Collection, filters, category factsheets,
   images and Back after editing. Avoid destructive test changes to real data.

The new directory is now production despite its `staging` name. Record it as the
active release for the next deployment. Do not rebuild or reinstall into it.
Keep the prior directory and backup until validation is complete.

## 6. Roll back

Restore the previous Manager execution path, save and restart. Keep Node,
startup command and port at their previously validated settings.
Do not copy files over the failed release or run an in-place dependency install.
If database changes accompanied the release, assess compatibility separately.

## Automation boundary

Safe candidates for a future cross-PC PowerShell/Node tool:

- package sources from the checkout, reject secrets and unsafe archive paths;
- record commit/dirty state, file manifest and SHA256;
- generate exact-path installation/build commands with private logs and markers;
- validate transfer integrity, task logs and HTTP smoke tests;
- produce a release record with active/previous paths and rollback instructions.

SFTP transfer can use WinSCP with credentials supplied securely at runtime.
Do not hardcode passwords or accept unverified host keys.

Keep Manager build launch, automatic-reinstall **No**, path switch and final
restart manually confirmed until supported API operations and permissions have
been verified. No fully automated deployment tool is implemented by this guide.
Do not automate the Manager by guessing endpoints or relying on fragile UI clicks.

## Official references

- [Configure a Node.js site](https://www.infomaniak.com/fr/support/faq/2535/modifier-la-configuration-dun-site-nodejs-infomaniak)
- [SSH resource limits](https://www.infomaniak.com/fr/support/faq/2276/comprendre-les-limites-des-scripts-ssh)
