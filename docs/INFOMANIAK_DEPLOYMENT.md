# Infomaniak production deployment

Validated on 2026-11-08: isolated dependency installation and production build
through the Manager Builder, followed by a site execution-path switch.

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
