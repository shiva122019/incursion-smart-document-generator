/**
 * Normalizes input date/time fields from either ISO timestamps (startAt/endAt)
 * or separate date/time fields into the standard database format.
 *
 * @param {Object} input
 * @returns {Object} normalized fields { startDate, endDate, startTime, endTime, timezone }
 */
export function normalizeEventDates(input) {
  let { startDate, endDate, startTime, endTime, startAt, endAt, timezone = 'Asia/Kolkata' } = input;

  if (startAt) {
    const d = new Date(startAt);
    if (!isNaN(d.getTime())) {
      // Format YYYY-MM-DD
      startDate = d.toISOString().split('T')[0];
      // Format HH:MM:SS
      startTime = d.toTimeString().split(' ')[0];
    }
  }

  if (endAt) {
    const d = new Date(endAt);
    if (!isNaN(d.getTime())) {
      endDate = d.toISOString().split('T')[0];
      endTime = d.toTimeString().split(' ')[0];
    }
  }

  return {
    startDate,
    endDate: endDate || null,
    startTime: startTime || null,
    endTime: endTime || null,
    timezone: timezone || 'Asia/Kolkata',
  };
}
