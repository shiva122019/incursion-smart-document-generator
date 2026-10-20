import { query } from '../connection.js';

export class AuditRepository {
  /**
   * Logs a significant administrative or workflow action.
   * Strips out passwords, full bank account numbers, or secret tokens before saving.
   */
  static async logAction({
    actorId = null,
    clubId = null,
    action,
    entityType,
    entityId,
    beforeState = null,
    afterState = null,
    metadata = {},
  }, client = null) {
    const sanitize = (data) => {
      if (!data || typeof data !== 'object') return data;
      const copy = JSON.parse(JSON.stringify(data));
      const sensitiveKeys = ['password', 'password_hash', 'encrypted_account_number', 'account_number', 'pan', 'secret', 'key'];
      const scrub = (obj) => {
        for (const k of Object.keys(obj)) {
          if (sensitiveKeys.includes(k.toLowerCase())) {
            obj[k] = '[REDACTED]';
          } else if (typeof obj[k] === 'object' && obj[k] !== null) {
            scrub(obj[k]);
          }
        }
      };
      scrub(copy);
      return copy;
    };

    const sql = `
      INSERT INTO audit_logs (actor_id, club_id, action, entity_type, entity_id, before_state, after_state, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [
      actorId,
      clubId,
      action,
      entityType,
      entityId,
      beforeState ? JSON.stringify(sanitize(beforeState)) : null,
      afterState ? JSON.stringify(sanitize(afterState)) : null,
      JSON.stringify(sanitize(metadata)),
    ]);
    return res.rows[0];
  }

  /**
   * Retrieves audit trail for a specific entity.
   */
  static async getEntityAuditTrail(entityType, entityId, client = null) {
    const sql = `
      SELECT al.*, u.name as actor_name, u.email as actor_email
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_id = u.id
      WHERE al.entity_type = $1 AND al.entity_id = $2
      ORDER BY al.created_at DESC;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [entityType, entityId]);
    return res.rows;
  }
}
