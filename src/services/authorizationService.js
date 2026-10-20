import { ClubsRepository } from '../database/repositories/clubs.repository.js';

export class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}

export class AuthorizationService {
  /**
   * Asserts that a user has active membership in the target club, and optionally checks their role.
   * Throws AuthorizationError if access is denied.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.clubId
   * @param {string[]} [params.allowedRoles]
   * @param {any} [client]
   * @returns {Promise<{ role: string, status: string }>}
   */
  static async assertClubAccess({ userId, clubId, allowedRoles = [] }, client = null) {
    if (!userId || !clubId) {
      throw new AuthorizationError('User ID and Club ID are required for access control verification');
    }

    const membership = await ClubsRepository.getMemberRole(clubId, userId, client);
    if (!membership || membership.status !== 'active') {
      throw new AuthorizationError(`Access Denied: User does not belong to or is not active in club ${clubId}`);
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
      throw new AuthorizationError(
        `Access Denied: User role "${membership.role}" does not satisfy required roles [${allowedRoles.join(', ')}]`
      );
    }

    return membership;
  }
}
