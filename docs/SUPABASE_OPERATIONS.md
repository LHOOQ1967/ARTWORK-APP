# Exploitation Supabase

Ce document est le runbook de production de la base Supabase d'ArtMuse. Les
migrations SQL ne sont pas encore versionnees dans ce depot : le schema
deploiye est donc la reference tant que le premier `db pull` n'a pas ete
revue et committe. Ne pas modifier la structure depuis le SQL Editor sans
creer ensuite une migration.

## Architecture et acces

- L'application utilise l'Auth Supabase avec les fournisseurs Azure OAuth
  (Microsoft Entra ID) et Google OAuth.
- Le navigateur et les routes authentifiees utilisent la cle anon avec la
  session de l'utilisateur. Les droits RLS s'appliquent donc a ces requetes.
- `SUPABASE_SERVICE_ROLE_KEY` est utilise exclusivement par des routes Node.js
  pour les invitations, les imports et certaines suppressions. Cette cle
  contourne RLS; elle ne doit jamais etre exposee au navigateur.
- La fonction SQL `user_has_any_access()` est appelee apres le callback OAuth
  pour valider l'acces a l'application.

Les roles applicatifs sont stockes dans `public.profiles.role` et doivent
etre exactement `Viewer`, `Editor` ou `Administrator`. L'API applique le meme
controle en defense supplementaire; RLS reste obligatoire.

## Schema applicatif

Transport final invoices use a single-file `Add Invoice` picker and the transport
`Save` action instead of URL entry. Editor/Admin uploads (up to 100 MB) go through
the same SharePoint drive and `buildArtworkFolderPath` as artwork files. They
create a `documents` entry labelled `Transport final invoice` in General with
`all_clients` visibility and an authenticated `/api/documents/<id>/open` URL.
Document RLS and the normal file download/viewer routes still apply.

Existing external invoice URLs remain readable and are unchanged when saving
without a file. Replacing an invoice points the transport to the new upload;
previous files remain in the artwork document history, rather than being deleted.
Upload failures retain the selected file for retry. A failed database save removes
the newly uploaded document/file and reports cleanup errors explicitly.
No schema migration or automatic migration of old external links is required.

Print/factsheet headers show right-aligned `Proposed to` recipient names on the
same row as the proposer
only for Editor and Administrator sessions, including printed output. Viewer
sessions omit both the names and their tooltip even if proposal data is supplied.
Individual factsheets and bulk printing use the same component and existing
role-scoped views; no additional contact query is needed.
Factsheets show the certificate-location `History` button only after an
RLS-scoped existence check confirms a history entry. Empty history hides the
button; lookup failures are reported rather than treated as empty history.
Factsheets display the edition value after the signature without an `Edition:`
prefix; creation/editing field labels are unchanged.

Lors de la creation d'une oeuvre (y compris depuis un import) et lors de sa
modification, choisir une Auction House renseigne aussi `proposed_by_id`
avec le meme contact. Effacer la maison ne vide pas le proposeur. Le proposeur
peut ensuite etre modifie independamment. Un brouillon importe avec une maison
mais sans proposeur reprend cette maison comme proposeur.

L'inventaire ci-dessous est deduit du code applicatif. Les types, contraintes,
index, valeurs par defaut et clauses exactes restent a consulter dans la
migration canonique une fois celle-ci extraite.

| Objet | Role et relations connues |
| --- | --- |
| `profiles` | Profil lie a `auth.users.id`; contient au minimum `role` et `last_activity_at`. |
| `artists` | Referentiel des artistes, notamment nom, prenom, annees et lieux de naissance/deces. |
| `artist_categories` | Categories selectionnables lors de la creation ou de la modification d'un artiste; `artists.artist_category_no` stocke le `legacy_no` de la categorie, ou `NULL` sans categorie. |
| `contacts` | Referentiel des personnes et societes (identite, email, telephone, ville, role, notes). |
| `artworks` | Entite centrale; liee a `artists` et plusieurs fois a `contacts` (proposeur, maison de vente, acheteur, destination, localisation et localisation du certificat). |
| `documents` | Documents d'une oeuvre: `artwork_id`, `document_type`, `label`, `url`, `position`, `created_at`. |
| `artwork_proposals` | Propositions d'une oeuvre a un contact, avec `artwork_id`, `contact_id` et `proposed_at`. |
| `buyer_search_requests` | Demandes souples de recherche d'oeuvres pour un contact, avec date, recherche, budget, statut et notes. |
| `artwork_imports` | Import OCR d'etiquettes: createur, statut, chemin/URL d'image, resultat OCR, donnees analysees, score et artiste rapproche. |
| `artwork_viewer_comments` | Commentaires des viewers associes aux oeuvres et aux profils. |
| `contact_users` | Association entre un utilisateur Supabase et un contact, avec statut d'invitation. |
| `market_sections` | Sections du marche (titre, categorie, dates, notes, position et horodatages). |
| `market_section_items` | Liens ou documents d'une section de marche, avec ordre et informations de vente. |
| `fx_rates_history` | Historique de taux de change utilise par l'inventaire. |
| `v_inventory_bought_florac` | Vue historique limitee aux oeuvres achetees par Florac; conservee pour compatibilite. |
| `v_inventory_bought` | Inventaire de toutes les oeuvres au statut `Bought`, avec buyer, artiste, premiere image et taux EUR; respecte RLS via `security_invoker`. |
| `v_market_section_items` | Vue de lecture qui joint les elements de marche et leurs documents. |
| `user_has_any_access()` | Fonction RPC de controle d'acces apres OAuth. |

Les colonnes de `artworks` sont nombreuses. Le contrat frontend se trouve dans
`app/(protected)/types/artwork.ts`; il est la reference des champs metier
attendus par l'application. Ne pas renommer une colonne ou une contrainte de
relation sans rechercher son nom dans le code: les jointures PostgREST
nomment explicitement plusieurs contraintes `artworks_*_fkey`.

## Migrations

### Stored artwork thumbnails

Apply `20261025200000_add_stored_artwork_thumbnails.sql` before the matching
application release. It creates the private `artwork-thumbnails` bucket and a
service-role-only durable cleanup queue. A restrictive Storage policy prevents
authenticated/anonymous bucket access even if another permissive policy exists.
The server verifies the source document with the caller's RLS client before
reading stored thumbnails. Originals and their existing access paths are unchanged.

Upload routes schedule generation with Next.js `after`; existing images populate
on demand. The host must support `after` and allow enough request duration for
image processing. Generation/storage errors are logged; display retries, never
falls back to original bytes. Versioned keys include the source Storage version.

Document deletion or URL/type replacement queues the old source, including artwork
cascades and direct SQL changes. Application image reads/deletes process 20 sources
per invocation. A failed job remains queued. For an idle application or a backlog,
invoke `cleanArtworkThumbnails()` from `lib/artworkThumbnails.ts` in a trusted
server maintenance process with service-role environment variables, repeatedly
until `select count(*) from public.artwork_thumbnail_cleanup` is zero.
Do not expose that helper or service-role credentials to browsers. Old versions
from direct same-URL Storage overwrites remain until source/document removal.

Validation: `tests/db/stored-artwork-thumbnails.sql` checks private bucket,
authenticated isolation, replacement/deletion queueing and artwork cascades in a
rolled-back transaction. API tests check RLS denial before privileged reads,
stored hits without original downloads, version changes, real WebP encoding and
storage failure handling.

Migration applied on 2026-10-25 after approval; the rollback SQL suite also passed
against the deployed schema. A disposable authenticated Editor fixture verified
real Storage `info().version`, persistence, identical bytes on the second read
with only one original download, 160 x 140 WebP dimensions, denied direct bucket
reads (anonymous and authenticated), denied derivative access after changing the
user to Viewer, and thumbnail deletion after artwork cascade. Temporary users,
documents, originals and thumbnails were removed afterward.

### Server-paginated artwork lists

`20261025193000_add_paginated_artwork_lists.sql` adds the read-only
`artwork_list_page(jsonb,jsonb,text,integer)` RPC. It is SECURITY INVOKER,
not SECURITY DEFINER, with EXECUTE granted only to authenticated users.
It selects the appropriate existing lightweight source according to the caller's
staff eligibility and preserves underlying RLS. Anonymous execution is revoked.
No artwork, file, policy or existing view is changed.

Filtering, global group counts, filter options and sorting run before
LIMIT 20/OFFSET. Null group requests return the first page of each group;
named-group requests return only that group's requested page. Metadata options
cover the whole accessible status/client scope. Viewer responses omit recipient
summaries. Text sorts use the existing `pg_catalog."fr-CH-x-icu"` collation.
Tie-breaks use the existing date direction then artwork ID; quality nulls sort last.

