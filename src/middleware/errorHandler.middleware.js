import { AppError } from '../utils/errors.js';
import { errorResponse } from '../utils/response.js';

/**
 * Centralized error-handling middleware.
 */
export function errorHandler(err, req, res, next) {
  // If headers have already been sent, delegate to standard Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle known AppError subclasses, AuthorizationError, or errors with custom statusCode
  if (err instanceof AppError || err.statusCode || err.name === 'AuthorizationError') {
    const statusCode = err.statusCode || 403;
    const code =
      err.code ||
      (statusCode === 403
        ? 'FORBIDDEN'
        : statusCode === 401
        ? 'UNAUTHORIZED'
        : statusCode === 404
        ? 'NOT_FOUND'
        : statusCode === 409
        ? 'CONFLICT'
        : statusCode === 422
        ? 'VALIDATION_ERROR'
        : 'APP_ERROR');

    return errorResponse(
      res,
      {
        code,
        message: err.message,
        details: err.details || [],
      },
      statusCode
    );
  }

  // Handle PostgreSQL specific error codes (pg / pg-mem)
  if (err.code) {
    // Unique violation (e.g. duplicate key)
    if (err.code === '23505') {
      return errorResponse(
        res,
        {
          code: 'CONFLICT',
          message: 'A resource with conflicting unique attributes already exists.',
          details: [{ detail: err.detail || 'Unique constraint violation' }],
        },
        409
      );
    }

    // Check constraint violation (e.g. date ranges, negative participants)
    if (err.code === '23514' || /check constraint/i.test(err.message)) {
      let message = 'Constraint validation failed on database.';
      if (/chk_events_date_range/i.test(err.message)) {
        message = 'End date cannot precede start date.';
      } else if (/chk_events_participants/i.test(err.message)) {
        message = 'Expected participants count cannot be negative.';
      } else if (/chk_events_time_range/i.test(err.message)) {
        message = 'End time cannot precede start time on the same date.';
      }
      return errorResponse(
        res,
        {
          code: 'VALIDATION_ERROR',
          message,
          details: [],
        },
        422
      );
    }

    // Foreign key violation
    if (err.code === '23503' || /foreign key/i.test(err.message)) {
      return errorResponse(
        res,
        {
          code: 'NOT_FOUND',
          message: 'Referenced parent resource does not exist.',
          details: [],
        },
        404
      );
    }
  }

  // Handle SyntaxError (e.g. invalid JSON in request body)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return errorResponse(
      res,
      {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload in request body.',
        details: [],
      },
      400
    );
  }

  // Generic internal server error (redact internals)
  console.error('[UNHANDLED ERROR]', err.message);
  return errorResponse(
    res,
    {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal server error occurred.',
      details: [],
    },
    500
  );
}
