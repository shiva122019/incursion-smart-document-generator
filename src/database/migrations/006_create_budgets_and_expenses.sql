-- Migration 006: Event Budgets and Actual Expenditure Claims

CREATE TABLE IF NOT EXISTS event_budget_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    unit_price NUMERIC(14, 2) NOT NULL,
    other_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_budget_quantity CHECK (quantity > 0),
    CONSTRAINT chk_budget_unit_price CHECK (unit_price >= 0),
    CONSTRAINT chk_budget_other_charges CHECK (other_charges >= 0)
);

CREATE TABLE IF NOT EXISTS expense_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    approval_note_ref VARCHAR(128),
    purchase_order_ref VARCHAR(128),
    purchase_order_date DATE,
    head_of_account_code VARCHAR(64),
    advance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    supplier_name VARCHAR(255),
    supplier_gst_number VARCHAR(32),
    invoice_number VARCHAR(128),
    invoice_date DATE,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_expense_claim_advance CHECK (advance_amount >= 0),
    CONSTRAINT chk_expense_claim_status CHECK (
        status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'settled')
    )
);

CREATE TABLE IF NOT EXISTS expense_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_claim_id UUID NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    unit_cost NUMERIC(14, 2) NOT NULL,
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    other_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_expense_item_quantity CHECK (quantity > 0),
    CONSTRAINT chk_expense_item_unit_cost CHECK (unit_cost >= 0),
    CONSTRAINT chk_expense_item_tax CHECK (tax_amount >= 0),
    CONSTRAINT chk_expense_item_other CHECK (other_charges >= 0)
);

-- Triggers for auto-updating timestamps
CREATE TRIGGER trg_event_budget_items_updated_at
BEFORE UPDATE ON event_budget_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER trg_expense_claims_updated_at
BEFORE UPDATE ON expense_claims
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER trg_expense_items_updated_at
BEFORE UPDATE ON expense_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_budget_items_event ON event_budget_items(event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_expense_claims_event ON expense_claims(event_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON expense_claims(status);
CREATE INDEX IF NOT EXISTS idx_expense_items_claim ON expense_items(expense_claim_id, display_order);