Applied to the linked project on 2026-10-25 after approval. Rollback-only SQL
tests passed before and after application. Deploy the paginated list UI after this
migration. `tests\db\paginated-artwork-lists.sql` verifies 20/20/5 pages, no
overlap, sorting/search outside the first page, complete options, client/buyer
filters, date fallbacks, grouping, anonymous denial and existing role/document
access behavior. This migration intentionally does not redefine artwork access
rules or synchronize them with separate document-access eligibility rules.
An authenticated staff read of the 797 current artworks returned 135 initial
rows across 13 groups, with a maximum of 20 rows per group. The complete RPC
response, including global filter options/counts, measured 227,577 uncompressed
JSON bytes. This is a payload measurement, not a browser load-time benchmark.

### Proposal market filters

Proposal section and category counts link to `/artworks/print/category`.
The page uses `artwork_category_ids(text,jsonb,jsonb)` to collect all matching
artwork IDs in one compact request, with the current filters and sorting.
Full factsheets are then read in batches of 20 from the role-specific print
view; existing RLS and client scope are preserved.

`20261108180000_add_category_artwork_ids.sql` was applied atomically and
recorded in production migration history on 2026-11-08 after approval.
It avoids the repeated full-row, image and filter-option aggregation that
caused statement timeouts when gathering category IDs through the list RPC.
The new function is SECURITY INVOKER with anonymous execution revoked.
Authenticated staff benchmarks returned all 551 archived IDs in 202 ms;
the other section requests took 169–347 ms, without raising statement timeout.
Rollback-only SQL tests passed before and after deployment, covering complete
IDs, sorting, filters and Viewer/outsider access. Email dispatch was disabled
only inside these rolled-back test transactions.

Factsheet return links carry the original proposal URL, including filters.
Both the return link and proposal-list restoration use Next.js search parameters
so client-side navigation to a retained list restores the requested filters
without depending on browser URL update timing.
The `returnTo` parameter is also propagated through factsheet Edit links and
the edit form's Save and Cancel destinations, preserving filters after changes.

`20261108110000_add_artwork_market_type_filter.sql` and
`20261108120000_allow_empty_artwork_market_filter.sql` extend the paginated RPC
with `marketType`: `all`, `market`, `auction`, or `none`. Both checked markets
use `all`; unchecking both returns no rows. Filtering precedes pagination and
counts, and preserves existing RLS and recipient restrictions.

Both migrations were applied atomically to the linked production project on
2026-11-08 and recorded in migration history. The rollback-only
`tests\db\paginated-artwork-lists.sql` suite passed before and after application.
Email dispatch triggers were disabled only inside the rolled-back test
transactions; no test email was sent. Their enabled state and both persisted
migration versions were verified afterward.

### Lightweight artwork lists

`20261025190000_add_lightweight_artwork_lists.sql` adds
`artworks_list_admin` and `viewer_artworks_list_secure`. Both are
security-invoker views built on their corresponding existing full view, so
artwork eligibility and document RLS are preserved. They omit document/history
aggregates and detail-only columns and select at most one accessible gallery
image per artwork. Anonymous access is not granted. Existing full views,
records and policies are unchanged.

Applied to the linked Supabase project on 2026-10-25 after approval.
Rollback-only role/projection tests passed before and after application;
the existing document visibility isolation tests also passed afterward. The list UI
requires this migration; detail and print views remain independent.

On the same 797 artworks, a database-side comparison of uncompressed row JSON
measured 5,546,472 bytes for the full view and 1,039,254 bytes for the list view
(about 81% less). This is a payload comparison, not a measured browser load-time
improvement, and excludes the subsequent artist/contact/proposal requests.
The list execution plan no longer aggregates the complete document/gallery JSON.

Use `supabase db query --linked --file tests\db\artwork-lists.sql` for
rollback-only comparisons of artwork IDs/field values across roles, image order,
document visibility, empty galleries and payload shape.

### Artwork link categories

`20261025180000_add_document_link_categories.sql` adds
`documents.link_category`, defaulting existing and new records to `general`.
The only other accepted values are `images` and `exhibitions_literature`.
It appends the category to the security-invoker `viewer_documents` projection.
Artwork aggregate views already include the complete document JSON.
No file, URL, visibility, recipient, gallery-image type or storage path changes.
The migration was applied to the linked Supabase project on 2026-10-25.
All 2,650 existing documents were verified as `general`, and the default for
new documents was verified as `general`. Deploy the category UI/API to expose
the controls.

Use `supabase db query --linked --file tests\db\document-link-categories.sql`
after migration for rollback-only checks of defaults, categories, aggregate
projections, permission preservation, gallery separation and invalid values.
Re-run `tests\db\document-visibility.sql` to confirm client isolation.
Both rollback-only tests passed after application; no test fixtures were retained.

### Artwork document visibility

`20261025173000_add_document_visibility.sql` adds `documents.visibility`
(`all_clients`, `internal`, `selected_client`) and `recipient_contact_id`.
The non-null default assigns **All artwork clients** to all existing records
and new documents, including inserts from older application versions.
The migration was applied to the linked Supabase project on 2026-10-25.
All 2,606 existing documents were verified as `all_clients`, with no recipient;
the default for new records was verified as `all_clients`. Deploy the updated
document UI/API to expose the visibility controls.

Document reads are database-enforced for active, invited Viewers with existing
artwork access and an eligible client membership. Staff retain full access.
The selected client must be a current proposal recipient or the artwork buyer
when assigned. Removing a proposal does not convert a private document into a
shared one. A referenced contact cannot be deleted until its document recipient
assignments are changed explicitly. Market access is unchanged.

The migration replaces all existing document policies, limits authenticated
table grants to CRUD, and preserves security-invoker artwork/document views.
A restrictive change-log policy makes document history staff-only, including
historic labels/URLs recorded before a document became restricted or was
deleted. Other artwork history remains governed by its existing rules.
SharePoint/external permissions are separate and are not revoked automatically.

Run `supabase db query --linked --file tests\db\document-visibility.sql` after
applying the migration for rollback-only tests of two clients, peer/multiple
memberships, revoked/inactive users, staff, direct-ID reads, aggregate views,
condition-report joins, document history, assignment validation and writes.
The migration and this test were also executed together inside one rolled-back
transaction against the linked database, without persisting schema or fixtures.
After applying the migration, the rollback-only test passed again against the
persisted schema. No test fixtures were retained.

### Client-addressed artwork comments

`20261024150000_scope_artwork_comments_to_clients.sql` was applied to the linked
project on 2026-10-24. It adds a nullable recipient contact to artwork comments
and replaces all legacy comment policies. NULL recipients are staff-only.
Invited, active Viewers can read their client conversations only while the
client is proposed the artwork or is its buyer, and artwork access remains
valid. They can create comments for their eligible clients and edit/delete
only their own comments. Editors and Administrators can read all comments and
assign recipients, including assigning legacy internal comments.

All 13 existing comments were retained: 5 Viewer-authored comments were assigned
using exactly one invited client membership; 8 comments remain internal.
No ambiguous attribution is inferred. A trigger prevents changing a comment's
identity, artwork or author and rejects unrelated recipients. Authenticated
grants are restricted to SELECT/INSERT/UPDATE/DELETE; RLS governs both the
factsheet comments and the header notification query. The recipient-options
RPC `artwork_comment_clients` returns only eligible contacts for the caller.

Deploy the new UI alongside this migration: old Viewer forms lack the mandatory
recipient and will fail writes. Run `supabase db query --linked --file
tests\db\client-comments.sql` for rollback-only tests with two clients, peer
Viewers, multi-client membership, revoked/inactive users, staff, notifications,
recipient validation and attempted cross-client writes.

### Certificate location and history

`20261024130000_add_certificate_location_history.sql` was applied to the linked
project on 2026-10-24. It adds `artworks.certificate_location_address_id`,
validates address/contact consistency and records certificate location changes
in `artwork_certificate_location_history`. History is trigger-written only,
with RLS read access matching the artwork. It stores old/new location label
snapshots, timestamp, actor ID and actor email. Existing contacts were preserved:
55 certificate locations produced 55 explicitly marked initial records.

The migration appends the address ID to both artwork read views while preserving
their security-invoker setting. Apply it before deploying the address/history UI.
Run `supabase db query --linked --file tests\db\certificate-location.sql` to
validate insert, unchanged save, address-only change, mismatched contact,
removal and snapshot preservation. The test uses rollback-only fixtures and
does not persist artwork or contact changes.

