# ArtMuse

Application interne de suivi des oeuvres, propositions, contacts et documents de Blondeau & Cie.

## Prerequisites

- Node.js 20 or later
- A Supabase project configured with the tables and storage buckets used by the application
- Microsoft Entra ID configured as the Supabase Azure OAuth provider
- Google configured as the Supabase Google OAuth provider

## Setup

Install dependencies and define the following environment variables in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
PRINT_SECRET=<print-secret>
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only: never expose it in browser code, source control, or logs.

The login page offers Microsoft and Google sign-in. Enable both providers in
Supabase Auth and allow `http://localhost:3000/auth/callback` for development
and `https://<domain>/auth/callback` for production in Auth URL Configuration.
In Google Cloud, configure the OAuth client's authorized redirect URI using
the callback URL shown by the Supabase Google provider settings
(`https://<project-ref>.supabase.co/auth/v1/callback`).
Both providers use the same application callback and access checks; Google
sign-in does not grant application access automatically.

If `/auth/callback` returns 404 during development, restart `npm run dev`:
the callback route already exists and should redirect to the application or
back to login, not render a page. Start a new sign-in after restarting rather
than reusing a callback URL, since OAuth codes are single-use. If an invalid
refresh-token error persists, clear this application's site cookies and sign
in again.

Start the development server:

```bash
npm ci
npm run dev
```

## Roles

| Role | Access |
| --- | --- |
| `Viewer` | Read-only access to the application |
| `Editor` | Create and modify artworks, documents, proposals, and imports |
| `Administrator` | Editor permissions plus user invitations |

Authorization is enforced in API route handlers. Supabase Row Level Security must remain enabled as a second layer of protection.

## Commission invoice files

On Commissions, choose an invoice date, select or drop **one file**, then click
**Save**. This applies to artwork invoices and annual correction invoices.
Selecting another file replaces the pending selection; multiple-file drops
are rejected. Empty files and files larger than 100 MB are rejected.
Dates and files are saved together rather than automatically on field blur.
Add file invoice appears below the Invoiced on date; Save and Open invoice
appear below Exceptional rate.
Artwork rows with a saved exceptional rate of 0% hide Add file invoice and
Save; existing invoice links remain accessible.
Existing invoice links remain available, including when saving a date without
selecting a replacement file.

Files use the existing server-side SharePoint configuration, artwork folders
and `documents` table; no new table or migration is required.
Downloads use the existing authenticated document endpoint and document RLS.
Editors and Administrators can upload. Files use **All artwork clients**
visibility. Correction files are uploaded once and linked to each affected
artwork. Replaced or removed invoice attachments remain in artwork documents.
An unsuccessful invoice save cleans up its newly uploaded file.

The expanded correction artwork tables show original 8% commissions above
the new 7% commissions, in both the commission currency and USD. The
**Correction -1% USD** column is on the far right; there is no correction
column in the original currency. USD totals include original commissions,
new commissions and corrections. Original currency columns are not combined
across currencies.
The Rate column before the commission amounts shows the original 8% struck
through above the corrected 7% in bold green.
Each company card has its own **Print Florac** or **Print Léopold Meyer**
button. It prints only that company's correction details and USD totals
for the selected year, even when the details are collapsed on screen.
The printed document title includes **Correction commissions**, the company
(**Florac Works** or **Léopold Meyer**) and the selected year.
Invoice controls and the main commissions table are excluded. The general
Print button prints the main commissions table in A4 landscape, including
all columns (also FX, invoice dates and exceptional rates). Inputs are
rendered as values; upload/save buttons and Open invoice links are omitted
from the printout.
Company-specific printing copies only the selected correction table into
an isolated print document, rather than printing the whole page.
Both companies' correction details include Purchase date as the leftmost column,
both on screen and in the company-specific printout.

The main commission table groups **Proposed by** above **Buyer** in one
column. The Excel export keeps these as separate fields for data analysis
and uses **Buyer** rather than **Company** as its column label.
For corrected artworks, the commission cell shows the original amounts in
the commission currency and USD struck through, above the corrected 7%
amounts in bold green. This also applies when previewing correction details.
The USD difference (original 8% commission minus corrected 7% commission)
appears below the corrected USD amount in bold red.
The Rate column shows the original 8% struck through above the new 7% in
bold green, without parentheses. Invoice links appear only in the invoice
controls, not below commission amounts.

