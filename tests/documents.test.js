import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDatabase, teardownTestDatabase } from './testHelper.js';
import { UsersRepository } from '../src/database/repositories/users.repository.js';
import { ClubsRepository } from '../src/database/repositories/clubs.repository.js';
import { EventsRepository } from '../src/database/repositories/events.repository.js';
import { TemplatesRepository } from '../src/database/repositories/templates.repository.js';
import { DocumentsRepository } from '../src/database/repositories/documents.repository.js';

describe('Document Instances and Review Workflow Integration Tests', () => {
  let testClub;
  let authorUser;
  let reviewerUser;
  let testEvent;
  let testRevision;
  let testDocType;
  let testTemplate;
  let testTemplateVersion;

  before(async () => {
    await setupTestDatabase();

    authorUser = await UsersRepository.create({
      name: 'Document Author',
      email: 'author@svnit.acm.org',
      passwordHash: 'pass_auth',
    });

    reviewerUser = await UsersRepository.create({
      name: 'Faculty Reviewer',
      email: 'reviewer@svnit.acm.org',
      passwordHash: 'pass_rev',
    });

    testClub = await ClubsRepository.create({
      name: 'ACM SVNIT',
      code: 'acm-svnit',
      institutionName: 'SVNIT',
      officialContactEmail: 'acm@svnit.edu',
    });

    const createdEvent = await EventsRepository.create({
      clubId: testClub.id,
      title: 'Competitive Coding Bootcamp',
      category: 'Bootcamp',
      startDate: '2026-11-20',
      venue: 'Computer Center Lab 1',
      expectedParticipants: 100,
      createdBy: authorUser.id,
    });
    testEvent = createdEvent.event;
    testRevision = createdEvent.revision;

    testDocType = await TemplatesRepository.createDocumentType({
      slug: 'event_proposal',
      displayName: 'Event Proposal',
    });

    testTemplate = await TemplatesRepository.createTemplate({
      clubId: testClub.id,
      documentTypeId: testDocType.id,
      name: 'Proposal Template',
      createdBy: authorUser.id,
    });

    testTemplateVersion = await TemplatesRepository.createTemplateVersion({
      templateId: testTemplate.id,
      versionNumber: 1,
      docxStorageKey: 'templates/proposal_v1.docx',
      sha256Checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      publicationStatus: 'published',
      createdBy: authorUser.id,
    });
  });

  after(async () => {
    await teardownTestDatabase();
  });

  it('should create a document instance tied to exact template version and event revision', async () => {
    const snapshotData = {
      eventTitle: 'Competitive Coding Bootcamp',
      eventRevisionNumber: 1,
      venue: 'Computer Center Lab 1',
      expectedParticipants: 100,
      templateVersion: 1,
    };

    const docInstance = await DocumentsRepository.createInstance({
      eventId: testEvent.id,
      documentTypeId: testDocType.id,
      templateVersionId: testTemplateVersion.id,
      eventRevisionId: testRevision.id,
      sourceSnapshot: snapshotData,
      status: 'generated',
      docxStorageKey: 'documents/generated/doc_001.docx',
      pdfStorageKey: 'documents/generated/doc_001.pdf',
      fileChecksum: '99887766554433221100aabbccddeeff99887766554433221100aabbccddeeff',
      createdBy: authorUser.id,
    });

    assert.ok(docInstance.id);
    assert.equal(docInstance.event_id, testEvent.id);
    assert.equal(docInstance.template_version_id, testTemplateVersion.id);
    assert.equal(docInstance.event_revision_id, testRevision.id);
    assert.equal(docInstance.status, 'generated');

    // Retrieve instance with joined relations
    const retrieved = await DocumentsRepository.getInstanceById(docInstance.id);
    assert.ok(retrieved);
    assert.equal(retrieved.id, docInstance.id);
    assert.equal(retrieved.document_type_slug, 'event_proposal');
    assert.equal(retrieved.template_version_number, 1);
    assert.equal(retrieved.event_revision_number, 1);

    // Verify source snapshot is preserved immutably
    const storedSnapshot = typeof retrieved.source_snapshot === 'string'
      ? JSON.parse(retrieved.source_snapshot)
      : retrieved.source_snapshot;
    assert.equal(storedSnapshot.eventTitle, 'Competitive Coding Bootcamp');
    assert.equal(storedSnapshot.expectedParticipants, 100);
  });

  it('should track document review approvals, rejections, and comments', async () => {
    const docInstance = await DocumentsRepository.createInstance({
      eventId: testEvent.id,
      documentTypeId: testDocType.id,
      templateVersionId: testTemplateVersion.id,
      eventRevisionId: testRevision.id,
      sourceSnapshot: { dummy: 'data' },
      status: 'in_review',
      createdBy: authorUser.id,
    });

    // 1. First review: requested changes (timestamp t1)
    const t1 = new Date(Date.now() - 60000); // 1 minute ago
    const review1 = await DocumentsRepository.addReview({
      documentInstanceId: docInstance.id,
      reviewerId: reviewerUser.id,
      decision: 'requested_changes',
      comments: 'Please verify the proposed budget for speaker travel.',
      decisionTimestamp: t1,
    });

    assert.ok(review1.id);
    assert.equal(review1.decision, 'requested_changes');

    // 2. Second review: approval (timestamp t2 > t1)
    const t2 = new Date();
    const review2 = await DocumentsRepository.addReview({
      documentInstanceId: docInstance.id,
      reviewerId: reviewerUser.id,
      decision: 'approved',
      comments: 'All changes verified and approved.',
      decisionTimestamp: t2,
    });

    assert.ok(review2.id);
    assert.equal(review2.decision, 'approved');

    // Check updated status on document instance
    const updatedInstance = await DocumentsRepository.getInstanceById(docInstance.id);
    assert.equal(updatedInstance.status, 'approved');

    // Retrieve review history (ordered newest first)
    const history = await DocumentsRepository.getReviews(docInstance.id);
    assert.equal(history.length, 2);
    assert.equal(history[0].decision, 'approved');
    assert.equal(history[1].decision, 'requested_changes');
  });
});
