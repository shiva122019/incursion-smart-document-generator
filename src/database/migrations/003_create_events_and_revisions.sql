-- Migration 003: Events, Revisions, and Field Provenance Tracking

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    objectives TEXT,
    target_audience VARCHAR(255),
    start_date DATE NOT NULL,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    venue VARCHAR(255) NOT NULL,
    expected_participants INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    current_revision_number INTEGER NOT NULL DEFAULT 1,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_events_participants CHECK (expected_participants >= 0),
    CONSTRAINT chk_events_date_range CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_events_time_range CHECK (
        start_time IS NULL 
        OR end_time IS NULL 
        OR end_date IS NULL 
        OR end_date > start_date 
        OR (end_date = start_date AND end_time >= start_time)
    ),
    CONSTRAINT chk_events_status CHECK (status IN ('draft', 'proposed', 'approved', 'rejected', 'completed', 'cancelled')),
    CONSTRAINT chk_events_revision_num CHECK (current_revision_number >= 1)
);

CREATE TABLE IF NOT EXISTS event_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    event_data JSONB NOT NULL,
    change_summary TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_event_revisions_event_revision UNIQUE (event_id, revision_number),
    CONSTRAINT chk_event_revisions_number CHECK (revision_number >= 1)
);

CREATE TABLE IF NOT EXISTS event_field_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_revision_id UUID NOT NULL REFERENCES event_revisions(id) ON DELETE CASCADE,
    field_path VARCHAR(255) NOT NULL,
    value_text TEXT,
    value_json JSONB,
    source_type VARCHAR(64) NOT NULL,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'unverified',
    extraction_confidence NUMERIC(4,3),
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_field_sources_source_type CHECK (
        source_type IN ('user_input', 'llm_extraction', 'verified_database_record', 'system_default')
    ),
    CONSTRAINT chk_field_sources_verification_status CHECK (
        verification_status IN ('unverified', 'verified', 'rejected', 'flagged')
    ),
    CONSTRAINT chk_field_sources_confidence CHECK (
        extraction_confidence IS NULL OR (extraction_confidence >= 0.0 AND extraction_confidence <= 1.0)
    )
);

-- Triggers for auto-updating timestamps
CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_club_start_date ON events(club_id, start_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_event_revisions_event_rev ON event_revisions(event_id, revision_number);
CREATE INDEX IF NOT EXISTS idx_event_field_sources_rev ON event_field_sources(event_revision_id);
CREATE INDEX IF NOT EXISTS idx_event_field_sources_path ON event_field_sources(event_revision_id, field_path);