To copy existing commission and correction invoice links into the same
artwork document storage, first run a read-only check:

```bash
node --env-file=.env.local scripts/migrate-documents-to-sharepoint.mjs --commissions --recover
```

Add `--apply` to copy the files and replace successfully verified invoice
links. The script checks SHA-256 hashes before replacing links, preserves
original URLs in `documents.legacy_url` and ignored CSV migration logs,
and skips already migrated invoice links. Missing or ambiguous source files
are reported without replacing their original links. Correction files are
linked to every qualifying artwork, using the commission page's annual
threshold and exceptional-rate rules.

The home dashboard shows Proposals followed by a full-width horizontal
Collection grid that wraps to fit the viewport. Below, Management and Tools
are two side-by-side sections with vertical link lists; they stack on mobile.
Viewers retain the same layout without the Management section or its links.

Active proposal lists show Location below Proposed by, with Status and Priority
on one line and Proposed to underneath. Proposed to remains visible only to
Editors and Administrators.
The artwork list search also matches the displayed Location (company or contact
name, with the legacy location text as fallback), including Active Proposals.

## Geneva Freeport inventory

The page includes accessible artworks whose location contact is Florac Works
and whose location address is PF, Geneva, Switzerland (both exact IDs must
match). No artwork status or existing customs record is required.
The global client selection restricts this inventory to artworks bought by or
proposed to that client, as on other artwork lists. Search, counts, insured
value totals and Excel export all use the filtered inventory. The customs
editor is hidden if its artwork no longer matches the selected client.

## Certificate location

The home dashboard links to **Certificate locations** (`/inventory/certificates`),
an overview of accessible artworks with a certificate or an assigned
certificate contact/address, regardless of status. It shows artist, artwork,
year, artwork thumbnail, contact, address and history, including certificates with missing location
information. Search matches those fields, and the global client filter applies.
Artwork titles link to factsheets. Editors and Administrators can edit the
certificate contact and address directly in always-visible table fields.
Save and Cancel appear only for modified rows; no Edit button is required.
Click Artist or Certificate contact to toggle ascending/descending sorting.
Changing contact clears the address; only that contact's addresses are offered.
Saves use the existing authenticated artwork API and database history trigger.
Viewers see read-only values. The API uses the authenticated session and RLS,
with paginated loading; thumbnails use the first image by position and ID and
the existing private image endpoint where applicable.
No additional migration is required beyond the certificate-history migration.

When Certificate is set to Yes, artwork creation and editing allow selection
of a certificate location contact and one of that contact's addresses.
Changing the contact clears the selected address. The location is independent
of the artwork's location and is shown on its factsheet.

Migration `20261024130000_add_certificate_location_history.sql` adds the address
and an append-only, RLS-protected history. Database triggers validate that the
address belongs to the selected contact and record contact/address changes,
including removals, atomically with the artwork save. History includes date,
previous/new location snapshots and the acting user's email when available.
Snapshots preserve historical labels after contact/address edits or deletion.
Existing certificate contacts receive an explicitly marked initial record
dated at migration time; no earlier move dates are inferred. Unchanged saves
do not add history. History is available in the artwork editor and factsheet,
including after the certificate flag or current location has been cleared.

## Client-addressed artwork comments

Comments belong to a client conversation (`artwork_viewer_comments.recipient_contact_id`).
All invited, active Viewer accounts linked to that contact can read its
conversation when the artwork is proposed to that client (or bought by it)
and the account still has artwork access. Other clients cannot read it.
Viewers can post only to their eligible clients and edit/delete only their own
comments. Multiple linked clients require an explicit recipient selection.

Editors and Administrators can read every conversation and internal comment,
choose a recipient when posting, and reassign existing comments to an eligible
client or mark them internal. A NULL recipient means **internal**, never public.
The recipient options are clients proposed the artwork and its buyer.
Author and artwork identity cannot be changed on an existing comment.