### Automatic artwork view date

`20261024100000_set_view_date_when_viewed.sql` fills an empty `view_date` when
an artwork transitions to `Viewed`, or is created with that status. Existing
view dates and explicitly supplied dates are preserved. The day is calculated
in `Europe/Zurich`, including daylight saving time. Already-viewed artworks
are not backfilled, and unrelated saves do not change their date.
The database trigger covers inline lists, forms and API writes. Creation/edit
forms also prefill the date immediately when selecting Viewed; users can adjust
it before saving. List updates read back the persisted date.

### Restoring imported artist place names

`20261024093000_restore_artist_place_encoding.sql` restores 149 damaged
birth/death place fields across 142 artists from the original Access
`TDIArtistes` table. The source was opened read-only and read directly through
DAO to preserve Unicode. Artists were matched by normalized first/last names,
not by legacy numbers, which differ in the available source copy.
Each correction preserves all characters other than the lost replacement
characters and has a single matching source value. Names, relationships and
other artist fields are unchanged.

The migration includes original and restored values and aborts if a target no
longer matches its original value. After applying it, verify that no artist text
contains `chr(65533)` (the Unicode replacement character). Do not strip accents
or replace every damaged character with the same letter.

### Artwork quality

Apply `20261024090000_add_artwork_quality.sql` before deploying the Quality UI.
`artworks.quality` is nullable and accepts only integer ratings from 1 to 10;
existing artworks remain unrated. Active, All and Collection lists display
Quality between Status and Priority, with inline editing for Editors and
Administrators and read-only access for Viewers. Quality is also available in
artwork creation and editing.

The database trigger records the initial rating and every actual change,
including clearing a rating, atomically in `artwork_quality_history`. Each entry
stores the previous/new values, timestamp and actor ID. Saving the same value
does not create history. Authenticated clients can only read history for artworks
they can view, and cannot insert, alter or delete history entries. On the
factsheet, clicking the rating (between Priority and Status at the top right)
loads the dated changes; only the score is displayed, without a Quality label
or separate History button. The artwork editing page retains its History button;
lists have no history control.
Collection displays Status, Quality and Priority on one line.
Lists use compact selectors and display the priority `Information` as `Info`,
without changing its stored value.
On the editing
page these fields are right-aligned above the images; the heading shows the
artist's first and last names. Both artwork list views expose Quality.

### Inventory Geneva Freeport

Apply `20261011211500_create_geneva_freeport_inventory.sql` before opening
`/inventory/geneva-freeport`. Editors and Administrators can edit; Viewers can
read only artworks proposed to their linked clients, enforced by existing artwork
RLS and `security.can_view_artwork` on both inventory tables. It includes only
artworks with location contact `abbcf211-f94e-4435-918e-775390164cb2` (Florac Works)
and address `9b46dacc-7e21-4be6-ac45-7c4dfc62882f` (PF, Geneva, Switzerland).
These are existing contact/address identifiers, shared by the API and save RPC.

`geneva_freeport_inventory` stores the external inventory number, owner,
provenance, entry value/currency, inventory insured value in USD, room/shelf,
packing, notes, and original import provenance. Inventory numbers are not unique:
the source repeats HES.1 for two separate Eva Hesse artworks.
The page shows only Document Date, Inventory No., Image, Goods designation,
RoomShelf, and Edit Inventory, in that order. The image is the first artwork
image document. Document Date is taken from the first customs document.
Previous documents, issuing offices, stamp dates, provenance and 11.95
references remain accessible in Edit Inventory and are still searchable.
Click column headings to toggle ascending/descending artwork sorting.
The initial order is Document Date, newest first. Geneva Freeport and Insurance
use the same top spacing as Commissions so their titles clear the HeaderNav.
Customs columns sort by the first displayed document without reordering history;
numeric values sort numerically and missing values remain last in both directions.
Export Excel downloads `inventory-geneva-freeport.xlsx` for the current search
and artwork sort order. The Inventory sheet includes ArtMuse goods designations,
all inventory fields and the insured-value total; Customs history includes every
document and its individual values, dates, source row and artwork ID.
Dates are native Excel dates and amounts remain numeric. Unsaved form edits are
excluded, with a confirmation warning when a draft has changes.
`geneva_freeport_customs_documents` preserves every document row and its own
dates, issuing office, 11.95 reference, values, storage, and packing information.
Excel continuation rows belong to the immediately preceding artwork, not to
a globally unique inventory number. Excel serial dates must be converted as
calendar dates, without a UTC timezone shift.

The separate inventory form saves both tables atomically through
`save_geneva_freeport_inventory`; a failed document save rolls back the whole
change. Goods designation is composed from current ArtMuse artist, title,
execution years, medium, signature, edition, and dimensions. The original Excel
description is preserved only as import provenance. These records are never
joined into factsheet views and do not overwrite artwork descriptions, years,
dimensions, costs, or insured values. When an artwork leaves the PF location,
it disappears from the page but its inventory and document history remain stored.

The initial `Florac_Inventaire douanier2.xlsx` import matched 56 artworks and
preserved 73 customs rows. Location was set to Florac Works / PF for 55 artworks.
Trisha Donnelly's Untitled retained its existing location because the workbook
indicates an exhibition in Frankfurt; its inventory/history were still imported.
The PF inventory total is USD 13'245'000, matching the workbook's explicit
`SUM(K6:K78)-500000` formula. All ArtMuse artwork descriptions, dimensions,
execution dates, costs and insured values were preserved. Source inventory
insurance values remain separate, including Donnelly's USD 500'000.

### Insurance email drafts

Apply `20261011214000_viewer_insurance_freeport_read_access.sql` for Viewer
read access to Insurance policies and Freeport inventory/history. Both pages
are linked in the Viewer Collection menu. Insurance loads the current user's
client links from `/api/insurance/clients`; Viewers can switch only between their
own clients and cannot edit policy dates/rates or use the insurance email action.
Freeport exports include only visible artworks. Freeport saving remains
Editor/Administrator-only in both the API and database write policies.

The Insurance page provides an Email action beside each artwork premium.
It opens the user's mail application with a draft addressed to
`alison.hillier@howdengroup.com`, using the purchase date, artist, title,
execution years, medium, dimensions, original insured value and currency,
current location contact, and destination contact. Dimensions are composed
from `artworks.height_cm`, `width_cm`, and `depth_cm` (height x width x depth,
in cm), omitting empty or zero values. No email is sent by ArtMuse.
Missing information is explicitly flagged beside the action and represented
by placeholders in the draft for the user to complete before sending.
No additional database migration is required for this action.

### Artwork execution year range

Apply `20261011203500_add_artwork_start_year.sql` with `npx supabase db push`
before using Year (start). The existing `year_execution` is the end year;
`year_execution_start` is optional. A start year requires an end year and
must not exceed it. Single-year works continue to use only the existing field.
Ranges display as `2024/2026` in artwork lists, details, factsheets, inventory,
insurance, valuations, commissions, and shipments. Import prefills and drafts
preserve the separate start year. This migration exposes the field in the
artwork and inventory views without changing existing filters or grants.
It does not infer dates from titles or alter existing artwork titles or years.

### Artwork edition

Apply `20261011194500_add_artwork_edition.sql` before using the Edition field.
It adds nullable free-text `public.artworks.edition` and exposes it through
`artworks_full_admin` and `viewer_artworks_full_secure`, preserving their
existing columns, access filters, and grants. Existing records remain unchanged.
Edition is displayed after Signature in creation, editing, and factsheets,
and is carried through import prefills and saved drafts. Existing signature
text is not automatically split or migrated into the new field.

### Inventaire par buyer

La migration `20261010150000_add_inventory_all_buyers.sql` doit etre appliquee
avant d'utiliser le selecteur Buyer de l'inventaire. Elle ajoute une vue de
lecture sans modifier les donnees ni les politiques existantes.
Le selecteur liste les buyers des oeuvres achetees accessibles a l'utilisateur,
independamment de la case `is_client`. Par defaut, tous les buyers sont inclus.
Le selecteur Client est synchronise avec celui de l'en-tete. Lorsqu'un client
est choisi, l'inventaire affiche les oeuvres `Bought` qui lui ont ete proposees
via `artwork_proposals`, independamment du buyer (y compris sans buyer).
Le selecteur Buyer reste disponible et liste les acheteurs des oeuvres du client.
Les deux filtres se cumulent; "Tous les buyers" inclut tous ses achats, meme
sans buyer. Sans client selectionne, le filtre Buyer s'applique a tout
l'inventaire. La recherche, les dates, les totaux, Excel et l'impression
utilisent cette meme selection.

