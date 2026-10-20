import { AuthenticationError, ForbiddenError } from '../utils/errors.js';
import { UsersRepository } from '../database/repositories/users.repository.js';
import { ClubsRepository } from '../database/repositories/clubs.repository.js';

/**
 * Authentication middleware that identifies the user via Bearer token or x-user-id header.
 * Attaches the authenticated user to req.user.
 */
export async function authenticate(req, res, next) {
  try {
    let userId = null;

    // Check Authorization header (Bearer <userId> or Bearer <token>)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userId = authHeader.slice(7).trim();
    } else if (req.headers['x-user-id']) {
      userId = req.headers['x-user-id'].trim();
    }

    if (!userId) {
      return next(new AuthenticationError('Authentication required. Please provide a valid Bearer token or credentials.'));
    }

    // Lookup user in database
    const user = await UsersRepository.findById(userId);
    if (!user) {
      return next(new AuthenticationError('Invalid authentication token or user not found.'));
    }

    if (user.account_status !== 'active') {
      return next(new ForbiddenError('User account is inactive or suspended.'));
    }

    // Attach authenticated identity without sensitive internals
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      accountStatus: user.account_status,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Authorization middleware to check if authenticated user has active membership
 * in a club with optional role requirements.
 *
 * @param {string[]} [allowedRoles=[]]
 */
export function requireClubRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return next(new AuthenticationError());
      }

      const clubId = req.params.clubId || req.body.clubId || req.query.clubId;
      if (!clubId) {
        // If clubId is not in params/body/query, downstream controller will check event club
        return next();
      }

      const membership = await ClubsRepository.getMemberRole(clubId, req.user.id);
      if (!membership || membership.status !== 'active') {
        return next(new ForbiddenError(`User is not an active member of club ${clubId}`));
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
        return next(
          new ForbiddenError(`Required role [${allowedRoles.join(', ')}] not held by user (has: ${membership.role})`)
        );
      }

      req.clubMembership = membership;
      next();
    } catch (error) {
      next(error);
    }
  };
}