Migration `20261024150000_scope_artwork_comments_to_clients.sql` replaces the
legacy artwork-wide comment policies with client-scoped RLS. This protects
direct database requests, factsheets/printing and comment notification queries,
not just the on-screen display. Existing Viewer comments are attributed only
when the author has exactly one invited client membership. Ambiguous Viewer
comments and staff comments remain internal until manually assigned.

Deploy the new comment UI with this migration: old Viewer forms do not send
a recipient and will be rejected after the policy change. Verify isolation
with the rollback-only SQL test `tests\db\client-comments.sql`.

## Artwork list loading

Active, Bought/Collections, Archived and All artwork lists use dedicated
security-invoker views: `artworks_list_admin` for staff and
`viewer_artworks_list_secure` for Viewers. They retain the corresponding full
view's artwork access rules and select only list fields. Each artwork includes
at most one accessible gallery image, ordered by position (missing positions
rank as 9999), then ID to break ties. Documents, full galleries, history diffs
and detail-only text are not transferred to these lists.

Detail pages and print sheets still use the full views.
All reads use the current user's session and RLS.

### Artwork list thumbnails

Active, Bought/Collections, Archived and All request real 160 x 140 WebP
thumbnails for Supabase artwork images displayed at 80 x 70 CSS pixels.
On a cache miss the authenticated image route downloads through the user's Storage
session, applies EXIF orientation, crops to cover and encodes at quality 75
with Sharp. Small sources are not enlarged; image metadata is not copied.
The originals, galleries, albums and downloads remain unchanged.
External image URLs retain their original behavior.

Thumbnails are loaded lazily and decoded asynchronously. Responses are
`private, no-store`, so no shared image cache can bypass a fresh access check.
Apply `20261025200000_add_stored_artwork_thumbnails.sql` before deploying.
Generated files are saved in the private `artwork-thumbnails` bucket. Each
request checks source-document RLS (including client visibility) and the Storage
object version before a privileged server read. A hit transfers only the small
WebP, not the original, and does not run Sharp again. Source replacement creates
a new versioned key. No Supabase image-transformation subscription is required.
New uploads generate thumbnails after the response; failures are logged and
retried when displayed. Existing images are generated progressively on first
display, without a bulk backfill.
Sources above 100 MB or 100 million pixels are rejected. Unsupported or failed
images show **Image unavailable**, rather than silently downloading the full
original. The thumbnail route never stores or replaces an original image.

Document deletion/URL replacement and artwork cascades enqueue thumbnail cleanup
in the database. Image reads and application deletes drain up to 20 queued sources
after the response. Failures are logged and retained for later retries; without
application traffic cleanup waits for the next request. See the Supabase
operations guide for manual draining. Direct source overwrites invalidate keys;
historical source-version files remain until that document/source is removed.

### Server pagination

The `artwork_list_page` security-invoker RPC filters, groups, counts and sorts
before returning at most 20 rows per table. Existing priority, draft, market,
auction, Bought and Archived groups remain separate. **Load more** requests
only the next 20 rows of its table; it does not download every artwork first.
Counts and artist/contact filter options cover all accessible results, not
only loaded pages. Artist/proposer labels and staff recipient summaries are
included in the response, avoiding follow-up artist/contact queries.

Search and filter changes request fresh server results (debounced by 200 ms
after the first load); sort changes reset that table to its first page.
Filters reset loaded page counts while preserving sort choices.
Server ordering uses date and artwork ID tie-breakers and French-Swiss ICU
collation for case-insensitive text sorting. Unrated quality values sort last.
The global client filter includes proposed clients and the buyer; a fixed
recipient is also enforced on the server. Viewers receive no recipient labels.
Inline edits refresh page counts and group membership from the server.

Deploy `20261025190000_add_lightweight_artwork_lists.sql` and
`20261025193000_add_paginated_artwork_lists.sql` before the list UI.
Use `tests\db\artwork-lists.sql` and `tests\db\paginated-artwork-lists.sql`
for rollback-only projection, page-size, global-sort/filter and access checks.

