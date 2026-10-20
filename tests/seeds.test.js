import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDatabase, teardownTestDatabase } from './testHelper.js';
import { runSeeds } from '../src/database/seeds/index.js';
import { TemplatesRepository } from '../src/database/repositories/templates.repository.js';
import { ClubsRepository } from '../src/database/repositories/clubs.repository.js';
import { EventsRepository } from '../src/database/repositories/events.repository.js';
import { FinancialRepository } from '../src/database/repositories/financial.repository.js';
import { DocumentsRepository } from '../src/database/repositories/documents.repository.js';
import { query } from '../src/database/connection.js';

describe('Seed Runner and Demonstration Data Verification', () => {
  before(async () => {
    await setupTestDatabase();
  });

  after(async () => {
    await teardownTestDatabase();
  });

  it('should execute runSeeds successfully and populate synthetic demonstration data', async () => {
    await runSeeds();

    // 1. Verify 5 standard document types
    const docTypes = await TemplatesRepository.getDocumentTypes();
    assert.equal(docTypes.length, 5);
    const slugs = docTypes.map((d) => d.slug).sort();
    assert.deepEqual(slugs, [
      'bill_certificate',
      'bill_summary',
      'event_proposal',
      'permission_letter',
      'prize_money_receipt',
    ]);

    // 2. Verify demonstration club
    const club = await ClubsRepository.findByCode('acm-svnit');
    assert.ok(club);
    assert.equal(club.name, 'ACM Student Chapter, SVNIT');
    assert.equal(club.institution_name, 'Sardar Vallabhbhai National Institute of Technology, Surat');

    // 3. Verify demonstration event
    const events = await EventsRepository.findByClub(club.id);
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.title, 'Annual Competitive Programming Bootcamp 2026');
    assert.equal(event.expected_participants, 150);

    // 4. Verify budget items
    const budgetItems = await FinancialRepository.getBudgetItemsByEvent(event.id);
    assert.equal(budgetItems.length, 2);

    // 5. Verify payout
    const payouts = await FinancialRepository.getPayoutsByEvent(event.id);
    assert.equal(payouts.length, 1);
    assert.equal(Number(payouts[0].amount), 5000);
    assert.equal(payouts[0].recipient_name, 'Aarav Sharma');

    // 6. Verify generated document instance
    const instances = await DocumentsRepository.findByEvent(event.id);
    assert.equal(instances.length, 1);
    assert.equal(instances[0].status, 'generated');
    assert.equal(instances[0].document_type_slug, 'event_proposal');

    // 7. Verify audit log entry
    const auditRes = await query('SELECT * FROM audit_logs WHERE club_id = $1;', [club.id]);
    assert.ok(auditRes.rows.length >= 1);
    assert.equal(auditRes.rows[0].action, 'seed_database_initialized');
  });
});
