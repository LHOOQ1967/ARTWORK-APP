# Exploitation Supabase

Ce document est le runbook de production de la base Supabase d'ArtMuse. Les
migrations SQL ne sont pas encore versionnees dans ce depot : le schema
deploiye est donc la reference tant que le premier `db pull` n'a pas ete
revue et committe. Ne pas modifier la structure depuis le SQL Editor sans
creer ensuite une migration.

## Architecture et acces

- L'application utilise l'Auth Supabase avec le fournisseur Azure OAuth
  (Microsoft Entra ID).
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

L'inventaire ci-dessous est deduit du code applicatif. Les types, contraintes,
index, valeurs par defaut et clauses exactes restent a consulter dans la
migration canonique une fois celle-ci extraite.

| Objet | Role et relations connues |
| --- | --- |
| `profiles` | Profil lie a `auth.users.id`; contient au minimum `role` et `last_activity_at`. |
| `artists` | Referentiel des artistes, notamment nom, prenom, annees et lieux de naissance/deces. |
| `contacts` | Referentiel des personnes et societes (identite, email, telephone, ville, role, notes). |
| `artworks` | Entite centrale; liee a `artists` et plusieurs fois a `contacts` (proposeur, maison de vente, acheteur, destination, localisation et localisation du certificat). |
| `documents` | Documents d'une oeuvre: `artwork_id`, `document_type`, `label`, `url`, `position`, `created_at`. |
| `artwork_proposals` | Propositions d'une oeuvre a un contact, avec `artwork_id`, `contact_id` et `proposed_at`. |
| `artwork_imports` | Import OCR d'etiquettes: createur, statut, chemin/URL d'image, resultat OCR, donnees analysees, score et artiste rapproche. |
| `artwork_viewer_comments` | Commentaires des viewers associes aux oeuvres et aux profils. |
| `contact_users` | Association entre un utilisateur Supabase et un contact, avec statut d'invitation. |
| `market_sections` | Sections du marche (titre, categorie, dates, notes, position et horodatages). |
| `market_section_items` | Liens ou documents d'une section de marche, avec ordre et informations de vente. |
| `fx_rates_history` | Historique de taux de change utilise par l'inventaire. |
| `v_inventory_bought_florac` | Vue de lecture pour l'inventaire des oeuvres achetees. |
| `v_market_section_items` | Vue de lecture qui joint les elements de marche et leurs documents. |
| `user_has_any_access()` | Fonction RPC de controle d'acces apres OAuth. |

Les colonnes de `artworks` sont nombreuses. Le contrat frontend se trouve dans
`app/(protected)/types/artwork.ts`; il est la reference des champs metier
attendus par l'application. Ne pas renommer une colonne ou une contrainte de
relation sans rechercher son nom dans le code: les jointures PostgREST
nomment explicitement plusieurs contraintes `artworks_*_fkey`.

## Migrations

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
| `artists`, `contacts`, `artworks`, `documents`, `artwork_proposals` | Lecture. | Lecture et ecriture. | Lecture et ecriture. |
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
