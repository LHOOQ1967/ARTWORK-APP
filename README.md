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
