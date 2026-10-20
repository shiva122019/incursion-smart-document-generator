import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDatabase, teardownTestDatabase } from './testHelper.js';
import { UsersRepository } from '../src/database/repositories/users.repository.js';
import { ClubsRepository } from '../src/database/repositories/clubs.repository.js';
import { EventsRepository } from '../src/database/repositories/events.repository.js';
import { AuthorizationService, AuthorizationError } from '../src/services/authorizationService.js';

describe('Multi-Tenant Club Isolation and Authorization Tests', () => {
  let clubAlpha;
  let clubBeta;
  let userAlphaAdmin;
  let userBetaMember;

  before(async () => {
    await setupTestDatabase();

    // Setup two separate clubs
    clubAlpha = await ClubsRepository.create({
      name: 'ACM SVNIT',
      code: 'acm-svnit',
      institutionName: 'SVNIT',
      officialContactEmail: 'acm@svnit.edu',
    });

    clubBeta = await ClubsRepository.create({
      name: 'Robotics Club SVNIT',
      code: 'robotics-svnit',
      institutionName: 'SVNIT',
      officialContactEmail: 'robotics@svnit.edu',
    });

    // User belonging to Club Alpha with admin role
    userAlphaAdmin = await UsersRepository.create({
      name: 'Alpha Admin',
      email: 'admin@alpha.club',
      passwordHash: 'alpha_hash',
    });
    await ClubsRepository.addMember({
      clubId: clubAlpha.id,
      userId: userAlphaAdmin.id,
      role: 'club_admin',
    });

    // User belonging to Club Beta with member role
    userBetaMember = await UsersRepository.create({
      name: 'Beta Member',
      email: 'member@beta.club',
      passwordHash: 'beta_hash',
    });
    await ClubsRepository.addMember({
      clubId: clubBeta.id,
      userId: userBetaMember.id,
      role: 'member',
    });

    // Seed events for each club
    await EventsRepository.create({
      clubId: clubAlpha.id,
      title: 'Alpha Private Hackathon',
      category: 'Hackathon',
      startDate: '2026-11-01',
      venue: 'Alpha Lab',
      expectedParticipants: 50,
      createdBy: userAlphaAdmin.id,
    });

    await EventsRepository.create({
      clubId: clubBeta.id,
      title: 'Beta Robotics Expo',
      category: 'Exhibition',
      startDate: '2026-11-02',
      venue: 'Beta Workshop',
      expectedParticipants: 80,
      createdBy: userBetaMember.id,
    });
  });

  after(async () => {
    await teardownTestDatabase();
  });

  it('should permit access when user is a member of the requested club', async () => {
    const membership = await AuthorizationService.assertClubAccess({
      userId: userAlphaAdmin.id,
      clubId: clubAlpha.id,
      allowedRoles: ['club_admin', 'finance_officer'],
    });

    assert.ok(membership);
    assert.equal(membership.role, 'club_admin');
  });

  it('should restrict access when user attempts to access records belonging to another club', async () => {
    // userBetaMember attempts to access clubAlpha
    await assert.rejects(
      async () => {
        await AuthorizationService.assertClubAccess({
          userId: userBetaMember.id,
          clubId: clubAlpha.id,
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.match(err.message, /Access Denied: User does not belong to or is not active in club/i);
        return true;
      }
    );
  });

  it('should enforce role-based restrictions within the same club', async () => {
    // userBetaMember is in clubBeta, but only has 'member' role, not 'club_admin'
    await assert.rejects(
      async () => {
        await AuthorizationService.assertClubAccess({
          userId: userBetaMember.id,
          clubId: clubBeta.id,
          allowedRoles: ['club_admin', 'approver'],
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.match(err.message, /does not satisfy required roles/i);
        return true;
      }
    );
  });

  it('should enforce club isolation when querying events repository', async () => {
    const alphaEvents = await EventsRepository.findByClub(clubAlpha.id);
    const betaEvents = await EventsRepository.findByClub(clubBeta.id);

    assert.equal(alphaEvents.length, 1);
    assert.equal(alphaEvents[0].title, 'Alpha Private Hackathon');

    assert.equal(betaEvents.length, 1);
    assert.equal(betaEvents[0].title, 'Beta Robotics Expo');

    // Cross-verify: no Alpha event appears in Beta query
    assert.ok(!betaEvents.some((e) => e.club_id === clubAlpha.id));
    assert.ok(!alphaEvents.some((e) => e.club_id === clubBeta.id));
  });
});
