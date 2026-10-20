import pg from 'pg';
import { config } from '../config/env.js';

const { Pool } = pg;

let poolInstance = null;

/**
 * Creates or retrieves the singleton pg.Pool instance.
 */
export function getPool() {
  if (!poolInstance) {
    const poolConfig = config.db.connectionString
      ? {
          connectionString: config.db.connectionString,
          ssl: config.db.ssl,
          max: config.db.pool.max,
          idleTimeoutMillis: config.db.pool.idleTimeoutMillis,
          connectionTimeoutMillis: config.db.pool.connectionTimeoutMillis,
        }
      : {
          host: config.db.host,
          port: config.db.port,
          database: config.db.database,
          user: config.db.user,
          password: config.db.password,
          ssl: config.db.ssl,
          max: config.db.pool.max,
          idleTimeoutMillis: config.db.pool.idleTimeoutMillis,
          connectionTimeoutMillis: config.db.pool.connectionTimeoutMillis,
        };

    poolInstance = new Pool(poolConfig);

    poolInstance.on('error', (err) => {
      console.error('Unexpected error on idle database client:', err.message);
    });
  }

  return poolInstance;
}

/**
 * Allows injecting an alternate pool instance (e.g. pg-mem for unit/integration tests).
 */
export function setPool(customPool) {
  poolInstance = customPool;
}

/**
 * Executes a parameterized query using a pooled connection.
 * @param {string} text - SQL query text
 * @param {Array} [params] - Parameterized query arguments
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params = []) {
  const pool = getPool();
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    // Log sanitized error message without leaking sensitive parameters
    console.error(`Database query failed [${duration}ms]: ${error.message}`);
    throw error;
  }
}

/**
 * Executes a sequence of operations within a transactional client.
 * Guarantees COMMIT on success, ROLLBACK on error, and client release in finally block.
 * @template T
 * @param {(client: pg.PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function withTransaction(callback) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to rollback transaction:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Tests connection health.
 * @returns {Promise<{ healthy: boolean, timestamp: string, serverVersion?: string }>}
 */
export async function testConnection() {
  try {
    const pool = getPool();
    const res = await pool.query('SELECT NOW() as now, version() as version');
    return {
      healthy: true,
      timestamp: res.rows[0].now,
      serverVersion: res.rows[0].version,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
    };
  }
}

/**
 * Gracefully terminates the connection pool.
 */
export async function closePool() {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