### Inventaires USD : YAL et Indianart

La migration `20261010160000_inventory_location_addresses.sql` ajoute les
contacts et adresses de destination/localisation a la vue d'inventaire.
La colonne Location affiche la destination de l'oeuvre et l'adresse choisie.
Si un transport existe avec `arrival_date IS NULL`, elle affiche plutot la
localisation actuelle et son adresse. Sans destination, elle utilise aussi
la localisation actuelle (notamment apres une arrivee, qui vide la destination).
Une adresse non selectionnee est signalee, sans choisir arbitrairement une
autre adresse du contact. Le tri, la recherche et Excel utilisent ce meme libelle.

Quand YAL est selectionne comme client ou buyer, ou Indianart comme buyer,
la colonne Fees est retiree (ecran, impression et Excel). Le total USD est
`(cost_amount + commission_blondeau) * FX`, sans `purchase_cost`.
Les autres inventaires conservent leurs calculs EUR et leurs frais.

L'API authentifiee `/api/inventory/usd-rate` consulte Frankfurter avec le
provider `ecb` pour la devise et la date d'achat. Aucun montant, nom de client
ou identifiant d'oeuvre n'est transmis au fournisseur. Le taux correspond
au dernier jour publie au plus tard a la date d'achat (week-ends et jours
feries inclus); la date effective est affichee et exportee. Les reponses
sont mises en cache 24 heures. USD vers USD vaut 1.
Une devise non couverte, une date invalide ou une panne du fournisseur
produit une erreur explicite; les exports sont bloques et les totaux
incomplets ne sont pas presentes comme des totaux valides.

### Mise sous gestion des migrations

Effectuer cette initialisation une seule fois depuis un poste d'administration
ayant la CLI Supabase et une connexion au projet de production. Le mot de
passe de base n'est jamais committe ni place dans une variable `NEXT_PUBLIC_*`.

```powershell
npx supabase@latest init
npx supabase@latest login
npx supabase@latest link --project-ref <project-ref>
npx supabase@latest db pull
```

Verifier le SQL genere dans `supabase/migrations/`, en particulier les
politiques RLS, fonctions, vues, triggers, extensions et les objets
`storage`. Committer ce snapshot dans une PR dediee avant toute evolution.
La CLI demande les informations de connexion necessaires; ne pas les copier
dans les fichiers du depot.

### Changement ulterieur

```powershell
npx supabase@latest migration new <description-kebab-case>
# Modifier le fichier SQL cree dans supabase/migrations/
npx supabase@latest db reset
npx supabase@latest db push --dry-run
npx supabase@latest db push
```

Une migration est immuable apres application en production. Pour corriger un
changement, creer une nouvelle migration de correction. Toujours decrire dans
la PR les effets sur les donnees, les politiques, les index et le plan de
retour arriere. Ne jamais executer `db push` depuis une branche non revue.

Avant le premier `db pull`, les changements de schema doivent etre effectues
par le SQL Editor uniquement dans une fenetre de maintenance et etre
immediatement captures dans la migration initiale.

## RLS

RLS doit etre active sur toutes les tables de `public`, y compris les tables
de reference et les tables nouvellement ajoutees. Les vues exposees a
PostgREST doivent respecter les privileges de l'appelant, et non etendre les
droits via un proprietaire de vue privilegie.

La matrice ci-dessous est le contrat minimal a verifier dans les politiques
de production. Elle ne remplace pas l'audit des politiques effectivement
deployees.

| Ressource | `Viewer` | `Editor` | `Administrator` |
| --- | --- | --- | --- |
| `profiles` | Lire les profils requis par l'UI; modifier seulement sa propre `last_activity_at`. | Idem. | Gerer les profils et les roles. |
| `artists`, `contacts`, `artworks`, `documents`, `artwork_proposals`, `buyer_search_requests` | Lecture. | Lecture et ecriture. | Lecture et ecriture. |
| `artwork_imports` | Aucun acces direct necessaire. | Acces aux imports crees/utilises par l'outil d'import. | Acces complet. |
| `artwork_viewer_comments` | Lire les commentaires autorises; inserer et supprimer uniquement les siens. | Moderation si requise par le produit. | Acces complet. |
| `contact_users` | Aucun acces direct. | Aucun acces direct sauf besoin explicite. | Acces complet. |
| `market_sections`, `market_section_items`, `fx_rates_history`, vues | Lecture. | Lecture et ecriture sur les tables; lecture sur les vues. | Lecture et ecriture sur les tables; lecture sur les vues. |

Les requetes admin executees avec `service_role` doivent rester dans des
routes serveur authentifiees par `requireRole`; ne pas assouplir RLS pour
compenser une route serveur manquante.

Audit periodique des tables sans RLS ou sans politique:

```sql
select n.nspname as schema, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname = 'public'
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;
```

## Storage

| Bucket | Visibilite requise aujourd'hui | Chemins ecrits | Ecrivain |
| --- | --- | --- | --- |
| `artwork-images` | Public: les documents stockent une URL publique. | `<artwork-id>/<nom-de-fichier>` | Editors et administrators, via navigateur ou route API. |
| `artwork-imports` | Public: l'OCR consomme actuellement une URL publique. | `<user-id>/<import-id>/label.<extension>` | Route serveur avec `service_role`. |

Les buckets publics permettent la lecture sans session de toute URL connue.
Ils conviennent uniquement si les images et etiquettes ne sont pas
confidentielles. Si ce n'est pas acceptable, rendre les buckets prives et
remplacer `getPublicUrl()` par des URLs signees; ce changement doit etre
livre avec une migration des politiques et une modification applicative.

Avec les buckets publics, conserver les politiques `storage.objects` pour
l'ecriture: seuls `Editor` et `Administrator` peuvent inserer, mettre a jour
ou supprimer dans `artwork-images`; seul le serveur `service_role` ecrit dans
`artwork-imports`. Les politiques doivent toujours filtrer
`bucket_id = '...'`.

## Sauvegarde et restauration

### Sauvegarde

#### Recurring backup deployment decisions (29 October 2026)

The selected execution host is Windows Server `SERVEUR`, administered
through Remote Desktop or a local session, not the user's workstation.
The requested schedule is daily at 22:00 Swiss local time (including
daylight-saving changes). Initial failure monitoring will use logs and
Task Scheduler status; email alerts have not been configured or requested
for this first deployment. No scheduled task has been installed yet.

Before deployment, check the server's timezone, installed Node/PostgreSQL
tools, local `Company` share path and free space. Task credentials must
work without an interactive login, and the intended task account must
have the required local backup-folder permissions and outbound access.
Do not use mapped workstation drive letters or assume workstation
dependencies/secrets exist on the server. Unattended PostgreSQL password
handling and Storage credentials still need a protected server-side setup;
the existing interactive password prompts cannot be scheduled as-is.

Server-side preparation confirmed by the operator on 29 October:

- Host: Windows Server 2022 Standard x64, domain controller for
  `blondeau.local`; timezone `W. Europe Standard Time`.
- Node 24.22.2 runs from
  `C:\Program Files\ArtMuseTools\node-v24.22.2-win-x64\node.exe`.
  The official ZIP SHA-256 matched; MSI installation failed with no
  confirmed root cause. PostgreSQL command-line tools report 18.6 under
  `C:\Program Files\PostgreSQL\18\bin`.
- The `Company` share maps to `D:\Company`; approximately 211.6 GiB was
  free on D: at the initial check. Use local paths for server execution.
- The backup root's inherited broad Users access was removed after an
  ACL export processed 39,764 entries without errors. SYSTEM,
  Administrators and `BLONDEAU\philippe` retain inheritable Full Control;
  descendant checks found no unexpected identities/protected inheritance.
  The operator's workstation still accessed the existing database archive.
  The new `automated` child grants only `BLONDEAU\svc_artmuse_backup`
  additional Modify access; this includes deletion within that child.
- `svc_artmuse_backup` belongs only to Domain Users and remains disabled.
  The operator chose a non-expiring password for this account alone,
  instead of the domain's 42-day expiration. Keep the unique random
  password in the professional vault and rotate on compromise/personnel
  changes; no domain-wide password policy was changed.
- A separate GPO, `ArtMuse - SERVEUR - Backup batch logon`, is linked to
  Domain Controllers with link order 1, not enforced, and security
  filtering restricted to computer `BLONDEAU\SERVEUR$`. The default GPO
  was not edited. The effective batch-logon right includes the service
  account SID and preserves Administrators, Backup Operators and
  Performance Log Users. No batch-logon deny entry appeared in the
  supplied export. This does not yet prove successful task execution.

