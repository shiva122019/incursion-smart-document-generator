-- Migration 004: Natural-Language Intake and Raw Intake Sessions

CREATE TABLE IF NOT EXISTS intake_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    input_type VARCHAR(32) NOT NULL,
    raw_input_text TEXT,
    extracted_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    detected_document_types JSONB NOT NULL DEFAULT '[]'::jsonb,
    missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_intake_input_type CHECK (input_type IN ('structured_form', 'natural_language')),
    CONSTRAINT chk_intake_status CHECK (status IN ('draft', 'processing', 'needs_input', 'validated', 'failed', 'completed'))
);

CREATE TRIGGER trg_intake_sessions_updated_at
BEFORE UPDATE ON intake_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS idx_intake_sessions_club ON intake_sessions(club_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_event ON intake_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_status ON intake_sessions(status);
