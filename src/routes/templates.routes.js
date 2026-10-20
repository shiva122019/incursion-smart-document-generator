import { Router } from 'express';
import { TemplatesController } from '../controllers/templates.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateParams } from '../middleware/validate.middleware.js';
import { uuidParamValidator } from '../validators/common.validator.js';

const router = Router();

// Templates require authentication for club-level visibility
router.use(authenticate);

// List active templates and published versions
router.get('/', TemplatesController.getTemplates);

// Get template by ID
router.get(
  '/:templateId',
  validateParams(uuidParamValidator('templateId')),
  TemplatesController.getTemplateById
);

export default router;
