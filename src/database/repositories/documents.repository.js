import { query, withTransaction } from '../connection.js';

export class DocumentsRepository {
  /**
   * Creates a generated document instance tied to exact event revision and template version.
   * Stores an immutable JSON snapshot of all source data used to create the document.
   */
  static async createInstance({
    eventId,
    documentTypeId,
    templateVersionId,
    eventRevisionId,
    payoutId = null,
    expenseClaimId = null,
    sourceSnapshot,
    status = 'queued',
    docxStorageKey = null,
    pdfStorageKey = null,
    fileChecksum = null,
    createdBy = null,
  }, client = null) {
    const sql = `
      INSERT INTO document_instances (
        event_id, document_type_id, template_version_id, event_revision_id,
        payout_id, expense_claim_id, source_snapshot, status,
        docx_storage_key, pdf_storage_key, file_checksum, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [
      eventId,
      documentTypeId,
      templateVersionId,
      eventRevisionId,
      payoutId,
      expenseClaimId,
      JSON.stringify(sourceSnapshot),
      status,
      docxStorageKey,
      pdfStorageKey,
      fileChecksum,
      createdBy,
    ]);
    return res.rows[0];
  }

  /**
   * Retrieves a document instance by UUID, including joined metadata.
   */
  static async getInstanceById(id, client = null) {
    const sql = `
      SELECT 
        di.*,
        dt.slug as document_type_slug,
        dt.display_name as document_type_name,
        tv.version_number as template_version_number,
        er.revision_number as event_revision_number
      FROM document_instances di
      JOIN document_types dt ON di.document_type_id = dt.id
      JOIN template_versions tv ON di.template_version_id = tv.id
      JOIN event_revisions er ON di.event_revision_id = er.id
      WHERE di.id = $1;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves all document instances for an event.
   */
  static async findByEvent(eventId, client = null) {
    const sql = `
      SELECT di.*, dt.slug as document_type_slug, dt.display_name as document_type_name
      FROM document_instances di
      JOIN document_types dt ON di.document_type_id = dt.id
      WHERE di.event_id = $1
      ORDER BY di.created_at DESC;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [eventId]);
    return res.rows;
  }

  /**
   * Records a review / approval decision for a document instance.
   * Updates document_instance status inside a single transaction.
   */
  static async addReview({ documentInstanceId, reviewerId, decision, comments = null, decisionTimestamp = null }, client = null) {
    const execute = async (tx) => {
      // Insert review record
      const reviewSql = `
        INSERT INTO document_reviews (document_instance_id, reviewer_id, decision, comments, decision_timestamp)
        VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_TIMESTAMP))
        RETURNING *;
      `;
      const revRes = await tx.query(reviewSql, [documentInstanceId, reviewerId, decision, comments, decisionTimestamp]);
      const review = revRes.rows[0];

      // Update document instance status based on review decision
      let newStatus = 'in_review';
      if (decision === 'approved') newStatus = 'approved';
      if (decision === 'rejected') newStatus = 'rejected';

      await tx.query(
        `
        UPDATE document_instances
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2;
      `,
        [newStatus, documentInstanceId]
      );

      return review;
    };

    if (client) {
      return execute(client);
    }
    return withTransaction(execute);
  }

  /**
   * Retrieves review history for a document instance.
   */
  static async getReviews(documentInstanceId, client = null) {
    const sql = `
      SELECT dr.*, u.name as reviewer_name, u.email as reviewer_email
      FROM document_reviews dr
      JOIN users u ON dr.reviewer_id = u.id
      WHERE dr.document_instance_id = $1
      ORDER BY dr.decision_timestamp DESC, dr.created_at DESC;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [documentInstanceId]);
    return res.rows;
  }
}