### Temporary navigation cache

Artwork index pages (Active, Bought/Collections, Archived and All) share a
60-second, in-memory data cache, bounded to 20 entries. Keys include user ID,
role, selected client, forced status, fixed recipient, filters, sorts and loaded
page counts. A recent list appears
immediately on return while the current user's queries refresh it in the
background. Expired entries require a fresh load. The cache stores neither
files nor form drafts and does not persist to localStorage, disk or a shared
server cache. Other pages are not yet opted in.

Returning focus to the tab, returning to a visible tab, reconnecting and the
**Refresh** button revalidate the list. Refresh failures show an explicit error
rather than leaving cached data presented as current.

The session provider clears all temporary caches on auth events, explicit
session refresh and unmount. Successful browser mutations to same-origin API
routes or Supabase REST/Storage endpoints also clear the caches and revalidate
mounted lists. The read-only `artwork_comment_clients` and `artwork_list_page`
RPCs are excluded so reads do not invalidate navigation data. Requests started before an
invalidation cannot repopulate the cache or overwrite a newer list.

Changes from another browser/user are picked up on the next revalidation, not
through live push. A cached list can briefly reflect former permissions until
that request finishes; every network query and file access still enforces RLS.
This is not a replacement for server-side access checks or a guarantee of
instant remote permission revocation.

### Returning to artwork lists

Active, Bought/Collections, Archived and All preserve the navigation context
when an artwork is opened and the browser Back button returns to the list.
Artist, proposer, recipient, search and date filters are kept in URL query
parameters. Updating filters replaces the current history entry without a page
reload and preserves unrelated query parameters. **Reset filters** removes the
filter parameters.

Each table's selected sort/direction and loaded page count, together
with the page scroll position, are saved in that browser history entry.
These settings are scoped by user, role, selected global client and list type;
they contain no artwork records. Returning to the entry restores expanded rows
and sorting, then scrolls after the data refresh has finished. If the underlying
list has changed, the browser may clamp the old position to the new page height.
Previously loaded pages are fetched in batches of 20 before scroll restoration,
with at most four table-restoration sequences running concurrently.
Filter URLs can be bookmarked/shared; table expansion, sorting and scroll are
specific to the history entry, not a shared URL or a cross-device preference.
This navigation state is independent of the 60-second data-cache lifetime.

## Multiple artwork documents

In an artwork's edit view, the Documents section accepts multiple files through
the file picker or drag and drop. Further selections append to the upload list.
Each file has an editable label, initially its original filename. Empty labels
also use the filename. URL documents remain available through **Add link**.
The file uploader appears first, followed by **Add URL link** and then
**Organize links** when documents exist. Thick dividers separate these workflows.
Category and Visibility share a wrapping row, below the drop zone for uploads.
In **Organize links**, select documents to change their category or apply
**All artwork clients**, **Internal only**, or **Selected client** visibility.
Visibility changes save immediately and do not change categories. If some updates
fail, confirmed changes remain saved and only failed documents stay selected for retry.

Use **Upload files** to save the files immediately to the existing artwork
folder in SharePoint, independently of the artwork's **Save** action.
Uploads run sequentially to preserve order and limit server memory usage,
with a per-file status and an overall completed-file count. The existing
100 MB per-file limit applies; empty and oversized files are shown as errors.
Other valid files can still upload. Failed uploads retain their labels and can
be retried without re-uploading confirmed successes. **Clear list** only clears
the upload list; it does not delete uploaded documents.

Keep the page open during transfer. Save, Cancel and artwork deletion are
disabled while uploads run, and closing/reloading the tab warns about unfinished
files. Selected files are not restored after leaving or reloading the page.
Existing authentication, roles and SharePoint storage permissions are unchanged.

### Document visibility

Existing artwork documents and new uploads/links default to **All artwork
clients**. This means clients who already have access to the artwork, not all
ArtMuse clients. Editors and Administrators can instead choose **Internal
only** or **Selected client** (one proposed client or the artwork buyer).
All invited, active Viewer accounts belonging to that selected client share
the access; it is not restricted to one individual user. Artwork access must
also remain valid, and removing the client's proposal revokes access unless
the client remains an eligible buyer with artwork access.