Scripts deployment, protected secrets, runtime permissions and a tested
scheduled task remain outstanding. Do not copy production application
environment files wholesale or activate the service account prematurely.

The operator selected LocalMachine DPAPI for unattended production
credentials. `scripts/initialize-backup-secrets.ps1` must run on SERVEUR
only; it checks the protected `BackupSecrets` directory ACL and prompts
for the production database password and Storage server key with masked
input. It writes only a DPAPI-encrypted envelope with create-new semantics,
never overwriting existing credentials. `-VerifyOnly` checks local
decryption without showing values or contacting Supabase. Legacy JWT keys
are checked for production reference/service_role, not cryptographically
authenticated; opaque secret keys cannot be project-checked offline.
Remote authentication still needs validation. No task/account is enabled.
The ACL check permits Windows' standard `ReadAndExecute, Synchronize`
combination for the service account, while rejecting write, delete and
permission/ownership changes. The first provisioning attempt rejected
`Synchronize` before prompting for credentials; the validator was corrected
without changing directory permissions.
Machine DPAPI is not account-bound: any principal obtaining the file on
SERVEUR could decrypt it. Keep directory/file access limited to SYSTEM,
Administrators and service-account read/execute; never copy secrets into
the scripts folder, chat or application environment files. Plaintext is
necessarily present briefly in process memory; managed strings cannot be
reliably wiped. Preserve original credentials in the vault for recovery
on a replacement machine. Runtime integration is not yet implemented.

The operator confirmed successful secret provisioning and local decryption
on SERVEUR on 29 October. This does not yet verify remote authentication.
Deploy `test-backup-connectivity.ps1` beside the provisioning script, then
run it on SERVEUR as administrator. It reuses the provisioning ACL checks,
decrypts only in memory and temporarily supplies the database password via
the child process environment, never command arguments. Existing
PGPASSWORD/PGOPTIONS values are restored in finally blocks.
The PostgreSQL probe uses a read-only metadata query with a 30-second
statement timeout and expects 39 public tables and three named buckets.
The Storage probe uses GET bucket metadata only, disables redirects, accepts
legacy service_role or secret-key authentication and verifies the three
bucket IDs without printing response bodies. No Storage object is listed,
downloaded or modified. A dated connectivity JSON report is saved under
`automated`; failures remain explicit with sanitized diagnostics.
Passing this administrator-run probe does not test the service account,
actual backups or Task Scheduler. Keep the account disabled until those
separate preparation steps are ready.
The first remote probe returned an unexpected-state result after a
successful psql exit, before the Storage HTTP check. The diagnostic now
records/displays only database/user identity, read-only status, public table
count and required bucket count separately. Expected values are unchanged;
do not infer the cause or relax checks until these metadata are reviewed.
The detailed retry confirmed the expected postgres identity, 39 public
tables and three buckets, but `transaction_read_only` was `off` despite
the PGOPTIONS setting. The probe now explicitly starts a `READ ONLY`
transaction and sets statement/lock timeouts inside it, rather than relying
on connection-startup options. The read-only assertion is retained.
The exact cause of the ineffective startup setting is not established.
The failed probes executed only metadata SELECTs; the HTTP Storage check
was not reached. The corrected probe passed on SERVEUR on 29 October at
12:41 local time: postgres identity, read-only transaction, 39 public
tables and three buckets matched, and the Storage metadata request passed.
The persisted report confirmed both connection checks. This was an
administrator-session test only; no backup was performed and service
account execution/scheduling remain untested.
The manual Task Scheduler diagnostic subsequently returned exit 0 with
both connection checks true. Its initial report did not record Windows
identity and retained a constant `taskIdentityTested: false`; the supplied
report/task timestamps also did not match exactly. Do not treat this as
conclusive service-account execution evidence yet. The probe now records
the actual Windows token name/SID, computer and process ID, and marks
`taskIdentityTested` true only after both checks pass under the dedicated
account's SID. Rerun the manual task and correlate its fresh report before
proceeding. No daily trigger or actual backup is configured by this probe.
The subsequent supplied report records the actual account
`BLONDEAU\svc_artmuse_backup` on SERVEUR, both read checks true and
`taskIdentityTested: true`; Task Scheduler returned 0. Dedicated-account
read connectivity is now evidenced, not just administrator connectivity.

The next manual task can use `run-server-database-backup.ps1` alongside
`backup-supabase-database.ps1` and the provisioning script in BackupScripts.
The wrapper enforces SERVEUR and the dedicated account SID, holds an
exclusive file lock against overlapping database runs, decrypts credentials
in memory and restores the previous PGPASSWORD environment in finally.
The exporter retains its interactive default; `-Unattended` requires
PGPASSWORD and uses `--no-password` to prevent a hung prompt. Each run
creates new directories under `automated`, checks archive listing and
decompression, and records size/SHA-256. The wrapper rechecks the new
manifest/hash and writes `database-run-<run>.json`; failures are explicit,
with credential strings redacted. No previous archive is replaced/pruned.
This tests database backup only, not Storage or a restored new archive.
Deploy the scripts first; use a separate manually triggered task with the
same limited/password principal as the connectivity task and change only
its name/action script to the database wrapper. Do not add a daily trigger
until an actual run and report have been verified.
The first manual database task passed on 29 October, with archive creation
at 13:05 local time under `BLONDEAU\svc_artmuse_backup`. The new archive
was 8,304,021 bytes. An independent read from the share confirmed the
complete manifest and matching report/manifest/file SHA-256
`ab11faa4a8a138e86b33895f5cf4c214c850c3a7144b4f591136803978786da4`.
Task Scheduler returned 0. This archive has not been restore-tested;
Storage was not backed up by this task and no daily trigger is configured.

Current archived payloads total approximately 1.74 GiB (database plus
Storage). Thirty full copies would consume about 52.26 GiB, and ninety
about 156.78 GiB, excluding growth, metadata, logs, partial runs and other
backups. These are capacity estimates, not an approved retention policy.
Versioned incremental Storage backups should avoid recursive API scans
and unnecessary re-downloads without overwriting prior recovery points.
Incremental scheduling, retention and automatic deletion are not yet
implemented. Preserve all existing independent backups and restore reports.

#### Independent Windows database archive

With the PostgreSQL command-line tools installed (no local database server
required), run this from the local project directory in an interactive
PowerShell terminal:

```powershell
& .\scripts\backup-supabase-database.ps1
```

The script uses the ArtMuse Session pooler on port 5432 with required TLS
and prompts for the PostgreSQL password locally. Never paste the password
into chat, arguments or scripts. The default destination is the private,
encrypted `C:\DEV\artmuse` directory; each run creates a dated subdirectory.
The default tools are PostgreSQL 18, compatible with the observed server 17.6.

For the restricted company backup share (mapped as `P:` on this PC), use
the UNC path rather than relying on a mapped drive in scheduled processes:

```powershell
& .\scripts\backup-supabase-database.ps1 -OutputDirectory '\\SERVEUR\Company\9010 BASES\artmuse\sauvegarde'
```

The share is reported to have an off-site/offline backup. Confirm its
capacity, retention, encryption and inclusion in that backup with the
administrator. Writing to a server share from this PC does not make the
backup job server-hosted: the PC and network must remain available.

The script produces a custom-format `database.dump`, a private error log,
an archive index, and a manifest recording byte size and SHA-256. It checks
native command exit codes, reads the index and decompresses the archive
to the Windows null device without executing SQL. Interrupted or failed
exports must not be used; only a successful run sets `complete: true`.
This verifies archive readability, not restore compatibility or application
correctness. A separate disposable Supabase project is required for a restore
test; do not restore this archive onto the running production project.

This is a full database dump of objects accessible to the PostgreSQL user,
not the filtered Supabase CLI roles/schema/data export described below.
Managed schemas, owners, privileges and extensions may require special
handling when restoring into Supabase. Cluster roles/passwords, Storage file
contents, platform/OAuth configuration and encryption root keys are not
included. Treat the archive as confidential: it can contain personal data,
authentication records and secrets embedded in database functions.

#### Verified Windows Storage copy

For diagnosing differences without recursively listing thousands of folders,
export Storage metadata with the locally installed PostgreSQL tools:

```powershell
& .\scripts\export-storage-inventory.ps1
```

