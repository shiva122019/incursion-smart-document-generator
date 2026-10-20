import { EventsService } from '../services/events.service.js';
import { successResponse } from '../utils/response.js';

export class EventsController {
  /**
   * POST /api/events
   */
  static async create(req, res, next) {
    try {
      const result = await EventsService.createEvent(req.body, req.user.id);
      return successResponse(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/events/:eventId
   */
  static async getById(req, res, next) {
    try {
      const event = await EventsService.getEvent(req.params.eventId, req.user.id);
      return successResponse(res, event, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/events
   */
  static async list(req, res, next) {
    try {
      const { page, limit, clubId, status, search } = req.query;
      const { records, pagination } = await EventsService.listEvents({
        userId: req.user.id,
        clubId,
        status,
        search,
        page,
        limit,
      });

      return successResponse(res, records, 200, pagination);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/events/:eventId
   */
  static async update(req, res, next) {
    try {
      const { expectedRevisionNumber, changeSummary, ...updates } = req.body;
      const result = await EventsService.updateEvent({
        eventId: req.params.eventId,
        updates,
        expectedRevisionNumber,
        userId: req.user.id,
        changeSummary,
      });

      return successResponse(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/events/:eventId/revisions
   */
  static async getRevisions(req, res, next) {
    try {
      const revisions = await EventsService.getRevisions(req.params.eventId, req.user.id);
      return successResponse(res, revisions, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/events/:eventId/revisions/:revisionNumber
   */
  static async getRevisionByNumber(req, res, next) {
    try {
      const revision = await EventsService.getRevisionByNumber(
        req.params.eventId,
        req.params.revisionNumber,
        req.user.id
      );
      return successResponse(res, revision, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/events/:eventId/validate
   */
  static async validate(req, res, next) {
    try {
      const { documentType, documentTypeId } = req.body || {};
      const result = await EventsService.validateDraft({
        eventId: req.params.eventId,
        userId: req.user.id,
        documentType,
        documentTypeId,
      });

      return successResponse(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}
