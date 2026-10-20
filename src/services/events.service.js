import { EventsRepository } from '../database/repositories/events.repository.js';
import { AuthorizationService } from './authorizationService.js';
import { ValidationService } from './validation.service.js';
import { NotFoundError } from '../utils/errors.js';
import { normalizeEventDates } from '../utils/date.util.js';

export class EventsService {
  /**
   * Creates a new event and initial revision within a transaction after checking club access.
   */
  static async createEvent(eventData, userId) {
    // 1. Authorize: Ensure caller is an active member of the target club
    await AuthorizationService.assertClubAccess({
      userId,
      clubId: eventData.clubId,
      allowedRoles: ['member', 'club_admin', 'finance_officer', 'approver'],
    });

    // 2. Normalize date and time inputs
    const normalizedDates = normalizeEventDates(eventData);

    const payload = {
      ...eventData,
      ...normalizedDates,
      createdBy: userId, // Caller's identity, never client-supplied
    };

    // 3. Create event and initial Revision 1 in transaction
    const { event, revision } = await EventsRepository.create(payload);

    return {
      event,
      revision: {
        id: revision.id,
        revisionNumber: revision.revision_number,
        changeSummary: revision.change_summary,
        createdAt: revision.created_at,
      },
    };
  }

  /**
   * Retrieves an event by ID with club-level authorization.
   * Returns non-disclosing 404 if event does not exist or user lacks membership.
   */
  static async getEvent(eventId, userId) {
    const event = await EventsRepository.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Non-disclosing access check: if user does not belong to club, return 404
    try {
      await AuthorizationService.assertClubAccess({
        userId,
        clubId: event.club_id,
      });
    } catch (err) {
      throw new NotFoundError('Event not found');
    }

    return event;
  }

  /**
   * Lists events with pagination, status/search filters, and club-level data isolation.
   */
  static async listEvents({ userId, clubId = null, status = null, search = null, page = 1, limit = 10 }) {
    if (clubId) {
      // Caller must have access to specified club
      await AuthorizationService.assertClubAccess({
        userId,
        clubId,
      });
    }

    return EventsRepository.findWithPagination({
      clubId,
      status,
      search,
      page,
      limit,
    });
  }

  /**
   * Updates an event and commits a new revision using optimistic concurrency.
   */
  static async updateEvent({ eventId, updates, expectedRevisionNumber = null, userId, changeSummary = null }) {
    // Verify existence and authorization
    const existing = await EventsRepository.findById(eventId);
    if (!existing) {
      throw new NotFoundError('Event not found');
    }

    await AuthorizationService.assertClubAccess({
      userId,
      clubId: existing.club_id,
      allowedRoles: ['club_admin', 'member', 'finance_officer', 'approver'],
    });

    // Normalize date/time updates if present
    const normalizedDates = normalizeEventDates(updates);
    const effectiveUpdates = {
      ...updates,
      ...normalizedDates,
    };

    const { event, revision, isNoOp } = await EventsRepository.updateWithRevision({
      eventId,
      updates: effectiveUpdates,
      expectedRevisionNumber,
      userId,
      changeSummary: changeSummary || `Updated event details`,
    });

    return {
      event,
      revisionNumber: event.current_revision_number,
      isNoOp,
    };
  }

  /**
   * Retrieves revision history for an event.
   */
  static async getRevisions(eventId, userId) {
    const event = await this.getEvent(eventId, userId);
    return EventsRepository.getRevisions(event.id);
  }

  /**
   * Retrieves a specific historical snapshot.
   */
  static async getRevisionByNumber(eventId, revisionNumber, userId) {
    const event = await this.getEvent(eventId, userId);
    const revision = await EventsRepository.getRevisionByNumber(event.id, revisionNumber);
    if (!revision) {
      throw new NotFoundError(`Revision #${revisionNumber} not found for this event`);
    }
    return revision;
  }

  /**
   * Validates an event draft against generic and document-type requirements.
   */
  static async validateDraft({ eventId, userId, documentType = null, documentTypeId = null }) {
    const event = await this.getEvent(eventId, userId);
    return ValidationService.validateEvent(event, { documentType, documentTypeId });
  }
}
