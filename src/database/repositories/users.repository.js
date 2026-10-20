import { query } from '../connection.js';

export class UsersRepository {
  /**
   * Creates a new user.
   */
  static async create({ name, email, passwordHash, accountStatus = 'active' }, client = null) {
    const sql = `
      INSERT INTO users (name, email, password_hash, account_status)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, account_status, created_at, updated_at;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [name, email, passwordHash, accountStatus]);
    return res.rows[0];
  }

  /**
   * Retrieves a user by their UUID.
   */
  static async findById(id, client = null) {
    const sql = `
      SELECT id, name, email, account_status, created_at, updated_at
      FROM users
      WHERE id = $1;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves a user by email, including the password_hash for authentication verification.
   */
  static async findByEmail(email, client = null) {
    const sql = `
      SELECT id, name, email, password_hash, account_status, created_at, updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1);
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [email]);
    return res.rows[0] || null;
  }
}
