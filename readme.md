# Smart Document Generator — Backend API & Event Management (Phase 2)

An intelligent document generation system engineered for college club document automation (Event Proposals, Permission Letters, Bill Certificates, Bill Summaries, and Prize Money Receipts).

This repository contains the production-grade **Node.js + Express + PostgreSQL** backend API foundation and event management services.

---

## 🏗️ Architecture Overview

The backend is built with strict separation of concerns:

- `src/routes/`: HTTP routing and middleware attachment.
- `src/controllers/`: Request orchestration, parameter extraction, and standardized response generation.
- `src/services/`: Core business logic, transactional workflows, validation rules, and authorization assertions.
- `src/repositories/`: Parameterized SQL queries and database operations using `pg`.
- `src/validators/`: Request validation using **Zod** schemas for bodies, query parameters, and route UUIDs.
- `src/middleware/`: Centralized authentication, role-based club authorization, Zod validation, and error handling.
- `src/config/`: Environment configuration management.
- `src/utils/`: Standardized JSON response formatters, custom error hierarchy, and date normalizers.
- `tests/`: Automated unit and integration tests using Node's native test runner and `supertest` with `pg-mem`.

---

## 🛠️ Configuration & Environment Variables

Copy the example configuration file:

```bash
cp .env.example .env
```

Key environment settings:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | HTTP server port | `4000` |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | `development` |
| `DATABASE_URL` | Full PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/smartdoc_dev` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `smartdoc_dev` |
| `DB_USER` | Database username | `postgres` |
| `DB_PASSWORD` | Database password | `""` |
| `APP_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM encryption of sensitive bank details | `0123456789abcdef0123456789abcdef...` |

---

## 🚀 Running the Application

### 1. Start PostgreSQL (Docker)

```bash
docker run --name smartdoc-postgres \
  -e POSTGRES_DB=smartdoc_dev \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:16-alpine
```

### 2. Run Database Migrations & Seeds

```bash
# Verify connection
npm run db:test-connection

# Check migration status
npm run migrate:status

# Apply all migrations (001 - 009)
npm run migrate

# Load demonstration data (ACM SVNIT club, demo users, sample event & templates)
npm run seed
```

### 3. Start Express Development Server

```bash
# Development mode with auto-reload
npm run dev

# Production start
npm start
```

Server starts by default at `http://localhost:4000`.

---

## 🔒 Authentication & Club Authorization

- **Authentication**: Requests must supply an authenticated user via either:
  - `Authorization: Bearer <user_uuid>`
  - `x-user-id: <user_uuid>` header
- **Identity Enforcement**: The server resolves `createdBy` strictly from the authenticated identity, rejecting any spoofed client `createdBy` values.
- **Club Data Isolation**: Users can only access, create, or update records belonging to clubs in which they hold an active membership (`club_memberships`).
- **Non-disclosing 404s**: Attempts to access events belonging to another club return `404 Not Found` rather than leaking existence via `403`.

---

## 🔄 Optimistic Concurrency & Revision Semantics

Events utilize an optimistic revision tracking mechanism:
1. Every event creation transactionally commits an initial **Revision 1** in `event_revisions`.
2. When updating an event via `PATCH /api/events/:eventId`, clients can supply `expectedRevisionNumber`.
3. If concurrent modifications have taken place, the server rejects the update with `409 Conflict`.
4. If the update payload contains no actual value differences (**no-op**), the server does not increment the revision number.
5. All past revisions and field provenance records remain permanently queryable.

---

## 📡 API Reference & cURL Examples

### 1. Health Check

```bash
curl -X GET http://localhost:4000/api/health
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "status": "UP",
    "database": {
      "status": "connected",
      "timestamp": "2026-10-20T11:30:00.000Z",
      "server": "PostgreSQL"
    },
    "uptime": 12.45,
    "timestamp": "2026-10-20T11:30:00.000Z"
  }
}
```

---

### 2. Create Event

```bash
curl -X POST http://localhost:4000/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_UUID>" \
  -d '{
    "clubId": "<CLUB_UUID>",
    "title": "Full-Stack Web Development Workshop",
    "category": "Workshop",
    "description": "Two-day workshop on React, Node.js and PostgreSQL",
    "objectives": "Equip students with production full-stack engineering skills",
    "targetAudience": "Undergraduate Computer Engineering students",
    "startAt": "2026-11-14T09:00:00+05:30",
    "endAt": "2026-11-15T17:00:00+05:30",
    "venue": "Seminar Hall 1",
    "expectedParticipants": 120,
    "status": "draft"
  }'
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "event": {
      "id": "e2a34b67-89ab-cdef-0123-456789abcdef",
      "club_id": "<CLUB_UUID>",
      "title": "Full-Stack Web Development Workshop",
      "current_revision_number": 1,
      "status": "draft"
    },
    "revision": {
      "id": "f3b45c78-90bc-def0-1234-567890bcdef0",
      "revisionNumber": 1,
      "changeSummary": "Initial event creation",
      "createdAt": "2026-10-20T11:30:00.000Z"
    }
  }
}
```

---

### 3. Retrieve Event

```bash
curl -X GET http://localhost:4000/api/events/<EVENT_UUID> \
  -H "Authorization: Bearer <USER_UUID>"
```

---

### 4. List Events with Pagination & Filters

```bash
curl -X GET "http://localhost:4000/api/events?clubId=<CLUB_UUID>&status=draft&page=1&limit=10&search=Workshop" \
  -H "Authorization: Bearer <USER_UUID>"
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 5. Update Event (Optimistic Locking)

```bash
curl -X PATCH http://localhost:4000/api/events/<EVENT_UUID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_UUID>" \
  -d '{
    "venue": "Grand Central Auditorium",
    "expectedParticipants": 200,
    "expectedRevisionNumber": 1,
    "changeSummary": "Upgraded venue due to high registration count"
  }'
```

---

### 6. Retrieve Event Revision History & Snapshots

```bash
# Get all revisions
curl -X GET http://localhost:4000/api/events/<EVENT_UUID>/revisions \
  -H "Authorization: Bearer <USER_UUID>"

# Get specific historical snapshot
curl -X GET http://localhost:4000/api/events/<EVENT_UUID>/revisions/1 \
  -H "Authorization: Bearer <USER_UUID>"
```

---

### 7. Validate Event Draft for Document Generation

```bash
curl -X POST http://localhost:4000/api/events/<EVENT_UUID>/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_UUID>" \
  -d '{
    "documentType": "permission_letter"
  }'
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "status": "needs_input",
    "errors": [],
    "missingFields": [
      {
        "field": "venue",
        "reason": "A venue is required for the selected document."
      }
    ]
  }
}
```

---

### 8. List Document Types & Templates Catalog

```bash
# Master document types catalogue
curl -X GET http://localhost:4000/api/document-types \
  -H "Authorization: Bearer <USER_UUID>"

# Active templates catalogue (published versions only, storage keys redacted)
curl -X GET "http://localhost:4000/api/templates?clubId=<CLUB_UUID>&documentType=event_proposal" \
  -H "Authorization: Bearer <USER_UUID>"
```

---

## 🧪 Automated Tests

Run the full automated test suite:

```bash
npm test
```

Includes 14 suites and 45 tests covering:
- Multi-tenant club isolation and RBAC authorization
- Event creation, atomic revision 1, check constraints
- Concurrency, optimistic locking, and conflict handling (409)
- Event listing, pagination, and SQL injection resistance
- Deterministic draft validation service
- Read-only template catalog and field-schema projections
- Database health check under normal and degraded conditions
