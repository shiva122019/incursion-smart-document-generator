import express from 'express';
import apiRoutes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.middleware.js';
import { errorResponse } from './utils/response.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Root route / health redirect
  app.get('/', (req, res) => {
    res.json({
      name: 'Smart Document Generator API',
      version: '1.0.0',
      health: '/api/health',
    });
  });

  // Mount API router
  app.use('/api', apiRoutes);

  // Catch-all for undefined routes
  app.use((req, res) => {
    return errorResponse(
      res,
      {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        details: [],
      },
      404
    );
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