Enter the database password only at the local PostgreSQL prompt. This makes
a single read-only, repeatable-read transaction against `storage.objects`
and `storage.buckets`, with query and lock timeouts. It creates a dated JSON
inventory in the restricted company backup share, without modifying remote
objects or the existing backup. The JSON includes private object names and
metadata: do not paste it in chat or commit it to Git. Metadata export alone
does not download files or make an incomplete backup complete. Compare it
with the saved file manifest before deciding which objects need copying.

For an unchanged/additions-only inventory, reconcile and verify the backup:

```powershell
node --env-file=.env.local scripts\backup-supabase-storage.mjs --finalize-inventory '<absolute-backup-directory>' '<absolute-exported-inventory.json>'
```

This rechecks saved file hashes, downloads additions, preserves the supplied
inventory as `source-inventory.json`, and verifies all file hashes before
success. It refuses to overwrite a valid saved version that has changed
or to drop deleted objects from the manifest. Those cases require a
version-preserving incremental workflow. Completion records the SQL
inventory timestamp and validation basis: matching that dated inventory
is not an atomic Storage snapshot or a tested restoration. No slow
recursive remote scan is performed in this mode.

The database backups shown in Supabase **Database > Backups** do not include
Storage object contents. Back up all three ArtMuse buckets: `artwork-images`,
`artwork-imports` and `artwork-thumbnails`.

From the local project directory on Windows, with Node.js 20.20.2 or later
and the existing server-only credentials in `.env.local`, run:

```powershell
node --env-file=.env.local scripts\backup-supabase-storage.mjs --output "C:\DEV\artmuse"
```

This requires no package installation, Docker, SSH, or changes on Infomaniak.
The destination must be private, outside Git, and on an encrypted disk.
Each run creates a new dated directory without overwriting previous copies.
The script only reads Supabase: listing requests use POST, downloads use GET.
It waits one second before each request, downloads sequentially, paginates folders, checks byte counts and local
SHA-256 hashes, and repeats the inventory to detect changes during the copy.
HTTP 429 responses are retried up to four times, respecting Retry-After
delays of at most one minute, or using bounded exponential backoff.
Transient network failures/timeouts also receive up to four bounded retries.
Avoid uploads, edits and deletions during the backup; this is not an atomic
Storage snapshot. Hashes verify local integrity, not an independent remote
cryptographic checksum.

Objects have hash-based `.bin` filenames for Windows compatibility.
`manifest.json` maps them to their original bucket/path and records bucket
settings, object metadata, sizes and checksums, but never credentials.
A successful run prints `COMPLETE`; failed runs exit nonzero and leave
`complete: false`. Preserve the manifest with the objects. Recheck a copy with:

```powershell
node scripts\backup-supabase-storage.mjs --verify "C:\DEV\artmuse\<dated-backup-directory>"
```

The script saves `inventory.json` after each listing page and `manifest.json`
after every verified download. A timestamped `backup.log` records progress
and handled errors without credentials. A forced process termination may
leave no failure message; `complete: false` always means incomplete.
On Windows shares, replacing checkpoints or downloaded files retries
`EPERM`, `EACCES` and `EBUSY` up to five times (1, 2, 4, 8 and 16 seconds).
The previous checkpoint is never deleted to bypass a replacement error.
Persistent permission/locking errors still stop the backup explicitly;
check share permissions and locks with the administrator rather than
disabling server security or assuming the backup completed.
Storage HTTP 429 and transient server/gateway responses (including 544)
are retried up to four times with bounded backoff. Failed responses log
request IDs, relevant headers and a short redacted body excerpt; object paths,
credentials and tokens are not logged.
Resume an interrupted run created by this version with:

```powershell
node --env-file=.env.local scripts\backup-supabase-storage.mjs --resume "C:\DEV\artmuse\<dated-backup-directory>"
```

Resume reuses the saved inventory and checks local file hashes before
skipping downloads. Missing/corrupt files are downloaded again. A fresh
remote inventory is still required before completion; its progress is saved
page by page and resumes after interruption. Remote changes invalidate the
affected inventory and verification checkpoint for the next resume. Do not run two
processes against the same backup directory. Earlier backups without
`inventory.json` cannot be resumed; start a new backup instead.

To relocate a resumable backup, stop its process first, copy the complete
directory (including inventory and manifest), compare SHA-256 hashes of
all copied files, then resume only the destination copy:

```powershell
node --env-file=.env.local scripts\backup-supabase-storage.mjs --resume '\\SERVEUR\Company\9010 BASES\artmuse\sauvegarde\<dated-backup-directory>'
```

Keep the original until the destination is verified. It becomes a frozen
checkpoint, not a second actively updated backup. Never run both copies
concurrently.

This is a manual Storage backup, not an automated schedule or a tested
restoration. It does not back up the database, RLS policies, authentication
configuration, Infomaniak, or SharePoint documents. The isolated sample
restore below tests nine objects, not a full Storage restoration.
A separate database export, protected
configuration inventory and restore test are still required.

La sauvegarde doit etre quotidienne, chiffree au repos, stockee hors du projet
Supabase et retenue selon la politique de l'entreprise. Faire aussi un test de
restauration au moins chaque trimestre.

Definir temporairement l'URL PostgreSQL de production dans la session
PowerShell depuis le coffre de secrets, puis generer trois dumps:

```powershell
$env:SUPABASE_DB_URL = '<postgresql-connection-string>'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force -Path ".\backups\$stamp" | Out-Null
npx supabase@latest db dump --db-url $env:SUPABASE_DB_URL --role-only -f ".\backups\$stamp\roles.sql"
npx supabase@latest db dump --db-url $env:SUPABASE_DB_URL --schema-only -f ".\backups\$stamp\schema.sql"
npx supabase@latest db dump --db-url $env:SUPABASE_DB_URL --data-only --use-copy -f ".\backups\$stamp\data.sql"
```

Exporter les objets des deux buckets dans le meme repertoire (ou un stockage
chiffre dedie), puis consigner le nombre de fichiers et la taille obtenus:

```powershell
npx supabase@latest storage cp --recursive ss:///artwork-images ".\backups\$stamp\artwork-images"
npx supabase@latest storage cp --recursive ss:///artwork-imports ".\backups\$stamp\artwork-imports"
```

Ne jamais archiver `SUPABASE_DB_URL`, les cles API ou les fichiers `.env` avec
la sauvegarde.

### Restauration

#### Isolated table-data restore test

The test project `artmuse-restore-test` has reference
`sontvcvvtftvivysiccg`, distinct from production. Keep its Data API disabled
and do not connect the application, OAuth providers or outbound automation.
The first stage intentionally tests only the 39 public tables, sequences
and archived data:

```powershell
& .\scripts\test-restore-database.ps1
& .\scripts\test-restore-database.ps1 -Execute
```

The first command prepares private SQL and counts without connecting.
The second connects only to the hard-coded test Session pooler and prompts
locally for its unique password. Each run creates a separate report folder
on the private company backup share. The source archive hash is checked;
the target public schema must be empty. No clean/drop operation is used.
Tables, data and count assertions run in one transaction with stop-on-error,
so any SQL failure rolls back the restore. Existing managed schemas are
not restored. Only pg_dump table/sequence/data entries are selected, not
triggers, policies, grants, indexes or foreign keys. The sole restored
function is the archived `public.immutable_unaccent(text)` dependency of
the generated library search column. The test installs `unaccent` if needed
and pins this function's search path to `public, extensions, pg_catalog`
because pg_dump clears the session search path. Execute access is revoked
from PUBLIC, anon and authenticated. Anonymous,
authenticated and PUBLIC access to restored tables/sequences is revoked.

A passing `result.json` confirms table-data recovery and exact row counts
from the archive, not referential integrity, RLS correctness, login,
Storage restoration, encryption secrets or application behavior. It never
marks the original archive as fully restore-tested. Preserve private SQL,
counts and logs; they contain application data and must not enter Git.
Subsequent stages must explicitly validate dependencies and permissions
before enabling the Data API or running application workflows.

#### Isolated internal-integrity restore test

After the table-data test, prepare then execute the next stage:

```powershell
& .\scripts\test-restore-integrity.ps1
& .\scripts\test-restore-integrity.ps1 -Execute
```

The script checks the archive SHA-256 and previous passing data report.
It targets only `sontvcvvtftvivysiccg`, prompting locally for its database
password. It restores 47 primary/unique constraints, 84 standalone indexes
and 67 public-to-public foreign keys from the archive. Seven foreign keys
to `auth.users` are explicitly deferred and listed in a private report:
Auth accounts were not restored. No dummy users, managed schema changes,
application triggers, RLS policies or outbound automation are introduced.
The `pg_trgm` extension is required in archived schema `public`; if already
installed elsewhere, the script stops rather than relocating it.

