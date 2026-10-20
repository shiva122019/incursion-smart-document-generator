/**
 * Formats and sends a standardized success response.
 *
 * @param {import('express').Response} res
 * @param {any} data
 * @param {number} [statusCode=200]
 * @param {Object|null} [pagination=null]
 */
export function successResponse(res, data, statusCode = 200, pagination = null) {
  const payload = {
    success: true,
    data,
  };

  if (pagination) {
    payload.pagination = pagination;
  }

  return res.status(statusCode).json(payload);
}

/**
 * Formats and sends a standardized error response.
 *
 * @param {import('express').Response} res
 * @param {Object} error
 * @param {string} error.code
 * @param {string} error.message
 * @param {Array} [error.details=[]]
 * @param {number} [statusCode=500]
 */
export function errorResponse(res, { code = 'INTERNAL_ERROR', message = 'An unexpected error occurred', details = [] }, statusCode = 500) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}
