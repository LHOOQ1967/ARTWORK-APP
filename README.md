# ArtMuse

Application interne de suivi des oeuvres, propositions, contacts et documents de Blondeau & Cie.

## Prerequisites

- Node.js 20 or later
- A Supabase project configured with the tables and storage buckets used by the application
- Microsoft Entra ID configured as the Supabase Azure OAuth provider

## Setup

Install dependencies and define the following environment variables in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
PRINT_SECRET=<print-secret>
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only: never expose it in browser code, source control, or logs.

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