Guards require the 39 restored tables, unchanged archived row counts,
no existing public table indexes or key constraints and no application
triggers. It is intentionally not rerunnable after success. All additions
and validations execute in one transaction, with stop-on-error and
10-minute per-statement/5-second lock timeouts retained in the dump header.
Each selected constraint/index is checked by name for validated/valid
status; final totals include 131 indexes (84 standalone plus 47 backing
key constraints). Table row counts are checked again after restoration.
Foreign-key creation validates existing data; a violation or missing
dependency aborts and rolls back all additions.

The private `integrity-restore-test-<run>` directory contains SQL, logs,
the exact archive selection, deferred Auth relation list and `result.json`.
A passing `internalIntegrityTestPassed` does not validate the deferred
Auth relations, login, permissions, RLS or application behavior.
Keep the Data API disabled; `fullRestoreTested` remains false.

This stage passed on 29 October 2026 at 09:38 UTC. The persisted report
confirmed `internalIntegrityTestPassed: true`; the error log was empty.
All 47 key constraints, 84 standalone indexes and 67 internal foreign keys
passed validation, with archived counts preserved for all 39 tables.
The seven Auth foreign keys remain deferred. Do not rerun this stage on
the now-populated target structure.

#### Offline Auth and access-dependency inventory

On 29 October 2026, the source archive checksum was verified again and
schema-only SQL was extracted to the restricted backup share under
`access-review-20261029-104058`. No database connection or access change
was made. `schema-private.sql` must remain private: schema definitions
can contain sensitive literals. `inventory-summary.json` records object
counts and dependency names, not a successful access test.

The archive contains RLS-enable entries for all 39 public tables,
115 public policies, seven Storage policies, 14 public views (all with
`security_invoker` in their definitions), 32 public functions and nine
functions in the custom `security` schema. The nine security functions
include eight access helpers and one document-change trigger function.
Public/Storage policies call `auth.uid()`, `auth.role()` and security
helpers for administrator/editor status, contact access, artwork access
and document/comment visibility. Restoring only public tables therefore
does not recreate application permissions.

The archive also contains Auth table-data entries, including users,
identities, sessions, tokens and MFA records. These entries have not been
restored or validated for a new project's Auth configuration. Do not copy
them wholesale merely to resolve the seven deferred foreign keys.
The `auth.users` creation trigger and 29 public application triggers are
also still excluded. In particular, keep the acquisition email function
and its trigger disabled; do not activate outbound automation for a test.

The next access stage should explicitly select reviewed helper functions
and policies, maintain the disabled Data API, and test role/row visibility
through PostgreSQL transactions. Simulated JWT claims can exercise RLS
without sending invitations or restoring production sessions, but do not
prove real Auth login. Restore owners, schema usage and function/table
privileges must be considered alongside policies, especially for
`SECURITY DEFINER` helpers. Restoring views, real test login and the seven
Auth relations require separate scoped validation. None of these access
checks has passed yet.

#### Isolated access-rule sample test

Prepare, then execute with the test project's PostgreSQL password:

```powershell
& .\scripts\test-restore-access.ps1
& .\scripts\test-restore-access.ps1 -Execute
```

The script requires matching passing table-data and integrity reports
and rechecks the archive hash. Only the hard-coded test pooler is used.
The target must have no `security` schema or public policies/RLS yet and
must retain the 39 restored tables and 67 validated internal foreign keys.
This stage is not rerunnable after success.

The archive selection contains the `security` schema, eight reviewed
read-only access helpers, 115 public policies and 39 RLS-enable entries.
No archive ACLs, public functions, views, Storage policies, Auth records,
application triggers or outbound automation are restored. Helpers are
owned by the restoring postgres role; default PUBLIC execution is revoked.

Inside a savepoint, the test grants temporary SELECT access, helper usage
and UPDATE on only the `id` columns of artworks/documents. Three temporary
profile rows represent Administrator, Editor and Viewer. A fourth UUID
represents an authenticated identity without a profile or contact link.
The Viewer receives one temporary invited contact link chosen from an
archived proposal with an accessible document. All fixtures and temporary
grants are rolled back to the savepoint before the outer restore commits.
No Auth account, invitation, login session or email is created.

The probes switch to the non-bypassing `authenticated` database role and
set transaction-local JWT claims. They compare 16 exact sorted UUID sets
(four identities across artworks, proposals, contact links and documents)
with expectations computed independently as postgres from table relations,
without invoking the access helpers. Positive and negative artwork access
are required for the Viewer fixture, preventing an empty-result false pass.
Eight additional no-op `id = id` update probes require one affected row
for Administrator/Editor and zero for Viewer/unlinked identities on
artworks/documents. Real SQL UPDATE is exercised, but its effects are
rolled back with the fixtures.

These are fidelity checks of selected archived rules, not a security
certification. In particular, archived document rules allow authenticated
identities to read market-section documents marked `all_clients`, even
without a contact link; the expected sets preserve that behavior rather
than asserting zero access everywhere. The archived profiles SELECT policy
also permits authenticated reads; profile visibility/writes are not tested
by this sample. INSERT, DELETE, other column updates, other tables,
anonymous RLS behavior, Storage policies, views and real login remain
untested.

Final checks require every restored policy/helper, RLS on all 39 tables,
unchanged archived row counts and no effective table/column access or
security-helper execution for anon/authenticated after temporary grants
are removed. Keep the Data API disabled and do not connect the application.
Private SQL/logs and `result.json` are saved in `access-restore-test-<run>`
on the company share. Only `accessSampleTestPassed` can become true;
`fullRestoreTested` remains false. SQL/assertion failures roll back the
entire stage; inspect the saved error log before retrying.

The first execution on 29 October reached and completed the simulated
read/update probes, then failed a final policy-name assertion: the
validator truncated the quoted name `fx admin/editor write` to `fx`.
The outer transaction did not commit. The validator now preserves the
entire archived policy name (including spaces/punctuation) and escapes
SQL string literals. This failed run is not recorded as a passing stage;
a new successful execution was required.

The corrected execution passed on 29 October 2026 at 09:48 UTC.
The persisted report confirmed `accessSampleTestPassed: true` and the
error log was empty. All 16 exact read sets and eight update probes
matched, all 115 policies and eight helpers were checked, RLS was enabled
on 39 tables, archived row counts were preserved and temporary fixture
data/grants were removed. The scope exclusions above still apply;
`fullRestoreTested` remains false. Do not rerun this stage on this target.

#### Isolated Storage sample restore test

The table-data test passed on 29 October 2026: 39 public tables and 98,803
rows matched the archive; the saved error log was empty. This remains a
partial recovery test, not a full application restoration.

The Storage sample script is locked to the same test project
`sontvcvvtftvivysiccg`. It reads only the local complete production backup,
never connects to production and does not change restored database rows.
It selects the three smallest non-empty objects in each of the three buckets
(nine objects). Local sizes and SHA-256 hashes must match before any request.
This intentionally small sample does not cover large files or all formats.

The sample test passed on 29 October 2026 at 09:34 UTC: all nine files
(12,188 bytes) were restored and re-downloaded with matching sizes and
SHA-256 hashes, and all three test buckets were verified private.
The persisted report confirmed success without errors. This verifies
sample object recovery only, not a full Storage or application restoration.

Prepare the sample without credentials or network requests:

```powershell
node scripts\test-restore-storage.mjs
```

In the **test project's** Dashboard, open **Settings > API Keys**, then
find or create a **Secret key** (`sb_secret_...`). If creating one, name it
`storage-restore-test`. Do not use a publishable key, a production key,
the database password or a personal access token. This script uses the new
secret-key format via the `apikey` header, not a legacy JWT bearer token.

Paste the test secret locally after `=` in `.env.restore-test.local`:
`ARTMUSE_RESTORE_TEST_SECRET_KEY=...`. This file matches the repository's
`.env*` ignore rule. Never send its contents through chat, screenshots,
logs or Git. Keep the PC encrypted and restrict access to the file.
Do not load `.env.local` (production) for this command.

```powershell
node --env-file=.env.restore-test.local scripts\test-restore-storage.mjs --execute
```

Each execution creates three uniquely named **private** test buckets
(`restore-sample-<run>-1`, `-2`, `-3`), preserving original object paths
inside them. It checks bucket privacy before uploads and again before
success. Uploads do not overwrite existing objects. Each uploaded object
is re-downloaded through the authenticated endpoint and its size and
SHA-256 compared with the backup. No public URL, application connection
or Data API activation is needed.

