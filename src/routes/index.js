import { Router } from 'express';
import healthRoutes from './health.routes.js';
import eventsRoutes from './events.routes.js';
import templatesRoutes from './templates.routes.js';
import { TemplatesController } from '../controllers/templates.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// Health check (public)
router.use('/', healthRoutes);

// Document types master catalogue (requires auth)
router.get('/document-types', authenticate, TemplatesController.getDocumentTypes);

// Templates catalogue
router.use('/templates', templatesRoutes);

// Event management endpoints
router.use('/events', eventsRoutes);

export default router;