The upload batch selector applies to remaining files and later selections;
individual files can override it before upload. Existing documents have a
**Save visibility** action, saved independently of the artwork's **Save**.
New URL links have their own visibility selector. Gallery images and Market
documents retain their existing default visibility.

Deploy `20261025173000_add_document_visibility.sql` before the updated UI/API.
It defaults every existing document to `all_clients` and adds recipient
validation and database-enforced read isolation. Security-invoker artwork
views, document lists and authenticated file opening/downloading all apply
the same RLS rules. Historic document change-log entries are staff-only so
old labels and URLs cannot reveal files later made confidential.
Client options reuse the existing `artwork_comment_clients` RPC.

ArtMuse restrictions do not revoke pre-existing external/SharePoint links,
Microsoft 365 permissions or downloaded copies. Manage those permissions in
SharePoint separately; use authenticated ArtMuse links for restricted files.
Creating new direct SharePoint share links through ArtMuse is blocked for
restricted documents. Restricting an external URL hides it in ArtMuse, but
cannot protect that external service independently.

### Link categories

On the artwork factsheet, each link includes a file-format icon (PDF, JPG,
TIF, PNG and other recognized formats), using stored MIME type, filename or
the link path. Unknown formats show a generic link icon. SharePoint files
have a **Download** action using the existing authenticated document endpoint,
with the same visibility/RLS checks as opening the file. External links show
**Open source** instead: downloading depends on the external provider and
its permissions. Download/source actions are hidden on paper prints.

Compact neutral-gray file-format badges appear after each link title, followed
immediately by an arrow-only download/source action with an accessible label
and tooltip. Link rows use normal, compact line spacing.
The **Download by category** controls appear below all link categories and
let users select General, Images and/or Exhibitions & Literature, then download
their accessible SharePoint files in a single ZIP. The archive contains a
folder per selected category and preserves original filenames, adding numeric
suffixes for duplicate names. External links are excluded and their count is
shown before download; use **Open source** for those resources. The main image
gallery is not included.

The ZIP endpoint uses the authenticated user's session and document RLS,
paginates the file list, and streams files sequentially without loading the
whole archive into server memory. A failed file aborts the download instead of
silently returning a successful but incomplete archive. Keep the download open
until it completes. No new database migration is needed.

On the artwork factsheet, clicking a main-gallery photo or a recognized image
file in the Images link category opens a modal album. Each section has its own
album, in the displayed order. Use Previous/Next, left/right arrow keys or a
horizontal swipe to browse; Close or Escape returns to the factsheet.
The viewer restores keyboard focus and page scrolling on close. Downloads keep
using the authenticated document endpoints. Formats the browser cannot display
(such as some TIFF/HEIC files) show an explicit message and retain a download or
original-file action. PDFs and external image-folder links open normally.

On a single artwork factsheet, priority, rating, status and Print/Edit controls
remain in a floating toolbar while scrolling. The toolbar tracks the navigation
header height (including the mobile client selector) and wraps on narrow screens.
Paper printing and multi-artwork factsheets retain their normal in-flow controls.

Artwork links are organized into three collapsible groups: **General**,
**Images**, and **Exhibitions & Literature**, with visible-document counts.
These are logical groups, not SharePoint folders; no files are moved or renamed.
Categories describe the content, not its format: catalogue scans can belong to
Exhibitions & Literature even when they are JPGs. The main artwork image gallery
is separate and unchanged.

New links and uploaded files default to General. Choose a category for a batch,
override it per file, or change an existing link's category in edit mode.
Use the checkboxes and **Move selected links** to reclassify several links.
Successful moves appear immediately; any failed moves remain selected for retry.
Category changes save immediately and do not change visibility or recipients.
The factsheet displays one link per line in its category. Empty groups are hidden.
Existing document ordering is retained within groups; drag sorting stays within
the same category.

Apply `20261025180000_add_document_link_categories.sql` before deploying this UI.
All existing documents receive General; no category is inferred automatically,
including for existing publication scans. The viewer projection and artwork
aggregate views preserve RLS, so counts include only accessible documents.