Private `result.json` reports are saved under `storage-restore-test-<run>`
on the company backup share, including original-to-test mappings and
per-object verification. They contain private object names and must not
enter Git. `sampleRestorePassed: true` means all nine downloads matched;
`fullRestoreTested` remains false. On request/verification failure, the
script stops, records failure and leaves partial test objects in place.
It does not retry ambiguous writes, overwrite, delete or clean buckets.
If a request times out, a write may have completed remotely. Inspect the
report and test project's Storage before starting a new run (which creates
new buckets). Retain successful samples for inspection; later cleanup must
target only their exact test bucket IDs. Do not remove the original backup.

Une restauration se fait vers un projet de secours ou un projet de test, pas
directement sur la production en fonctionnement.

1. Declarer l'incident, mettre l'application en maintenance et conserver les sauvegardes les plus recentes.
2. Creer le projet cible et recuperer son URL PostgreSQL depuis le coffre.
3. Restaurer les roles, le schema puis les donnees avec `psql`; traiter les erreurs avant de passer au fichier suivant.
4. Recreer les buckets et restaurer leurs objets.
5. Configurer les fournisseurs Auth/OAuth, les secrets de production et les URL de redirection sur le projet cible.
6. Verifier les migrations, RLS, la connexion OAuth, une lecture viewer, une ecriture editor et les URLs d'images avant de rediriger le trafic.

Exemple de restauration sur un projet cible vide:

```powershell
$env:TARGET_DB_URL = '<postgresql-connection-string>'
psql $env:TARGET_DB_URL -v ON_ERROR_STOP=1 -f ".\backups\<stamp>\roles.sql"
psql $env:TARGET_DB_URL -v ON_ERROR_STOP=1 -f ".\backups\<stamp>\schema.sql"
psql $env:TARGET_DB_URL -v ON_ERROR_STOP=1 -f ".\backups\<stamp>\data.sql"
npx supabase@latest storage cp --recursive ".\backups\<stamp>\artwork-images" ss:///artwork-images
npx supabase@latest storage cp --recursive ".\backups\<stamp>\artwork-imports" ss:///artwork-imports
```

Les objets Auth et la configuration OAuth ne sont pas couverts de facon
fiable par un dump de `public`; ils sont a reconfigurer et a verifier
explicitement.

## Variables de production

| Variable | Exposition | Usage | Regle |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Publique | Clients navigateur et serveur Supabase. | URL `https://<project-ref>.supabase.co` du projet cible. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publique | Client navigateur, middleware et routes avec session. | Autorisee dans le bundle; sa securite depend de RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secrete, serveur seulement | Invitations, imports et operations administratives. | Coffre de secrets uniquement; rotation immediate en cas d'exposition. |
| `PRINT_SECRET` | Secrete | Acces aux impressions via le parametre `key`. | Valeur aleatoire longue, distincte par environnement et jamais journalisee. |
| `AZURE_VISION_ENDPOINT` | Serveur seulement | OCR des etiquettes. | Endpoint Azure Vision de production. |
| `AZURE_VISION_KEY` | Secrete, serveur seulement | OCR des etiquettes. | Coffre de secrets uniquement. |
| `PORT` | Serveur | Port du processus Node. | Optionnelle; fournie par l'hebergeur. |

Configurer aussi dans Supabase Auth les URLs de site et de redirection
correspondant exactement au domaine public de production, notamment
`https://<domaine>/auth/callback`. Lors d'une rotation de cle, deployer les
nouvelles variables, verifier la connexion et les routes admin, puis
revoquer l'ancienne cle.

## Commission threshold and invoice dates

Commission print buttons (main table and per-company corrections) use an isolated
print document with a named A4 landscape page and 8mm margins. This overrides the
application's default portrait page without changing other pages. The browser
may hide its orientation selector when CSS specifies the page size; the intended
commission output is always landscape, subject to printer/driver capabilities.

Commission calculations use the combined qualifying annual purchases for Florac
and Leopold Meyer, converted to USD at each acquisition date. Purchases with an
exceptional rate (including 0%) remain excluded from the USD 5,000,000 threshold
and retain that rate. Missing FX conversions do not count toward the threshold.

Once the threshold is reached (including exactly USD 5,000,000), all purchases
without an invoice date use 7%, including earlier purchases in that year.
Earlier purchases invoiced on or after the threshold-crossing date also use 7%,
so saving a new invoice after crossing preserves its reduced calculation.
Invoices dated before crossing retain the historical chronological calculation
and remain eligible for the existing separate 1% correction. Uninvoiced purchases
are reduced directly, not included in correction invoices. Each year resets the
threshold. UI calculations, totals, exports and API calculated commissions share
the same standard-rate helper.

## Courriels d'acquisition

Pour envoyer un courriel quand une oeuvre passe a `Acquired = YES`:

1. Appliquer les migrations Supabase apres avoir verifie le projet cible avec `npx supabase db push`.
2. Verifier le domaine d'expedition dans Resend, puis definir les secrets de la fonction Edge `supabase/functions/acquisition-email`: `npx supabase secrets set RESEND_API_KEY=... ARTMUSE_EMAIL_FROM=... ACQUISITION_WEBHOOK_SECRET=... ARTMUSE_APP_URL=...`. Le prefixe `SUPABASE_` est interdit pour les secrets de fonction.
3. Deployer la fonction: `npx supabase functions deploy acquisition-email --no-verify-jwt`.
4. Definir en SQL la fonction `public.notify_acquisition_email()` (trigger `trg_notify_acquisition_email` sur `public.artwork_acquisition_events`) qui appelle `net.http_post` vers `https://<project-ref>.supabase.co/functions/v1/acquisition-email` avec l'en-tete `x-artmuse-webhook-secret` egal a `ACQUISITION_WEBHOOK_SECRET`. Ne jamais versionner la vraie valeur du secret.
5. Verifier qu'un evenement traite renseigne `email_sent_at` et consulter `net._http_response` en cas d'echec.
Les destinataires configures dans l'application sont `sandrine@blondeau.ch` et `anouk@blondeau.ch`. La cle d'idempotence Resend et `email_sent_at` evitent le renvoi lors d'une nouvelle livraison du webhook.

### Buyer assignment emails

Every saved assignment or replacement of `artworks.buyer_contact_id` sends an
email to `sandrine@blondeau.ch` only. Creation with a Buyer also sends an email;
clearing Buyer, saving the same Buyer, and unrelated edits do not. The trigger
covers all database writes, including imports, without depending on the web host.
Existing Buyers are not backfilled or notified when the migration is applied.

The email contains the artist, artwork title, Buyer, Zurich-local event date and
artwork link. `artwork_buyer_events` records the Buyer's label at assignment time,
so a later change or deletion does not alter a pending notification. Only the
service role can access these events; they are not acquisition activity in the UI.
Existing acquisition notifications to Sandrine and Anouk remain unchanged.

Deploy the updated `acquisition-email` Edge function **before** applying
`20261101150000_add_artwork_buyer_email_events.sql`. Both event types use the
existing Resend configuration and webhook secret; no Node.js release is needed.
The migration copies the configured acquisition dispatcher into
`notify_buyer_email()` with only the event-table name changed, preserving its
private endpoint/authentication without putting either in source control.
It fails explicitly if that dispatcher's expected table literal has changed.
On a fresh project without `notify_acquisition_email()`, it emits a warning:
configure `notify_buyer_email()` like the acquisition dispatcher above, using
`artwork_buyer_events` as the payload table, and attach
`trg_notify_buyer_email` as an AFTER INSERT trigger on that table.

Run `npx supabase db query --linked --file tests\db\artwork-buyer-email.sql` after
application. This rollback-only suite disables the Buyer dispatch trigger inside
the transaction, so it does not send real emails. Handler regression tests are
in `tests/lib/artworkEmail.test.ts`.

Check `email_sent_at` on `artwork_buyer_events` and `net._http_response` to verify
delivery. Failed deliveries remain pending; pg_net does not automatically retry.
Retry by delivering the same INSERT webhook with the existing event ID, table
name and secret, not by inserting a new event. Resend deduplicates concurrent
requests/retries with an event-specific key for its 24-hour idempotency window;
the saved delivery timestamp prevents later resends once recorded.

Activated on the linked production project on 2026-11-01 with approval: the
Edge function was deployed first, then only this migration was applied and
recorded atomically in Supabase migration history. The rollback SQL suite
passed before and after application. Both webhook triggers are enabled; no
existing Buyer was backfilled and no test email was sent.
An authenticated pg_net probe using a nonexistent Buyer event reached the deployed
handler and returned `404 Buyer event not found`, verifying the dispatcher,
secret and event-table routing without delivering a message.
