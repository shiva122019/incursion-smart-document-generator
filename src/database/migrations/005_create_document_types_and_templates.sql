-- Migration 005: Document Types, Configurable Templates, and Immutable Template Versions

CREATE TABLE IF NOT EXISTS document_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_document_types_slug UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    document_type_id UUID NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    docx_storage_key VARCHAR(512) NOT NULL,
    sha256_checksum VARCHAR(64) NOT NULL,
    field_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    field_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
    required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    optional_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    conditional_sections JSONB NOT NULL DEFAULT '{}'::jsonb,
    branding_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    publication_status VARCHAR(32) NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_template_versions_template_version UNIQUE (template_id, version_number),
    CONSTRAINT chk_template_versions_num CHECK (version_number >= 1),
    CONSTRAINT chk_template_versions_status CHECK (publication_status IN ('draft', 'published', 'archived'))
);

-- Triggers for auto-updating timestamps
CREATE TRIGGER trg_document_types_updated_at
BEFORE UPDATE ON document_types
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER trg_templates_updated_at
BEFORE UPDATE ON templates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- Immutability enforcement trigger:
-- Once published, template version definitions cannot be altered.
-- New revisions must create new versions.
CREATE OR REPLACE FUNCTION check_template_version_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.publication_status = 'published' THEN
        -- Allow state transition from 'published' to 'archived', but forbid modifying template content
        IF NEW.publication_status = 'archived'
           AND NEW.docx_storage_key = OLD.docx_storage_key
           AND NEW.sha256_checksum = OLD.sha256_checksum
           AND NEW.field_schema = OLD.field_schema
           AND NEW.field_mappings = OLD.field_mappings
           AND NEW.required_fields = OLD.required_fields
           AND NEW.optional_fields = OLD.optional_fields
           AND NEW.conditional_sections = OLD.conditional_sections
           AND NEW.branding_config = OLD.branding_config
           AND NEW.version_number = OLD.version_number
           AND NEW.template_id = OLD.template_id THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'ImmutableRecordException: Published template version cannot be modified. Create a new version instead.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_template_versions_immutability
BEFORE UPDATE ON template_versions
FOR EACH ROW
EXECUTE FUNCTION check_template_version_immutability();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_templates_club ON templates(club_id);
CREATE INDEX IF NOT EXISTS idx_templates_doc_type ON templates(document_type_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_template ON template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_template_ver ON template_versions(template_id, version_number);
CREATE INDEX IF NOT EXISTS idx_template_versions_status ON template_versions(publication_status);
