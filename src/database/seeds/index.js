import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { withTransaction, query } from '../connection.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { ClubsRepository } from '../repositories/clubs.repository.js';
import { EventsRepository } from '../repositories/events.repository.js';
import { TemplatesRepository } from '../repositories/templates.repository.js';
import { FinancialRepository } from '../repositories/financial.repository.js';
import { DocumentsRepository } from '../repositories/documents.repository.js';
import { AuditRepository } from '../repositories/audit.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runSeeds() {
  console.log('Seeding initial document types and demonstration data...');

  return withTransaction(async (tx) => {
    // 1. Seed the 5 standard document types from SQL
    const docTypesSql = fs.readFileSync(path.join(__dirname, '001_seed_document_types.sql'), 'utf-8');
    await tx.query(docTypesSql);
    console.log('  ✓ Seeded standard document types');

    // 2. Seed synthetic demonstration club
    const club = await ClubsRepository.create(
      {
        name: 'ACM Student Chapter, SVNIT',
        code: 'acm-svnit',
        institutionName: 'Sardar Vallabhbhai National Institute of Technology, Surat',
        officialContactEmail: 'acm@svnit.ac.in',
        officialContactPhone: '+91-261-2259571',
        branding: {
          primaryColor: '#005596',
          secondaryColor: '#00843D',
          fontFamily: 'Inter',
          headerLogoUrl: 'storage://branding/acm-svnit-logo.png',
          letterheadTitle: 'ACM SVNIT Student Chapter - Official Document',
        },
      },
      tx
    );
    console.log(`  ✓ Seeded club: ${club.name} (${club.code})`);

    // 3. Seed synthetic users (using random dev-only unguessable hashes, no plaintext passwords)
    const devDummyHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');

    const adminUser = await UsersRepository.create(
      {
        name: 'Demo Club Admin',
        email: 'admin.demo@svnit.acm.org',
        passwordHash: `$dev$${devDummyHash}`,
        accountStatus: 'active',
      },
      tx
    );

    const financeUser = await UsersRepository.create(
      {
        name: 'Demo Finance Officer',
        email: 'finance.demo@svnit.acm.org',
        passwordHash: `$dev$${devDummyHash}`,
        accountStatus: 'active',
      },
      tx
    );

    const approverUser = await UsersRepository.create(
      {
        name: 'Demo Faculty Advisor',
        email: 'advisor.demo@svnit.acm.org',
        passwordHash: `$dev$${devDummyHash}`,
        accountStatus: 'active',
      },
      tx
    );

    const memberUser = await UsersRepository.create(
      {
        name: 'Demo Core Member',
        email: 'member.demo@svnit.acm.org',
        passwordHash: `$dev$${devDummyHash}`,
        accountStatus: 'active',
      },
      tx
    );

    // 4. Assign Club Memberships
    await ClubsRepository.addMember({ clubId: club.id, userId: adminUser.id, role: 'club_admin' }, tx);
    await ClubsRepository.addMember({ clubId: club.id, userId: financeUser.id, role: 'finance_officer' }, tx);
    await ClubsRepository.addMember({ clubId: club.id, userId: approverUser.id, role: 'approver' }, tx);
    await ClubsRepository.addMember({ clubId: club.id, userId: memberUser.id, role: 'member' }, tx);
    console.log('  ✓ Seeded demo users and club role memberships');

    // 5. Seed sample Event
    const { event, revision } = await EventsRepository.create(
      {
        clubId: club.id,
        title: 'Annual Competitive Programming Bootcamp 2026',
        category: 'Workshop',
        description: 'Intensive 3-day algorithmic training bootcamp for undergraduate engineering students.',
        objectives: 'To train students in advanced graph algorithms, dynamic programming, and team contest workflows.',
        targetAudience: 'B.Tech Undergraduates (All engineering disciplines)',
        startDate: '2026-11-10',
        endDate: '2026-11-12',
        startTime: '09:00:00',
        endTime: '17:30:00',
        timezone: 'Asia/Kolkata',
        venue: 'Computer Center Lab 3 & Central Seminar Hall',
        expectedParticipants: 150,
        status: 'proposed',
        createdBy: adminUser.id,
        fieldSources: [
          {
            fieldPath: 'venue',
            valueText: 'Computer Center Lab 3 & Central Seminar Hall',
            sourceType: 'user_input',
            verificationStatus: 'verified',
            verifiedBy: adminUser.id,
            verifiedAt: new Date(),
          },
          {
            fieldPath: 'expected_participants',
            valueText: '150',
            sourceType: 'llm_extraction',
            verificationStatus: 'verified',
            extractionConfidence: 0.950,
            verifiedBy: adminUser.id,
            verifiedAt: new Date(),
          },
          {
            fieldPath: 'objectives',
            valueText: 'To train students in advanced graph algorithms...',
            sourceType: 'llm_extraction',
            verificationStatus: 'unverified',
            extractionConfidence: 0.880,
          },
        ],
      },
      tx
    );
    console.log(`  ✓ Seeded sample event: ${event.title} (Revision 1)`);

    // 6. Seed Configurable Template and Published Version
    const proposalDocType = await TemplatesRepository.getDocumentTypeBySlug('event_proposal', tx);
    const template = await TemplatesRepository.createTemplate(
      {
        clubId: club.id,
        documentTypeId: proposalDocType.id,
        name: 'ACM Standard Event Proposal Template',
        description: 'Standard event proposal document with SVNIT institutional header and budget layout.',
        createdBy: adminUser.id,
      },
      tx
    );

    const templateVersion = await TemplatesRepository.createTemplateVersion(
      {
        templateId: template.id,
        versionNumber: 1,
        docxStorageKey: 'templates/acm-svnit/event_proposal_v1.docx',
        sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        fieldSchema: {
          eventTitle: { type: 'string', required: true },
          dates: { type: 'string', required: true },
          venue: { type: 'string', required: true },
          budgetSummary: { type: 'array', required: true },
        },
        fieldMappings: {
          '{{EVENT_TITLE}}': 'event.title',
          '{{VENUE}}': 'event.venue',
          '{{START_DATE}}': 'event.start_date',
        },
        requiredFields: ['title', 'start_date', 'venue', 'expected_participants'],
        optionalFields: ['end_date', 'start_time', 'end_time'],
        publicationStatus: 'draft',
        createdBy: adminUser.id,
      },
      tx
    );

    // Publish the template version (making it immutable)
    await TemplatesRepository.publishTemplateVersion(templateVersion.id, tx);
    console.log(`  ✓ Seeded template & published version: ${template.name} v1`);

    // 7. Seed proposed budget items
    await FinancialRepository.createBudgetItem(
      {
        eventId: event.id,
        description: 'Honorarium for Industry Guest Speakers (3 sessions)',
        quantity: 3,
        unitPrice: 4000.0,
        otherCharges: 0.0,
        displayOrder: 1,
      },
      tx
    );
    await FinancialRepository.createBudgetItem(
      {
        eventId: event.id,
        description: 'Participant Delegate Kits, Badges, & Stationeries',
        quantity: 150,
        unitPrice: 85.0,
        otherCharges: 500.0,
        displayOrder: 2,
      },
      tx
    );
    console.log('  ✓ Seeded proposed budget items');

    // 8. Seed Payout Recipient & Sensitive Banking Details
    const recipient = await FinancialRepository.createRecipient(
      {
        clubId: club.id,
        name: 'Aarav Sharma',
        rollNumber: 'U23CS045',
        course: 'B.Tech Computer Science & Engineering',
        semester: 'Semester 5',
        contactEmail: 'aarav.sharma@svnit.ac.in',
        contactPhone: '+91-9876543210',
      },
      tx
    );

    await FinancialRepository.addRecipientPaymentDetails(
      {
        recipientId: recipient.id,
        bankName: 'State Bank of India',
        accountHolderName: 'Aarav Sharma',
        accountNumber: '11223344556677',
        ifscCode: 'SBIN0003320',
        panNumber: 'ABCDE1234F',
      },
      tx
    );

    await FinancialRepository.createPayout(
      {
        eventId: event.id,
        recipientId: recipient.id,
        payoutPurpose: 'Contest 1st Prize Award',
        competitionName: 'ACM Algorithmic Challenge',
        position: '1st Place',
        amount: 5000.0,
        currency: 'INR',
        status: 'approved',
        approvalRef: 'ACM/PRIZE/2026/01',
        createdBy: financeUser.id,
      },
      tx
    );
    console.log('  ✓ Seeded payout recipient and contest prize award');

    // 9. Seed Generated Document Instance
    const docInstance = await DocumentsRepository.createInstance(
      {
        eventId: event.id,
        documentTypeId: proposalDocType.id,
        templateVersionId: templateVersion.id,
        eventRevisionId: revision.id,
        sourceSnapshot: {
          club: { name: club.name, code: club.code },
          event: { title: event.title, venue: event.venue, expected_participants: 150 },
          budget: [{ description: 'Honorarium', total: '12000.00' }],
        },
        status: 'generated',
        docxStorageKey: 'documents/generated/proposal_bootcamp_2026_rev1.docx',
        pdfStorageKey: 'documents/generated/proposal_bootcamp_2026_rev1.pdf',
        fileChecksum: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
        createdBy: adminUser.id,
      },
      tx
    );
    console.log(`  ✓ Seeded generated document instance: ${docInstance.id}`);

    // 10. Audit log
    await AuditRepository.logAction(
      {
        actorId: adminUser.id,
        clubId: club.id,
        action: 'seed_database_initialized',
        entityType: 'club',
        entityId: club.id,
        metadata: { environment: 'development', version: '1.0.0' },
      },
      tx
    );
    console.log('  ✓ Seeded initial audit log');
  });
}
