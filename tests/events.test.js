import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDatabase, teardownTestDatabase } from './testHelper.js';
import { UsersRepository } from '../src/database/repositories/users.repository.js';
import { ClubsRepository } from '../src/database/repositories/clubs.repository.js';
import { EventsRepository } from '../src/database/repositories/events.repository.js';

describe('Events and Revision History Integration Tests', () => {
  let testClub;
  let testUser;

  before(async () => {
    await setupTestDatabase();

    testUser = await UsersRepository.create({
      name: 'Event Organizer',
      email: 'organizer@club.edu',
      passwordHash: 'dummy_hash_123',
    });

    testClub = await ClubsRepository.create({
      name: 'ACM SVNIT',
      code: 'acm-svnit',
      institutionName: 'SVNIT Surat',
      officialContactEmail: 'acm@svnit.ac.in',
      branding: { theme: 'blue' },
    });
  });

  after(async () => {
    await teardownTestDatabase();
  });

  it('should successfully create and retrieve an event with initial Revision 1', async () => {
    const eventPayload = {
      clubId: testClub.id,
      title: 'Web Development Workshop 2026',
      category: 'Workshop',
      description: 'Hands-on full-stack development workshop',
      objectives: 'Learn React and Node.js',
      targetAudience: 'Undergraduate students',
      startDate: '2026-11-15',
      endDate: '2026-11-16',
      startTime: '10:00:00',
      endTime: '17:00:00',
      venue: 'Seminar Hall 1',
      expectedParticipants: 120,
      status: 'proposed',
      createdBy: testUser.id,
      fieldSources: [
        {
          fieldPath: 'venue',
          valueText: 'Seminar Hall 1',
          sourceType: 'user_input',
          verificationStatus: 'verified',
        },
        {
          fieldPath: 'expected_participants',
          valueText: '120',
          sourceType: 'llm_extraction',
          extractionConfidence: 0.95,
          verificationStatus: 'verified',
        },
      ],
    };

    const { event, revision } = await EventsRepository.create(eventPayload);

    assert.ok(event.id);
    assert.equal(event.title, 'Web Development Workshop 2026');
    assert.equal(event.current_revision_number, 1);
    assert.equal(event.expected_participants, 120);

    assert.ok(revision.id);
    assert.equal(revision.revision_number, 1);
    assert.equal(revision.event_id, event.id);

    // Retrieve event
    const fetched = await EventsRepository.findById(event.id);
    assert.ok(fetched);
    assert.equal(fetched.id, event.id);
    assert.equal(fetched.venue, 'Seminar Hall 1');

    // Retrieve field sources
    const sources = await EventsRepository.getFieldSources(revision.id);
    assert.equal(sources.length, 2);
    const llmSource = sources.find((s) => s.field_path === 'expected_participants');
    assert.ok(llmSource);
    assert.equal(llmSource.source_type, 'llm_extraction');
    assert.equal(Number(llmSource.extraction_confidence), 0.95);
  });

  it('should transactionally create a new event revision and increment current_revision_number', async () => {
    const { event } = await EventsRepository.create({
      clubId: testClub.id,
      title: 'Hackathon v1',
      category: 'Hackathon',
      startDate: '2026-12-01',
      venue: 'Old Auditorium',
      expectedParticipants: 80,
      createdBy: testUser.id,
    });

    assert.equal(event.current_revision_number, 1);

    // Create Revision 2
    const rev2 = await EventsRepository.createRevision({
      eventId: event.id,
      eventData: {
        title: 'Hackathon v2 Updated',
        venue: 'Grand Central Auditorium',
        expectedParticipants: 200,
      },
      changeSummary: 'Upgraded venue due to high demand',
      userId: testUser.id,
      fieldSources: [
        {
          fieldPath: 'venue',
          valueText: 'Grand Central Auditorium',
          sourceType: 'user_input',
          verificationStatus: 'verified',
        },
      ],
    });

    assert.ok(rev2.id);
    assert.equal(rev2.revision_number, 2);
    assert.equal(rev2.change_summary, 'Upgraded venue due to high demand');

    // Verify event is updated with revision 2
    const updatedEvent = await EventsRepository.findById(event.id);
    assert.equal(updatedEvent.current_revision_number, 2);
    assert.equal(updatedEvent.venue, 'Grand Central Auditorium');
    assert.equal(updatedEvent.expected_participants, 200);

    // Verify all revisions history
    const allRevs = await EventsRepository.getRevisions(event.id);
    assert.equal(allRevs.length, 2);
    assert.equal(allRevs[0].revision_number, 1);
    assert.equal(allRevs[1].revision_number, 2);
  });

  it('should reject invalid negative participant count due to check constraint', async () => {
    await assert.rejects(
      async () => {
        await EventsRepository.create({
          clubId: testClub.id,
          title: 'Invalid Participants Event',
          category: 'Meetup',
          startDate: '2026-11-20',
          venue: 'Room 101',
          expectedParticipants: -5,
          createdBy: testUser.id,
        });
      },
      (err) => {
        return /chk_events_participants|check constraint/i.test(err.message);
      }
    );
  });

  it('should reject invalid date range where end_date precedes start_date', async () => {
    await assert.rejects(
      async () => {
        await EventsRepository.create({
          clubId: testClub.id,
          title: 'Invalid Dates Event',
          category: 'Meetup',
          startDate: '2026-11-20',
          endDate: '2026-11-10', // Precedes start_date
          venue: 'Room 101',
          expectedParticipants: 50,
          createdBy: testUser.id,
        });
      },
      (err) => {
        return /chk_events_date_range|check constraint/i.test(err.message);
      }
    );
  });
});
