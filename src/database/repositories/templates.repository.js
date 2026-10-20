import { query } from '../connection.js';

export class TemplatesRepository {
  /**
   * Creates a document type.
   */
  static async createDocumentType({ slug, displayName, description = null, isActive = true }, client = null) {
    const sql = `
      INSERT INTO document_types (slug, display_name, description, is_active)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (slug) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        is_active = EXCLUDED.is_active
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [slug, displayName, description, isActive]);
    return res.rows[0];
  }

  /**
   * Retrieves all active document types.
   */
  static async getDocumentTypes(client = null) {
    const sql = `
      SELECT id, slug, display_name, description, is_active, created_at, updated_at
      FROM document_types
      WHERE is_active = true
      ORDER BY display_name ASC, slug ASC;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql);
    return res.rows;
  }

  /**
   * Retrieves a document type by slug.
   */
  static async getDocumentTypeBySlug(slug, client = null) {
    const sql = `SELECT * FROM document_types WHERE slug = $1;`;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [slug]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves a document type by UUID.
   */
  static async getDocumentTypeById(id, client = null) {
    const sql = `SELECT * FROM document_types WHERE id = $1;`;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Creates a template. clubId can be NULL for default/institutional templates.
   */
  static async createTemplate({ clubId = null, documentTypeId, name, description = null, createdBy = null }, client = null) {
    const sql = `
      INSERT INTO templates (club_id, document_type_id, name, description, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [clubId, documentTypeId, name, description, createdBy]);
    return res.rows[0];
  }

  /**
   * Creates a template version (draft or published).
   */
  static async createTemplateVersion({
    templateId,
    versionNumber,
    docxStorageKey,
    sha256Checksum,
    fieldSchema = {},
    fieldMappings = {},
    requiredFields = [],
    optionalFields = [],
    conditionalSections = {},
    brandingConfig = {},
    publicationStatus = 'draft',
    createdBy = null,
  }, client = null) {
    const sql = `
      INSERT INTO template_versions (
        template_id, version_number, docx_storage_key, sha256_checksum,
        field_schema, field_mappings, required_fields, optional_fields,
        conditional_sections, branding_config, publication_status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [
      templateId,
      versionNumber,
      docxStorageKey,
      sha256Checksum,
      JSON.stringify(fieldSchema),
      JSON.stringify(fieldMappings),
      JSON.stringify(requiredFields),
      JSON.stringify(optionalFields),
      JSON.stringify(conditionalSections),
      JSON.stringify(brandingConfig),
      publicationStatus,
      createdBy,
    ]);
    return res.rows[0];
  }

  /**
   * Marks a template version as published.
   * Once published, immutable triggers prevent any modifications to the template content.
   */
  static async publishTemplateVersion(templateVersionId, client = null) {
    const sql = `
      UPDATE template_versions
      SET publication_status = 'published'
      WHERE id = $1
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [templateVersionId]);
    return res.rows[0];
  }

  /**
   * Retrieves an exact template version by templateId and versionNumber.
   */
  static async getTemplateVersion(templateId, versionNumber, client = null) {
    const sql = `
      SELECT * FROM template_versions
      WHERE template_id = $1 AND version_number = $2;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [templateId, versionNumber]);
    return res.rows[0] || null;
  }

  /**
   * Lists active templates with currently published versions.
   * Redacts storage keys, checksums, and private paths.
   */
  static async listTemplates({ documentTypeSlug = null, documentTypeId = null, clubId = null }, client = null) {
    const conditions = ['t.is_active = true', "tv.publication_status = 'published'"];
    const params = [];

    if (documentTypeSlug) {
      params.push(documentTypeSlug);
      conditions.push(`dt.slug = $${params.length}`);
    }

    if (documentTypeId) {
      params.push(documentTypeId);
      conditions.push(`dt.id = $${params.length}`);
    }

    if (clubId) {
      params.push(clubId);
      // Accessible if either specific to this club or global default (club_id IS NULL)
      conditions.push(`(t.club_id = $${params.length} OR t.club_id IS NULL)`);
    }

    const sql = `
      SELECT
        t.id,
        t.club_id,
        t.document_type_id,
        t.name,
        t.description,
        t.is_active,
        t.created_at,
        dt.slug AS document_type_slug,
        dt.display_name AS document_type_name,
        tv.id AS template_version_id,
        tv.version_number,
        tv.field_schema,
        tv.required_fields,
        tv.optional_fields,
        tv.branding_config,
        tv.publication_status
      FROM templates t
      JOIN document_types dt ON t.document_type_id = dt.id
      JOIN template_versions tv ON t.id = tv.template_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.name ASC, tv.version_number DESC;
    `;

    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, params);
    return res.rows;
  }

  /**
   * Retrieves a template by UUID with its latest published version.
   * Excludes raw storage keys.
   */
  static async findTemplateById(templateId, client = null) {
    const sql = `
      SELECT
        t.id,
        t.club_id,
        t.document_type_id,
        t.name,
        t.description,
        t.is_active,
        t.created_at,
        dt.slug AS document_type_slug,
        dt.display_name AS document_type_name,
        tv.id AS template_version_id,
        tv.version_number,
        tv.field_schema,
        tv.required_fields,
        tv.optional_fields,
        tv.branding_config,
        tv.publication_status
      FROM templates t
      JOIN document_types dt ON t.document_type_id = dt.id
      LEFT JOIN template_versions tv ON t.id = tv.template_id AND tv.publication_status = 'published'
      WHERE t.id = $1 AND t.is_active = true
      ORDER BY tv.version_number DESC
      LIMIT 1;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [templateId]);
    return res.rows[0] || null;
  }
}
