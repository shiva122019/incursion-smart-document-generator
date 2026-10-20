-- Migration 008: Generated Document Instances and Review Workflows

CREATE TABLE IF NOT EXISTS document_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    document_type_id UUID NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
    template_version_id UUID NOT NULL REFERENCES template_versions(id) ON DELETE RESTRICT,
    event_revision_id UUID NOT NULL REFERENCES event_revisions(id) ON DELETE RESTRICT,
    payout_id UUID REFERENCES payouts(id) ON DELETE RESTRICT,
    expense_claim_id UUID REFERENCES expense_claims(id) ON DELETE RESTRICT,
    source_snapshot JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    docx_storage_key VARCHAR(512),
    pdf_storage_key VARCHAR(512),
    file_checksum VARCHAR(64),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_document_instances_status CHECK (
        status IN ('queued', 'generating', 'generated', 'in_review', 'approved', 'rejected', 'failed')
    )
);

CREATE TABLE IF NOT EXISTS document_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_instance_id UUID NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    decision VARCHAR(32) NOT NULL,
    comments TEXT,
    decision_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_document_reviews_decision CHECK (
        decision IN ('approved', 'rejected', 'requested_changes')
    )
);

-- Triggers for auto-updating timestamps
CREATE TRIGGER trg_document_instances_updated_at
BEFORE UPDATE ON document_instances
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_instances_event_created ON document_instances(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_instances_type_status ON document_instances(document_type_id, status);
CREATE INDEX IF NOT EXISTS idx_document_instances_template_ver ON document_instances(template_version_id);
CREATE INDEX IF NOT EXISTS idx_document_instances_revision ON document_instances(event_revision_id);
CREATE INDEX IF NOT EXISTS idx_document_reviews_instance ON document_reviews(document_instance_id, decision_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_document_reviews_reviewer ON document_reviews(reviewer_id);
