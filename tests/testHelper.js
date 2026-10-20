import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { newDb, DataType } from 'pg-mem';
import { setPool, getPool, closePool } from '../src/database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, '../src/database/migrations');

/**
 * Initializes a clean in-memory PostgreSQL instance for fast, isolated integration tests.
 * Registers custom PostgreSQL functions, applies all migrations in dependency order,
 * and attaches the instance to the project's connection pool.
 */
export async function setupTestDatabase() {
  const db = newDb();

  // Register gen_random_uuid as an impure/volatile function so each default evaluation gets a fresh UUID
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  // Register version function
  db.public.registerFunction({
    name: 'version',
    returns: DataType.text,
    implementation: () => 'PostgreSQL 15.0 (pg-mem in-memory test)',
  });

  // Load and apply all migrations
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    let sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

    // pg-mem parser adjustments for in-memory emulation:
    // Strip PL/pgSQL procedural blocks, triggers, and extensions
    sql = sql.replace(/CREATE (OR REPLACE )?FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, '');
    sql = sql.replace(/CREATE TRIGGER[\s\S]*?EXECUTE FUNCTION [^;]+;/gi, '');
    sql = sql.replace(/CREATE EXTENSION[^;]+;/gi, '');
    sql = sql.replace(/--.*$/gm, '').trim();

    if (sql.length > 0) {
      db.public.none(sql);
    }
  }

  // Create pg-compatible adapter and pool
  const { Pool } = db.adapters.createPg();
  const testPool = new Pool();
  setPool(testPool);

  return { db, pool: testPool };
}

/**
 * Tears down test connection pool.
 */
export async function teardownTestDatabase() {
  await closePool();
}
