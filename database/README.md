# Smart Document Generator — PostgreSQL Database Layer

A production-grade, version-controlled PostgreSQL database architecture for the **Smart Document Generator**, engineered to automate official college club documents (Event Proposals, Permission Letters, Bill Certificates, Bill Summaries, and Prize Money Receipts).

---

## 1. Entity-Relationship Design

The schema is organized into modular relational domains:
1. **Identity & Access Management:** Multi-tenant club isolation with role-based access control (`users`, `clubs`, `club_memberships`).
2. **Canonical Events & Revisions:** Linear, optimistic-locked event revisions with field provenance tracking (`events`, `event_revisions`, `event_field_sources`).
3. **Natural-Language Intake:** Unvalidated raw intake captures (`intake_sessions`).
4. **Document Types & Configurable Templates:** Dynamic schema-driven DOCX templates with immutable versioning (`document_types`, `templates`, `template_versions`).
5. **Budgets & Actual Expenditures:** Exact decimal tracking for proposed budgets, actual claims, and supplier invoices (`event_budget_items`, `expense_claims`, `expense_items`).
6. **Prize Money & Secure Payouts:** Competitive payouts with AES-256-GCM encrypted bank details (`payout_recipients`, `recipient_payment_details`, `payouts`).
7. **Document Generation & Approval Workflows:** Immutable snapshots tied to exact event revisions and template versions (`document_instances`, `document_reviews`).
8. **Compliance & Audit Logging:** Immutable trail of critical state modifications without sensitive credential leakage (`audit_logs`).

### Mermaid ER Diagram

```mermaid
erDiagram
    users ||--o{ club_memberships : "belongs to"
    clubs ||--o{ club_memberships : "has members"
    clubs ||--o{ events : "organizes"
    clubs ||--o{ templates : "owns (nullable)"
    clubs ||--o{ payout_recipients : "maintains"
    clubs ||--o{ intake_sessions : "captures"

    events ||--o{ event_revisions : "revises"
    events ||--o{ event_budget_items : "proposes"
    events ||--o{ expense_claims : "incurs"
    events ||--o{ payouts : "disburses"
    events ||--o{ document_instances : "generates"

    event_revisions ||--o{ event_field_sources : "tracks provenance"
    event_revisions ||--o{ document_instances : "snapshots"

    document_types ||--o{ templates : "categorizes"
    document_types ||--o{ document_instances : "classifies"

    templates ||--o{ template_versions : "versions"
    template_versions ||--o{ document_instances : "renders"

    expense_claims ||--o{ expense_items : "itemizes"
    expense_claims ||--o{ document_instances : "references (bills)"

    payout_recipients ||--|| recipient_payment_details : "stores encrypted details"
    payout_recipients ||--o{ payouts : "receives"
    payouts ||--o{ document_instances : "references (receipts)"

    document_instances ||--o{ document_reviews : "receives"
    users ||--o{ document_reviews : "conducts"
    users ||--o{ audit_logs : "triggers"

    users {
        uuid id PK
        varchar name
        varchar email UK
        varchar password_hash
        varchar account_status
        timestamptz created_at
        timestamptz updated_at
    }

    clubs {
        uuid id PK
        varchar name
        varchar code UK
        varchar institution_name
        varchar official_contact_email
        jsonb branding
        timestamptz created_at
        timestamptz updated_at
    }

    club_memberships {
        uuid id PK
        uuid user_id FK
        uuid club_id FK
        varchar role
        varchar status
        timestamptz created_at
    }

    events {
        uuid id PK
        uuid club_id FK
        varchar title
        varchar category
        date start_date
        date end_date
        time start_time
        time end_time
        varchar venue
        int expected_participants
        varchar status
        int current_revision_number
    }

    event_revisions {
        uuid id PK
        uuid event_id FK
        int revision_number
        jsonb event_data
        text change_summary
        uuid created_by FK
        timestamptz created_at
    }

    event_field_sources {
        uuid id PK
        uuid event_revision_id FK
        varchar field_path
        text value_text
        varchar source_type
        varchar verification_status
        numeric extraction_confidence
    }

    document_types {
        uuid id PK
        varchar slug UK
        varchar display_name
        boolean is_active
    }

    templates {
        uuid id PK
        uuid club_id FK
        uuid document_type_id FK
        varchar name
        boolean is_active
    }

    template_versions {
        uuid id PK
        uuid template_id FK
        int version_number
        varchar docx_storage_key
        varchar sha256_checksum
        jsonb field_schema
        jsonb field_mappings
        varchar publication_status
    }

    event_budget_items {
        uuid id PK
        uuid event_id FK
        text description
        numeric quantity
        numeric unit_price
        numeric other_charges
    }

    expense_claims {
        uuid id PK
        uuid event_id FK
        varchar supplier_name
        numeric advance_amount
        varchar status
    }

    expense_items {
        uuid id PK
        uuid expense_claim_id FK
        text description
        numeric quantity
        numeric unit_cost
        numeric tax_amount
    }

    payout_recipients {
        uuid id PK
        uuid club_id FK
        varchar name
        varchar roll_number
    }

    recipient_payment_details {
        uuid id PK
        uuid recipient_id FK
        text encrypted_account_number
        text encrypted_ifsc_code
        varchar masked_account_number
    }

    payouts {
        uuid id PK
        uuid event_id FK
        uuid recipient_id FK
        numeric amount
        varchar currency
        varchar status
    }

    document_instances {
        uuid id PK
        uuid event_id FK
        uuid document_type_id FK
        uuid template_version_id FK
        uuid event_revision_id FK
        jsonb source_snapshot
        varchar status
        varchar docx_storage_key
        varchar pdf_storage_key
    }

    document_reviews {
        uuid id PK
        uuid document_instance_id FK
        uuid reviewer_id FK
        varchar decision
        text comments
        timestamptz decision_timestamp
    }

    audit_logs {
        uuid id PK
        uuid actor_id FK
        uuid club_id FK
        varchar action
        varchar entity_type
        uuid entity_id
        jsonb metadata
        timestamptz created_at
    }
```

