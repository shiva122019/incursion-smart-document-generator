import { Router } from 'express';
import { EventsController } from '../controllers/events.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  createEventSchema,
  updateEventSchema,
  listEventsQuerySchema,
  validateEventBodySchema,
  eventRevisionParamSchema,
} from '../validators/events.validator.js';
import { uuidParamValidator } from '../validators/common.validator.js';

const router = Router();

// All event endpoints require authentication
router.use(authenticate);

// List events with pagination and filters
router.get(
  '/',
  validateQuery(listEventsQuerySchema),
  EventsController.list
);

// Create event
router.post(
  '/',
  validateBody(createEventSchema),
  EventsController.create
);

// Retrieve single event
router.get(
  '/:eventId',
  validateParams(uuidParamValidator('eventId')),
  EventsController.getById
);

// Update event with optimistic revision locking
router.patch(
  '/:eventId',
  validateParams(uuidParamValidator('eventId')),
  validateBody(updateEventSchema),
  EventsController.update
);

// Retrieve revision history
router.get(
  '/:eventId/revisions',
  validateParams(uuidParamValidator('eventId')),
  EventsController.getRevisions
);

// Retrieve specific historical snapshot
router.get(
  '/:eventId/revisions/:revisionNumber',
  validateParams(eventRevisionParamSchema),
  EventsController.getRevisionByNumber
);

// Validate draft against document type requirements
router.post(
  '/:eventId/validate',
  validateParams(uuidParamValidator('eventId')),
  validateBody(validateEventBodySchema),
  EventsController.validate
);

export default router;
