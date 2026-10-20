import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDatabase, teardownTestDatabase } from './testHelper.js';
import { UsersRepository } from '../src/database/repositories/users.repository.js';
import { ClubsRepository } from '../src/database/repositories/clubs.repository.js';
import { TemplatesRepository } from '../src/database/repositories/templates.repository.js';

describe('Document Types and Configurable Templates Integration Tests', () => {
  let testClub;
  let testUser;
  let testDocType;

  before(async () => {
    await setupTestDatabase();

    testUser = await UsersRepository.create({
      name: 'Template Designer',
      email: 'designer@svnit.edu',
      passwordHash: 'hash_test',
    });

    testClub = await ClubsRepository.create({
      name: 'ACM Student Chapter',
      code: 'acm-svnit',
      institutionName: 'SVNIT',
      officialContactEmail: 'acm@svnit.edu',
    });

    testDocType = await TemplatesRepository.createDocumentType({
      slug: 'event_proposal',
      displayName: 'Event Proposal Form',
      description: 'Standard event proposal document',
    });
  });

  after(async () => {
    await teardownTestDatabase();
  });

  it('should create a template and publish a template version', async () => {
    const template = await TemplatesRepository.createTemplate({
      clubId: testClub.id,
      documentTypeId: testDocType.id,
      name: 'SVNIT Official Proposal Template',
      description: 'Template with institutional logo and budget tables',
      createdBy: testUser.id,
    });

    assert.ok(template.id);
    assert.equal(template.name, 'SVNIT Official Proposal Template');
    assert.equal(template.club_id, testClub.id);

    const version = await TemplatesRepository.createTemplateVersion({
      templateId: template.id,
      versionNumber: 1,
      docxStorageKey: 'templates/proposals/v1.docx',
      sha256Checksum: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
      fieldSchema: {
        title: { type: 'string' },
        venue: { type: 'string' },
      },
      fieldMappings: {
        '{{TITLE}}': 'event.title',
      },
      requiredFields: ['title', 'venue'],
      publicationStatus: 'draft',
      createdBy: testUser.id,
    });

    assert.ok(version.id);
    assert.equal(version.version_number, 1);
    assert.equal(version.publication_status, 'draft');

    // Publish the template version
    const published = await TemplatesRepository.publishTemplateVersion(version.id);
    assert.equal(published.publication_status, 'published');

    // Retrieve the published template version
    const fetched = await TemplatesRepository.getTemplateVersion(template.id, 1);
    assert.ok(fetched);
    assert.equal(fetched.publication_status, 'published');
    assert.equal(fetched.docx_storage_key, 'templates/proposals/v1.docx');
  });

  it('should prevent duplicate template versions with the same version number', async () => {
    const template = await TemplatesRepository.createTemplate({
      clubId: testClub.id,
      documentTypeId: testDocType.id,
      name: 'Permission Letter Template',
      createdBy: testUser.id,
    });

    await TemplatesRepository.createTemplateVersion({
      templateId: template.id,
      versionNumber: 1,
      docxStorageKey: 'templates/perm/v1.docx',
      sha256Checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    });

    // Attempting to create duplicate version 1 must fail due to unique constraint
    await assert.rejects(
      async () => {
        await TemplatesRepository.createTemplateVersion({
          templateId: template.id,
          versionNumber: 1, // Duplicate
          docxStorageKey: 'templates/perm/v1_duplicate.docx',
          sha256Checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        });
      },
      (err) => {
        return /uq_template_versions_template_version|unique/i.test(err.message);
      }
    );
  });

  it('should enforce foreign-key relationships when referencing non-existent parent records', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    // Fails on non-existent document_type_id
    await assert.rejects(
      async () => {
        await TemplatesRepository.createTemplate({
          clubId: testClub.id,
          documentTypeId: nonExistentId,
          name: 'Invalid Template',
          createdBy: testUser.id,
        });
      },
      (err) => {
        return /foreign key|templates_document_type_id_fkey/i.test(err.message);
      }
    );
  });
});