---

## 2. Table-by-Table Reference

| Table Name | Purpose | Primary Key | Key Foreign Keys & Constraints |
| :--- | :--- | :--- | :--- |
| `users` | Club officers, faculty advisors, and members | `id` (UUID) | Unique `email`, account status check (`active`, `inactive`, `suspended`). |
| `clubs` | Student organizations & chapters | `id` (UUID) | Unique slug `code`, institution name, JSONB branding tokens. |
| `club_memberships` | Role-based authorization per club | `id` (UUID) | Unique `(user_id, club_id)`, roles: `member`, `club_admin`, `finance_officer`, `approver`. |
| `events` | Official college club activities | `id` (UUID) | Non-negative participants, date order check (`end_date >= start_date`), optimistic revision tracking. |
| `event_revisions` | Immutable snapshot of committed event data | `id` (UUID) | Unique `(event_id, revision_number)`. |
| `event_field_sources` | Field provenance tracking (LLM vs User vs Record) | `id` (UUID) | Source type check, verification status, confidence interval [0.0, 1.0]. |
| `intake_sessions` | Unvalidated raw inputs (form or natural language) | `id` (UUID) | Keeps raw unvalidated prompt inputs isolated from canonical event models. |
| `document_types` | Seeded master catalogue of document types | `id` (UUID) | Unique `slug` (`event_proposal`, `permission_letter`, `bill_certificate`, `bill_summary`, `prize_money_receipt`). |
| `templates` | Named document templates (global or club-specific) | `id` (UUID) | FK `document_type_id`, optional FK `club_id` (NULL = institutional default). |
| `template_versions` | Versioned DOCX templates with schema & mappings | `id` (UUID) | Unique `(template_id, version_number)`, immutability trigger once `publication_status = 'published'`. |
| `event_budget_items` | Proposed budget items for event proposal forms | `id` (UUID) | Strict `NUMERIC(14,2)` arithmetic, check `quantity > 0`, `unit_price >= 0`. |
| `expense_claims` | Actual post-event financial reimbursement claims | `id` (UUID) | FK `event_id ON DELETE RESTRICT`, advance tracking, GST & invoice metadata. |
| `expense_items` | Itemized bills with tax and other charges | `id` (UUID) | FK `expense_claim_id ON DELETE CASCADE`, check `unit_cost >= 0`, `tax_amount >= 0`. |
| `payout_recipients` | Students/competitors receiving prize awards | `id` (UUID) | Roll number, department, semester. |
| `recipient_payment_details` | Highly sensitive bank details (account, IFSC, PAN) | `id` (UUID) | AES-256-GCM encrypted values with masked account numbers for logs. |
| `payouts` | Individual competitive prize disbursements | `id` (UUID) | FK `event_id`, FK `recipient_id`, status check (`pending`, `approved`, `processed`, `cancelled`). |
| `document_instances` | Generated DOCX/PDF files tied to exact revisions | `id` (UUID) | Exact `template_version_id`, exact `event_revision_id`, immutable `source_snapshot` JSONB. |
| `document_reviews` | Review and approval audit entries | `id` (UUID) | FK `document_instance_id`, reviewer FK, decisions (`approved`, `rejected`, `requested_changes`). |
| `audit_logs` | System and user audit trails | `id` (UUID) | Redacts secrets/passwords, tracks before/after JSON states. |
| `schema_migrations` | Version-controlled SQL migration registry | `id` (SERIAL) | Unique `migration_name` timestamped tracking. |

---

## 3. Important Relationships and Constraints

