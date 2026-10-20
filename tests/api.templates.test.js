import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDatabase, teardownTestDatabase } from './testHelper.js';
import { app } from '../src/app.js';
import { UsersRepository } from '../src/database/repositories/users.repository.js';
import { ClubsRepository } from '../src/database/repositories/clubs.repository.js';
import { TemplatesRepository } from '../src/database/repositories/templates.repository.js';

describe('Templates and Document Types API Integration Tests', () => {
  let userA, userB;
  let clubA, clubB;
  let docTypeProposal, docTypePermission;
  let globalTemplate, clubATemplate;

  before(async () => {
    await setupTestDatabase();

    // Users
    userA = await UsersRepository.create({
      name: 'Alice Club A Admin',
      email: 'alice.tpl@cluba.edu',
      passwordHash: 'dummy_hash_alice',
    });

    userB = await UsersRepository.create({
      name: 'Bob Club B Member',
      email: 'bob.tpl@clubb.edu',
      passwordHash: 'dummy_hash_bob',
    });

    // Clubs
    clubA = await ClubsRepository.create({
      name: 'ACM Chapter A',
      code: 'acm-chap-a',
      institutionName: 'Institute A',
      officialContactEmail: 'acm@in.edu',
    });

    clubB = await ClubsRepository.create({
      name: 'IEEE Chapter B',
      code: 'ieee-chap-b',
      institutionName: 'Institute B',
      officialContactEmail: 'ieee@in.edu',
    });

    await ClubsRepository.addMember({ clubId: clubA.id, userId: userA.id, role: 'club_admin' });
    await ClubsRepository.addMember({ clubId: clubB.id, userId: userB.id, role: 'member' });

    // Seed document types
    docTypeProposal = await TemplatesRepository.createDocumentType({
      slug: 'event_proposal',
      displayName: 'Event Proposal / Submission Form',
      description: 'Formal proposal for administrative sanction',
    });

    docTypePermission = await TemplatesRepository.createDocumentType({
      slug: 'permission_letter',
      displayName: 'Department / Venue Permission Letter',
      description: 'Official venue request',
    });

    // Global institutional template (club_id IS NULL)
    globalTemplate = await TemplatesRepository.createTemplate({
      clubId: null,
      documentTypeId: docTypeProposal.id,
      name: 'Institutional Default Event Proposal',
      createdBy: userA.id,
    });

    // Version 1 Published
    await TemplatesRepository.createTemplateVersion({
      templateId: globalTemplate.id,
      versionNumber: 1,
      docxStorageKey: 's3://secure-bucket/templates/global_v1.docx',
      sha256Checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      fieldSchema: { title: 'string', venue: 'string' },
      requiredFields: ['title', 'venue'],
      publicationStatus: 'published',
      createdBy: userA.id,
    });

    // Club A Specific template
    clubATemplate = await TemplatesRepository.createTemplate({
      clubId: clubA.id,
      documentTypeId: docTypePermission.id,
      name: 'ACM Custom Venue Permission Template',
      createdBy: userA.id,
    });

    // Version 1 Published
    await TemplatesRepository.createTemplateVersion({
      templateId: clubATemplate.id,
      versionNumber: 1,
      docxStorageKey: 's3://secure-bucket/templates/acm_perm_v1.docx',
      sha256Checksum: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      fieldSchema: { venue: 'string', dates: 'array' },
      requiredFields: ['venue'],
      publicationStatus: 'published',
      createdBy: userA.id,
    });

    // Version 2 Draft (Unpublished - must be excluded from public list)
    await TemplatesRepository.createTemplateVersion({
      templateId: clubATemplate.id,
      versionNumber: 2,
      docxStorageKey: 's3://secure-bucket/templates/acm_perm_v2_draft.docx',
      sha256Checksum: '222233334444555566667777888899990000aaaabbbbccccddddeeeeffff1111',
      publicationStatus: 'draft',
      createdBy: userA.id,
    });
  });

  after(async () => {
    await teardownTestDatabase();
  });

  it('GET /api/document-types should return all active document types deterministically', async () => {
    const res = await request(app)
      .get('/api/document-types')
      .set('Authorization', `Bearer ${userA.id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 2);
    const slugs = res.body.data.map((d) => d.slug);
    assert.ok(slugs.includes('event_proposal'));
    assert.ok(slugs.includes('permission_letter'));
  });

  it('GET /api/templates should list active templates and only published versions', async () => {
    const res = await request(app)
      .get(`/api/templates?clubId=${clubA.id}`)
      .set('Authorization', `Bearer ${userA.id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.length >= 2);

    // Verify storage key and checksum are redacted
    for (const tpl of res.body.data) {
      assert.equal(tpl.docx_storage_key, undefined, 'Physical storage key must not be exposed');
      assert.equal(tpl.sha256_checksum, undefined, 'Storage checksum must not be exposed');
      assert.equal(tpl.publication_status, 'published', 'Only published versions should be returned');
      assert.ok(tpl.field_schema, 'Field schema should be provided for client display');
    }
  });

  it('GET /api/templates should filter templates by documentType', async () => {
    const res = await request(app)
      .get(`/api/templates?clubId=${clubA.id}&documentType=event_proposal`)
      .set('Authorization', `Bearer ${userA.id}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    for (const tpl of res.body.data) {
      assert.equal(tpl.document_type_slug, 'event_proposal');
    }
  });

  it('GET /api/templates/:templateId should return template details for authorized member', async () => {
    const res = await request(app)
      .get(`/api/templates/${clubATemplate.id}`)
      .set('Authorization', `Bearer ${userA.id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, clubATemplate.id);
    assert.equal(res.body.data.name, 'ACM Custom Venue Permission Template');
    assert.equal(res.body.data.docx_storage_key, undefined);
  });

  it('GET /api/templates/:templateId should reject access if user does not belong to the template club', async () => {
    // User B is not in Club A
    const res = await request(app)
      .get(`/api/templates/${clubATemplate.id}`)
      .set('Authorization', `Bearer ${userB.id}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});
