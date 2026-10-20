import { testConnection } from '../database/connection.js';
import { successResponse } from '../utils/response.js';

export class HealthController {
  /**
   * Health check endpoint verifying service and database readiness.
   * GET /api/health
   */
  static async getHealth(req, res, next) {
    try {
      const dbHealth = await testConnection();

      const statusCode = dbHealth.healthy ? 200 : 503;
      const responseData = {
        status: dbHealth.healthy ? 'UP' : 'DEGRADED',
        database: {
          status: dbHealth.healthy ? 'connected' : 'disconnected',
          timestamp: dbHealth.timestamp || new Date().toISOString(),
          // Server version reported safely without leaking internal hostnames or credentials
          server: dbHealth.healthy ? (dbHealth.serverVersion ? 'PostgreSQL' : 'unknown') : 'unavailable',
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };

      return successResponse(res, responseData, statusCode);
    } catch (error) {
      next(error);
    }
  }
}
