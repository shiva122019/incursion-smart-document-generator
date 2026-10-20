import { ValidationError } from '../utils/errors.js';

/**
 * Creates middleware to validate request body against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      return next(new ValidationError('Request validation failed', details));
    }
    req.body = result.data;
    next();
  };
}

/**
 * Creates middleware to validate request query parameters against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      return next(new ValidationError('Invalid query parameters', details));
    }

    // In Express 5, req.query is a getter; mutate in-place rather than reassigning
    for (const key of Object.keys(req.query)) {
      delete req.query[key];
    }
    Object.assign(req.query, result.data);
    req.validatedQuery = result.data;
    next();
  };
}

/**
 * Creates middleware to validate URL route parameters against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      return next(new ValidationError('Invalid route parameters', details));
    }

    for (const key of Object.keys(req.params)) {
      delete req.params[key];
    }
    Object.assign(req.params, result.data);
    req.validatedParams = result.data;
    next();
  };
}
