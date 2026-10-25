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

## Courriels d'acquisition

Pour envoyer un courriel quand une oeuvre passe a `Acquired = YES`:

1. Appliquer les migrations Supabase apres avoir verifie le projet cible avec `npx supabase db push`.
2. Verifier le domaine d'expedition dans Resend, puis definir les secrets de la fonction Edge `supabase/functions/acquisition-email`: `npx supabase secrets set RESEND_API_KEY=... ARTMUSE_EMAIL_FROM=... ACQUISITION_WEBHOOK_SECRET=... ARTMUSE_APP_URL=...`. Le prefixe `SUPABASE_` est interdit pour les secrets de fonction.
3. Deployer la fonction: `npx supabase functions deploy acquisition-email --no-verify-jwt`.
4. Definir en SQL la fonction `public.notify_acquisition_email()` (trigger `trg_notify_acquisition_email` sur `public.artwork_acquisition_events`) qui appelle `net.http_post` vers `https://<project-ref>.supabase.co/functions/v1/acquisition-email` avec l'en-tete `x-artmuse-webhook-secret` egal a `ACQUISITION_WEBHOOK_SECRET`. Ne jamais versionner la vraie valeur du secret.
5. Verifier qu'un evenement traite renseigne `email_sent_at` et consulter `net._http_response` en cas d'echec.
Les destinataires configures dans l'application sont `sandrine@blondeau.ch` et `anouk@blondeau.ch`. La cle d'idempotence Resend et `email_sent_at` evitent le renvoi lors d'une nouvelle livraison du webhook.
