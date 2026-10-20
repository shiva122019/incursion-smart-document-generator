import { query } from '../connection.js';

export class ClubsRepository {
  /**
   * Creates a new club with branding configuration.
   */
  static async create({ name, code, institutionName, officialContactEmail, officialContactPhone = null, branding = {} }, client = null) {
    const sql = `
      INSERT INTO clubs (name, code, institution_name, official_contact_email, official_contact_phone, branding)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, code, institution_name, official_contact_email, official_contact_phone, branding, created_at, updated_at;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [
      name,
      code,
      institutionName,
      officialContactEmail,
      officialContactPhone,
      JSON.stringify(branding),
    ]);
    return res.rows[0];
  }

  /**
   * Retrieves a club by UUID.
   */
  static async findById(id, client = null) {
    const sql = `SELECT * FROM clubs WHERE id = $1;`;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves a club by its unique code.
   */
  static async findByCode(code, client = null) {
    const sql = `SELECT * FROM clubs WHERE LOWER(code) = LOWER($1);`;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [code]);
    return res.rows[0] || null;
  }

  /**
   * Adds or updates a user membership in a club.
   */
  static async addMember({ clubId, userId, role = 'member', status = 'active' }, client = null) {
    const sql = `
      INSERT INTO club_memberships (club_id, user_id, role, status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, club_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, club_id, user_id, role, status, created_at, updated_at;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [clubId, userId, role, status]);
    return res.rows[0];
  }

  /**
   * Retrieves the membership role and status for a user in a specific club.
   */
  static async getMemberRole(clubId, userId, client = null) {
    const sql = `
      SELECT role, status
      FROM club_memberships
      WHERE club_id = $1 AND user_id = $2;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [clubId, userId]);
    return res.rows[0] || null;
  }
}