1. **Safe Deletion Policies (`ON DELETE RESTRICT`):**
   - Financial expense claims (`expense_claims`), disbursements (`payouts`), events with financial records (`events`), and generated official documents (`document_instances`) use `ON DELETE RESTRICT`. A populated event with approved bills or receipts cannot be accidentally dropped.
   - Deleting a club membership or user cascades cleanly only on transient membership join records, never destroying financial audit histories.
2. **Deterministic Monetary Arithmetic (`NUMERIC(14,2)`):**
   - Floating point types (`FLOAT`, `DOUBLE PRECISION`) are prohibited for financial figures.
   - Grand totals are never treated as authoritative if they can be derived. The Bill Summary grand total is computed transactionally from itemized expense claims and approved payouts without rounding errors.
3. **Application-Layer Encryption for Payout Banking Details:**
   - Bank account numbers, IFSC codes, and PAN details are stored in a dedicated `recipient_payment_details` table encrypted with **AES-256-GCM** with authenticated verification tags.
   - A `masked_account_number` (e.g. `XXXX-XXXX-1234`) is persisted for non-privileged displays, eliminating secrets from logs.
4. **Optimistic Concurrency & Revision Locking:**
   - When committing an event update, `SELECT current_revision_number FROM events WHERE id = $1 FOR UPDATE` prevents race conditions. A new revision row is created and field provenance entries are transactionally logged.

---

## 4. How to Configure PostgreSQL Locally

### Option A: Using Docker (Recommended for Local Dev)

```bash
docker run --name smartdoc-postgres \
  -e POSTGRES_DB=smartdoc_dev \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:16-alpine
```

### Option B: Using Native PostgreSQL (Windows / macOS / Linux)

1. Create a dedicated database:
   ```sql
   CREATE DATABASE smartdoc_dev;
   ```
2. Copy the environment configuration file:
   ```bash
   cp .env.example .env
   ```
3. Update connection credentials in `.env`:
   ```ini
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/smartdoc_dev
   APP_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
   ```

---

## 5. How to Run Migrations

Numbered SQL migration scripts are located in `src/database/migrations/`.

1. **Check Migration Status:**
   ```bash
   npm run migrate:status
   ```
   *Displays all discovered migrations with `[APPLIED]` or `[PENDING]`.*

2. **Apply All Pending Migrations:**
   ```bash
   npm run migrate
   ```
   *Each unapplied migration runs in an isolated transaction and is recorded in `schema_migrations`.*

3. **Rollback Guidance:**
   - Production migrations are forward-only.
   - For schema refactoring during local development, follow the Safe Development Reset procedure outlined in Section 9.

---

## 6. How to Load Development Seed Data

Populates the 5 initial document types, synthetic demonstration club (ACM SVNIT), demo users with secure test hashes, sample event, revision history, proposed budget items, payout recipient, and generated document instance:

```bash
npm run seed
```

> **Security Note:** Seed scripts never store plaintext passwords or real student bank/contact information. All credentials use non-functional, cryptographically salted dev tokens.

---

## 7. How to Test Database Connection

Verify that your PostgreSQL connection pool is healthy and communicating with the database:

```bash
npm run db:test-connection
```

*Outputs current server timestamp and PostgreSQL engine version.*

---

## 8. Running Automated Integration Tests

A comprehensive integration test suite verifies:
- Event creation and optimistic revision locking
- Field provenance tracking (LLM extraction confidence)
- Rejection of negative participant counts and invalid date ranges
- Prevention of duplicate template versions and foreign-key integrity
- Exact template-version and event-revision document binding
- Deterministic decimal arithmetic for Bill Summaries, Expense Claims, and Budgets
- Multi-tenant club isolation and RBAC role checks
- Full synthetic seed execution

Run all tests:
```bash
npm test
```

---

## 9. How to Reset a Development Database Safely

To completely reset a local development database without affecting other databases on your server:

```sql
-- Connect to the postgres default database
DROP DATABASE IF EXISTS smartdoc_dev;
CREATE DATABASE smartdoc_dev;
```

Then re-apply migrations and seed data:
```bash
npm run migrate
npm run seed
```

---

## 10. Historical Consistency: Document Versions & Event Revisions

A core architectural challenge in club document management is preserving historical integrity:
- *If an event's venue or dates change next month, previously generated and approved documents must not retroactively mutate.*
- *If an official document template is updated, previous submissions generated with version 1 must remain verifiable and bit-for-bit reproducible.*

### Dual-Anchored Document Instances
Every record in `document_instances` is permanently bound to:
1. An immutable **`event_revisions`** record (`event_revision_id`).
2. An immutable **`template_versions`** record (`template_version_id`).
3. An exact **`source_snapshot`** JSONB payload representing the state of all data at the exact second the document was created.
4. Cryptographic SHA-256 checksums of the output files.

### Database-Enforced Template Immutability
Once a template version is marked `publication_status = 'published'`, an automated PostgreSQL trigger (`trg_template_versions_immutability`) forbids updates to the underlying file storage key, checksum, field schemas, or branding tokens. New revisions must create a new incremented version row.
