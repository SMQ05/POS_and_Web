# PharmaPOS SaaS

Multi-tenant pharmacy POS, inventory, reporting, and web-store application.

## Local Development

Prerequisites:

- Node.js 20.19+ or 24+
- npm
- MySQL 8.x, either installed locally or running through Docker

Copy environment defaults:

```bash
cp .env.example .env
```

Install dependencies:

```bash
npm install
```

If Docker is available, start local MySQL first:

```bash
docker compose up -d mysql
```

The local database URL is:

```env
DATABASE_URL="mysql://pharmapos:pharmapos_password@127.0.0.1:3306/pharmapos_saas"
```

Then run:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Start the API:

```bash
npm run api:dev
```

Start the frontend in another terminal:

```bash
npm run dev
```

Frontend: `http://127.0.0.1:5173`  
API health check: `http://127.0.0.1:4000/health`

## Demo Tenant

The seed command creates one tenant:

- Tenant slug: `demo-pharmacy`
- Owner: `owner@pharmapos.pk`
- Manager: `manager@pharmapos.pk`
- Cashier: `cashier@pharmapos.pk`
- Super admin: `superadmin@pharmapos.pk`
- Password: `ChangeMe123!`

This password is only for local seeded data. Use a strong unique secret for real tenants.

## SaaS Notes

- All production data models are tenant-scoped with `tenantId`.
- Frontend login uses the tenant slug from `VITE_TENANT_SLUG`.
- Auth is API-backed with bcrypt password hashes and JWT sessions.
- Core app data loads through `/api/bootstrap`.
- New tenants can be created through `POST /api/tenants`.

## Important Production Work Still Required

- Use managed MySQL in production with backups, point-in-time recovery, private networking, and TLS.
- Add migrations and CI checks for every schema change.
- Finish replacing every frontend write path with API writes.
- Add server-side authorization checks per business operation.
- Add payment gateway integrations for JazzCash/EasyPaisa/card flows.
- Add automated tests for auth, tenant isolation, POS checkout, stock mutation, and order processing.
