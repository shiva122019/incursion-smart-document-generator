import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDatabase, teardownTestDatabase } from './testHelper.js';
import { app } from '../src/app.js';
import { UsersRepository } from '../src/database/repositories/users.repository.js';
import { ClubsRepository } from '../src/database/repositories/clubs.repository.js';
import { EventsRepository } from '../src/database/repositories/events.repository.js';

describe('Events API Integration Tests', () => {
  let userA, userB;
  let clubA, clubB;

  before(async () => {
    await setupTestDatabase();

    // Create User A (member of Club A)
    userA = await UsersRepository.create({
      name: 'Alice ClubAdmin',
      email: 'alice@cluba.edu',
      passwordHash: 'dummy_hash_alice',
    });

    // Create User B (member of Club B only)
    userB = await UsersRepository.create({
      name: 'Bob Outsider',
      email: 'bob@clubb.edu',
      passwordHash: 'dummy_hash_bob',
    });

    // Create Club A
    clubA = await ClubsRepository.create({
      name: 'Coding Club A',
      code: 'coding-club-a',
      institutionName: 'Tech University',
      officialContactEmail: 'contact@cluba.edu',
    });

    // Create Club B
    clubB = await ClubsRepository.create({
      name: 'Robotics Club B',
      code: 'robotics-club-b',
      institutionName: 'Tech University',
      officialContactEmail: 'contact@clubb.edu',
    });

    // Memberships
    await ClubsRepository.addMember({
      clubId: clubA.id,
      userId: userA.id,
      role: 'club_admin',
      status: 'active',
    });

    await ClubsRepository.addMember({
      clubId: clubB.id,
      userId: userB.id,
      role: 'member',
      status: 'active',
    });
  });

  after(async () => {
    await teardownTestDatabase();
  });

  describe('POST /api/events (Create Event)', () => {
    it('should create an event and its initial revision atomically', async () => {
      const payload = {
        clubId: clubA.id,
        title: 'Full Stack Web Dev Workshop',
        category: 'Workshop',
        description: 'Comprehensive hands-on training',
        objectives: 'Learn React, Node, and Postgres',
        venue: 'Hall 101',
        expectedParticipants: 100,
        startAt: '2026-11-20T09:00:00+05:30',
        endAt: '2026-11-21T17:00:00+05:30',
        status: 'draft',
        // Client attempts to spoof createdBy
        createdBy: '00000000-0000-0000-0000-000000000000',
      };

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${userA.id}`)
        .send(payload);

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.event.id);
      assert.equal(res.body.data.event.title, 'Full Stack Web Dev Workshop');
      // Crucial: created_by must be authenticated user, not spoofed value
      assert.equal(res.body.data.event.created_by, userA.id);
      assert.equal(res.body.data.event.current_revision_number, 1);
      assert.equal(res.body.data.revision.revisionNumber, 1);
    });

    it('should reject event creation if title is missing', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${userA.id}`)
        .send({
          clubId: clubA.id,
          category: 'Workshop',
          venue: 'Auditorium',
          startDate: '2026-11-20',
        });

      assert.equal(res.status, 422);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('should reject event creation with negative expected participants', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${userA.id}`)
        .send({
          clubId: clubA.id,
          title: 'Negative Participants Event',
          category: 'Workshop',
          venue: 'Auditorium',
          startDate: '2026-11-20',
          expectedParticipants: -10,
        });

      assert.equal(res.status, 422);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('should reject event creation with invalid clubId UUID', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${userA.id}`)
        .send({
          clubId: 'not-a-valid-uuid',
          title: 'Invalid UUID Event',
          category: 'Workshop',
          venue: 'Auditorium',
          startDate: '2026-11-20',
        });

      assert.equal(res.status, 422);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('should reject event creation when end date precedes start date', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${userA.id}`)
        .send({
          clubId: clubA.id,
          title: 'Invalid Date Range Event',
          category: 'Workshop',
          venue: 'Auditorium',
          startDate: '2026-11-20',
          endDate: '2026-11-15',
        });

      assert.equal(res.status, 422);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('should reject event creation if caller does not belong to the target club', async () => {
      // User B attempts to create an event in Club A
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${userB.id}`)
        .send({
          clubId: clubA.id,
          title: 'Unauthorized Event Creation',
          category: 'Workshop',
          venue: 'Auditorium',
          startDate: '2026-11-20',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/events')
        .send({
          clubId: clubA.id,
          title: 'No Auth Event',
          category: 'Workshop',
          venue: 'Auditorium',
          startDate: '2026-11-20',
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });
  });

  describe('GET /api/events/:eventId (Retrieve Event)', () => {
    let testEvent;

    before(async () => {
      const created = await EventsRepository.create({
        clubId: clubA.id,
        title: 'Retrieve Test Event',
        category: 'Hackathon',
        venue: 'Main Lab',
        startDate: '2026-12-01',
        createdBy: userA.id,
      });
      testEvent = created.event;
    });

    it('should retrieve existing event for authorized club member', async () => {
      const res = await request(app)
        .get(`/api/events/${testEvent.id}`)
        .set('Authorization', `Bearer ${userA.id}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, testEvent.id);
      assert.equal(res.body.data.title, 'Retrieve Test Event');
    });

    it('should return 404 for nonexistent event UUID', async () => {
      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/events/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${userA.id}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('should return non-disclosing 404 for event belonging to another club', async () => {
      // User B is not in Club A, must get 404 rather than revealing event exists
      const res = await request(app)
        .get(`/api/events/${testEvent.id}`)
        .set('Authorization', `Bearer ${userB.id}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });
  });

  describe('PATCH /api/events/:eventId (Update & Optimistic Concurrency)', () => {
    let updateEvent;

    before(async () => {
      const created = await EventsRepository.create({
        clubId: clubA.id,
        title: 'Revision Concurrency Event',
        category: 'Meetup',
        venue: 'Room 201',
        startDate: '2026-12-05',
        expectedParticipants: 50,
        createdBy: userA.id,
      });
      updateEvent = created.event;
    });

    it('should update permitted fields, increment revision, and record revision snapshot', async () => {
      const res = await request(app)
        .patch(`/api/events/${updateEvent.id}`)
        .set('Authorization', `Bearer ${userA.id}`)
        .send({
          title: 'Revision Concurrency Event - Updated',
          venue: 'Room 301 - Larger Capacity',
          expectedParticipants: 80,
          expectedRevisionNumber: 1,
          changeSummary: 'Expanded venue and expected count',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.event.title, 'Revision Concurrency Event - Updated');
      assert.equal(res.body.data.event.current_revision_number, 2);
      assert.equal(res.body.data.isNoOp, false);

      // Verify revision history now has 2 revisions
      const revsRes = await request(app)
        .get(`/api/events/${updateEvent.id}/revisions`)
        .set('Authorization', `Bearer ${userA.id}`);

      assert.equal(revsRes.status, 200);
      assert.equal(revsRes.body.data.length, 2);
      assert.equal(revsRes.body.data[0].revision_number, 1);
      assert.equal(revsRes.body.data[1].revision_number, 2);
    });

    it('should not increment revision for a no-op update with unchanged values', async () => {
      const res = await request(app)
        .patch(`/api/events/${updateEvent.id}`)
        .set('Authorization', `Bearer ${userA.id}`)
        .send({
          title: 'Revision Concurrency Event - Updated', // same title
          venue: 'Room 301 - Larger Capacity',          // same venue
          expectedRevisionNumber: 2,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.isNoOp, true);
      assert.equal(res.body.data.event.current_revision_number, 2);
    });

    it('should reject stale revision update with 409 Conflict', async () => {
      // Current revision is 2. Client submits expectedRevisionNumber: 1
      const res = await request(app)
        .patch(`/api/events/${updateEvent.id}`)
        .set('Authorization', `Bearer ${userA.id}`)
        .send({
          title: 'Concurrent Conflict Title',
          expectedRevisionNumber: 1,
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'CONFLICT');
    });

    it('should reject attempts to modify protected fields like clubId and createdBy', async () => {
      const res = await request(app)
        .patch(`/api/events/${updateEvent.id}`)
        .set('Authorization', `Bearer ${userA.id}`)
        .send({
          clubId: clubB.id,
          createdBy: userB.id,
        });

      assert.equal(res.status, 422);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('should retrieve a specific historical snapshot without mutating current event', async () => {
      const res = await request(app)
        .get(`/api/events/${updateEvent.id}/revisions/1`)
        .set('Authorization', `Bearer ${userA.id}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.revision_number, 1);
      // Historical title in revision 1 snapshot
      const snapshot = typeof res.body.data.event_data === 'string'
        ? JSON.parse(res.body.data.event_data)
        : res.body.data.event_data;
      assert.equal(snapshot.title, 'Revision Concurrency Event');
    });
  });

  describe('GET /api/events (Listing, Pagination, Search & Security)', () => {
    before(async () => {
      // Seed a few events for listing
      for (let i = 1; i <= 5; i++) {
        await EventsRepository.create({
          clubId: clubA.id,
          title: `Annual Workshop Batch ${i}`,
          category: 'Workshop',
          venue: `Room ${i}`,
          startDate: `2026-11-0${i}`,
          status: i % 2 === 0 ? 'proposed' : 'draft',
          createdBy: userA.id,
        });
      }
    });

    it('should paginate events with limit and page metadata', async () => {
      const res = await request(app)
        .get(`/api/events?clubId=${clubA.id}&page=1&limit=2`)
        .set('Authorization', `Bearer ${userA.id}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.length, 2);
      assert.equal(res.body.pagination.page, 1);
      assert.equal(res.body.pagination.limit, 2);
      assert.ok(res.body.pagination.total >= 5);
    });

    it('should filter events by status', async () => {
      const res = await request(app)
        .get(`/api/events?clubId=${clubA.id}&status=proposed`)
        .set('Authorization', `Bearer ${userA.id}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.length > 0);
      for (const ev of res.body.data) {
        assert.equal(ev.status, 'proposed');
      }
    });

    it('should search events by title case-insensitively', async () => {
      const res = await request(app)
        .get(`/api/events?clubId=${clubA.id}&search=batch 3`)
        .set('Authorization', `Bearer ${userA.id}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].title, 'Annual Workshop Batch 3');
    });

    it('should safely handle SQL injection attempts in search parameter', async () => {
      const res = await request(app)
        .get(`/api/events?clubId=${clubA.id}&search=' OR '1'='1`)
        .set('Authorization', `Bearer ${userA.id}`);

      assert.equal(res.status, 200);
      // Should find 0 records because literal string is queried safely
      assert.equal(res.body.data.length, 0);
    });
  });

  describe('POST /api/events/:eventId/validate (Validation Service)', () => {
    let draftEvent;

    before(async () => {
      // Create a draft with title and date, but missing venue and description
      const created = await EventsRepository.create({
        clubId: clubA.id,
        title: 'Incomplete Draft Event',
        category: 'Workshop',
        venue: '', // empty venue
        startDate: '2026-11-25',
        createdBy: userA.id,
      });
      draftEvent = created.event;
    });

    it('should return needs_input and missingFields for document requirements without rejecting valid draft', async () => {
      const res = await request(app)
        .post(`/api/events/${draftEvent.id}/validate`)
        .set('Authorization', `Bearer ${userA.id}`)
        .send({
          documentType: 'permission_letter',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'needs_input');
      assert.ok(Array.isArray(res.body.data.missingFields));
      const venueMissing = res.body.data.missingFields.find((f) => f.field === 'venue');
      assert.ok(venueMissing, 'Venue should be flagged as missing for permission_letter');
      assert.ok(venueMissing.reason.includes('venue'));
    });
  });
});
