import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDatabase, teardownTestDatabase } from './testHelper.js';
import { app } from '../src/app.js';
import { setPool } from '../src/database/connection.js';

describe('Health API Integration Tests', () => {
  let healthyPool;

  before(async () => {
    const { pool } = await setupTestDatabase();
    healthyPool = pool;
  });

  after(async () => {
    setPool(healthyPool);
    await teardownTestDatabase();
  });

  it('GET /api/health should report UP and connected when database is healthy', async () => {
    const res = await request(app).get('/api/health');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'UP');
    assert.equal(res.body.data.database.status, 'connected');
    assert.ok(res.body.data.timestamp);
    // Ensure no secrets or credentials leaked
    assert.equal(res.body.data.database.password, undefined);
    assert.equal(res.body.data.database.connectionString, undefined);
  });

  it('GET /api/health should report DEGRADED when database is disconnected without leaking secrets', async () => {
    // Inject a dummy failing pool
    const failingPool = {
      query: async () => {
        throw new Error('Database connection refused at 127.0.0.1:5432 (simulated down)');
      },
      end: async () => {},
    };
    setPool(failingPool);

    const res = await request(app).get('/api/health');

    assert.equal(res.status, 503);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'DEGRADED');
    assert.equal(res.body.data.database.status, 'disconnected');
    // Ensure error message does not expose secrets or stack trace
    assert.equal(res.body.data.database.password, undefined);
    assert.equal(res.body.data.database.connectionString, undefined);

    // Restore healthy pool
    setPool(healthyPool);
  });
});
