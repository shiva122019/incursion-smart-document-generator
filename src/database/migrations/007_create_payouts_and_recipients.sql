-- Migration 007: Payout Recipients, Secure Encrypted Payment Details, and Payouts

CREATE TABLE IF NOT EXISTS payout_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    roll_number VARCHAR(64),
    course VARCHAR(128),
    semester VARCHAR(32),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Separate table for sensitive banking details with application-layer encryption
CREATE TABLE IF NOT EXISTS recipient_payment_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES payout_recipients(id) ON DELETE CASCADE,
    bank_name VARCHAR(128) NOT NULL,
    account_holder_name VARCHAR(255) NOT NULL,
    encrypted_account_number TEXT NOT NULL,
    encrypted_ifsc_code TEXT NOT NULL,
    encrypted_pan_number TEXT,
    masked_account_number VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recipient_payment_details_recipient UNIQUE (recipient_id)
);

CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    recipient_id UUID NOT NULL REFERENCES payout_recipients(id) ON DELETE RESTRICT,
    payout_purpose VARCHAR(255) NOT NULL,
    competition_name VARCHAR(255),
    position VARCHAR(64),
    amount NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    approval_ref VARCHAR(128),
    payment_ref VARCHAR(128),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payouts_amount CHECK (amount > 0),
    CONSTRAINT chk_payouts_status CHECK (status IN ('pending', 'approved', 'processed', 'cancelled'))
);

-- Triggers for auto-updating timestamps
CREATE TRIGGER trg_payout_recipients_updated_at
BEFORE UPDATE ON payout_recipients
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER trg_recipient_payment_details_updated_at
BEFORE UPDATE ON recipient_payment_details
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER trg_payouts_updated_at
BEFORE UPDATE ON payouts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payout_recipients_club ON payout_recipients(club_id);
CREATE INDEX IF NOT EXISTS idx_payout_recipients_roll ON payout_recipients(roll_number);
CREATE INDEX IF NOT EXISTS idx_payouts_event ON payouts(event_id);
CREATE INDEX IF NOT EXISTS idx_payouts_recipient ON payouts(recipient_id);
CREATE INDEX IF NOT EXISTS idx_payouts_event_status ON payouts(event_id, status);