## Documents on iPhone

External links and documents request a separate tab; internal ArtMuse navigation
is unchanged. iOS controls whether a home-screen app actually opens a Safari
window, and can display same-origin PDFs without browser navigation controls.
On iPhone (Safari and the installed app), opening a SharePoint document through
ArtMuse therefore uses a document reader with a persistent **Back to ArtMuse**
link and a **Download** action. The return link uses the referring ArtMuse page
when available, otherwise the document's artwork factsheet (or Market).
The embedded file and downloads retain the existing authenticated, RLS-checked
document endpoint. Desktop behavior is unchanged.

## Automatic auction buyer premiums

In artwork creation and editing, the Suggestion and Result pairs calculate
Hammer <-> Premium after editing either amount. **Premium is the total including
the buyer's premium, not the fee alone.** The amount you entered is preserved;
only the other field is calculated. Calculation runs after a short typing pause.
Existing saved amounts are not recalculated on opening an artwork.

The auction house contact, sale date and auction currency are required.
The agreed city mapping is USD -> New York, GBP -> London, HKD -> Hong Kong,
EUR -> Paris. Other currencies, houses without a matching scale and dates
without a historical scale show an error; no rate is guessed. Switch off
**Auto** for manual amounts or additional taxes/adjustments. A pending or failed
automatic calculation prevents saving until it succeeds or Auto is switched off.
Changing the house/date/currency recalculates the last edited amount; obsolete
responses are discarded. Suggestion and Result are independent.

ArtMuse's authenticated `/api/auctions/premium` endpoint looks up the contact
through RLS, then sends only the house name, currency, sale date, source field
and amount to `https://buyerspremium.blondeau.ch/api.php`. No artwork IDs,
titles, client data or credentials are sent to the calculator.
It validates the response and scale dates before accepting the amounts.

### Calculator API deployment

The calculator source is maintained separately in
`C:\Users\philippe\OneDrive - Blondeau & Cie\DEV\buyers-premium-history`.
Publish its new `public\api.php` beside the existing `models.php`, `db.php`
and `config.php`. The API reuses `get_schedules_for_house_on_date`,
`get_tiers_for_schedule`, `compute_premium` and `invert_total_to_hammer`;
ArtMuse does not duplicate historical rate tables. Only continuous, ordered
scales with a final unbounded tier are accepted. Responses are JSON and are
not cached. No Supabase migration is required.

Example request (same currency, no FX conversion):

```json
{
  "house": "Christie's",
  "currency": "USD",
  "date": "2026-10-24",
  "field": "hammer",
  "amount": 100000
}
```

POST returns `hammer`, `premium` (fee alone), `total` (including premium),
the echoed request fields, inferred city and selected schedule validity dates.
For inverse calculation, use `"field": "total"`.

During verification, the Christie HKD scale effective 2026-01-01 had a final
15% tier starting at 6,000,000 instead of 60,000,000, overlapping the preceding
10,000,000-60,000,000 tier. The correction to 60,000,000 was explicitly confirmed
and applied to the local database and, on 2026-10-24, to the hosted calculator
through its administration interface (schedule 16, tier 47). The published API
passed 18 live forward/inverse checks, including the historical HKD thresholds
at 10,000,000 and 60,000,000. The hosted database contains newer schedules than
the local copy; never overwrite it with that copy.
For another installation with the original typo, the separate CLI-only
`maintenance\fix-christies-hkd-2026.php` checks the existing value and is safe
to rerun after backing up the database. The API rejects inconsistent scales.

## Supabase operations

The production runbook, including the observed schema, migration workflow, RLS
contract, Storage buckets, backup/restore procedure, and production variables,
is available in [docs/SUPABASE_OPERATIONS.md](docs/SUPABASE_OPERATIONS.md).

## Commands

```bash
npm run dev
npm run lint
npm test
npm run build
```

The build runs TypeScript validation. Do not suppress TypeScript errors in deployment configuration.

`npm test` runs isolated API authorization tests and never connects to Supabase.
