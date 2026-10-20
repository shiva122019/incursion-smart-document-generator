import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { withTransaction, query } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Initializes the schema_migrations tracking table if it does not exist.
 */
export async function initMigrationTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Retrieves list of all migration files sorted in ascending order.
 * @returns {string[]}
 */
export function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Retrieves applied migrations from the database.
 * @returns {Promise<string[]>}
 */
export async function getAppliedMigrations() {
  await initMigrationTable();
  const res = await query('SELECT migration_name FROM schema_migrations ORDER BY id ASC');
  return res.rows.map((r) => r.migration_name);
}

/**
 * Returns migration status for all discovered migrations.
 */
export async function getMigrationStatus() {
  const allFiles = getMigrationFiles();
  const applied = await getAppliedMigrations();
  const appliedSet = new Set(applied);

  return allFiles.map((file) => ({
    name: file,
    applied: appliedSet.has(file),
  }));
}

/**
 * Runs all pending database migrations in sequential numbered order within separate transactions.
 * @returns {Promise<string[]>} List of newly applied migration names
 */
export async function runMigrations() {
  await initMigrationTable();
  const allFiles = getMigrationFiles();
  const applied = await getAppliedMigrations();
  const appliedSet = new Set(applied);

  const pending = allFiles.filter((f) => !appliedSet.has(f));

  if (pending.length === 0) {
    console.log('Database is up to date. No pending migrations.');
    return [];
  }

  console.log(`Applying ${pending.length} pending migration(s)...`);

  const appliedNow = [];
  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sqlContent = fs.readFileSync(filePath, 'utf-8');

    const startTime = Date.now();
    await withTransaction(async (client) => {
      // Execute the migration SQL
      await client.query(sqlContent);
      // Record applied migration
      await client.query(
        'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
        [file]
      );
    });

    const duration = Date.now() - startTime;
    console.log(`  ✓ Applied migration: ${file} (${duration}ms)`);
    appliedNow.push(file);
  }

  console.log(`Successfully applied ${appliedNow.length} migration(s).`);
  return appliedNow;
}
