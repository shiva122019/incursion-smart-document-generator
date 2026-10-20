import { TemplatesRepository } from '../database/repositories/templates.repository.js';

/**
 * Standard required fields configuration for known document types.
 * Can be dynamically extended or overridden by template_versions.required_fields.
 */
const DOCUMENT_TYPE_RULES = {
  event_proposal: [
    { field: 'title', reason: 'An event title is required for proposal submissions.' },
    { field: 'category', reason: 'Category (e.g. Workshop, Hackathon) is required.' },
    { field: 'description', reason: 'A detailed description is required for proposal review.' },
    { field: 'objectives', reason: 'Event objectives are required for formal approval.' },
    { field: 'venue', reason: 'A proposed venue must be specified.' },
    { field: 'start_date', altField: 'startDate', reason: 'Event start date must be scheduled.' },
    { field: 'expected_participants', altField: 'expectedParticipants', reason: 'Expected participants count is required for budget planning.' },
  ],
  permission_letter: [
    { field: 'title', reason: 'An event title is required for permission requests.' },
    { field: 'venue', reason: 'A venue is required for the selected document.' },
    { field: 'start_date', altField: 'startDate', reason: 'Event start date is required for venue booking.' },
    { field: 'end_date', altField: 'endDate', reason: 'Event end date is required for venue booking.' },
    { field: 'start_time', altField: 'startTime', reason: 'Start time is required for venue scheduling.' },
    { field: 'end_time', altField: 'endTime', reason: 'End time is required for venue scheduling.' },
    { field: 'expected_participants', altField: 'expectedParticipants', reason: 'Expected participants count is required to verify venue capacity.' },
  ],
  bill_certificate: [
    { field: 'title', reason: 'Event title is required for bill certification.' },
    { field: 'venue', reason: 'Venue is required for verification of incurred expenses.' },
    { field: 'start_date', altField: 'startDate', reason: 'Date of event execution is required.' },
  ],
  bill_summary: [
    { field: 'title', reason: 'Event title is required for bill summary.' },
    { field: 'start_date', altField: 'startDate', reason: 'Date is required for financial year reporting.' },
  ],
  prize_money_receipt: [
    { field: 'title', reason: 'Competition or event title is required.' },
    { field: 'start_date', altField: 'startDate', reason: 'Event date is required for receipt generation.' },
  ],
};

export class ValidationService {
  /**
   * Deterministically validates an event entity against generic schema rules
   * and document-type specific required fields.
   *
   * @param {Object} event - The event record from database or draft payload
   * @param {Object} [options]
   * @param {string} [options.documentType] - Document type slug (e.g. 'event_proposal')
   * @param {string} [options.documentTypeId] - Document type UUID
   * @param {any} [client]
   * @returns {Promise<{ status: 'valid' | 'needs_input' | 'invalid', errors: Array, missingFields: Array }>}
   */
  static async validateEvent(event, { documentType = null, documentTypeId = null } = {}, client = null) {
    const errors = [];
    const missingFields = [];

    // --- 1. Generic Event Invariant Checks ---
    if (!event.title || typeof event.title !== 'string' || event.title.trim().length === 0) {
      errors.push({
        field: 'title',
        message: 'Event title is required and cannot be empty.',
      });
    }

    const participants = event.expected_participants !== undefined
      ? event.expected_participants
      : event.expectedParticipants;

    if (participants !== undefined && participants !== null && Number(participants) < 0) {
      errors.push({
        field: 'expectedParticipants',
        message: 'Expected participant count cannot be negative.',
      });
    }

    const startDate = event.start_date || event.startDate;
    const endDate = event.end_date || event.endDate;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end < start) {
        errors.push({
          field: 'endDate',
          message: 'End date cannot precede start date.',
        });
      }
    }

    const startTime = event.start_time || event.startTime;
    const endTime = event.end_time || event.endTime;

    if (startDate && endDate && startDate === endDate && startTime && endTime) {
      if (endTime < startTime) {
        errors.push({
          field: 'endTime',
          message: 'End time cannot precede start time on the same date.',
        });
      }
    }

    // --- 2. Document-Specific Requirement Checks ---
    let effectiveSlug = documentType;

    if (!effectiveSlug && documentTypeId) {
      const docTypeRow = await TemplatesRepository.getDocumentTypeById(documentTypeId, client);
      if (docTypeRow) {
        effectiveSlug = docTypeRow.slug;
      }
    }

    if (effectiveSlug) {
      // Check document type catalog rules
      const rules = DOCUMENT_TYPE_RULES[effectiveSlug] || [];
      for (const rule of rules) {
        const val = event[rule.field] !== undefined ? event[rule.field] : (rule.altField ? event[rule.altField] : undefined);
        const isEmpty = val === undefined || val === null || (typeof val === 'string' && val.trim() === '');

        if (isEmpty) {
          missingFields.push({
            field: rule.altField || rule.field,
            reason: rule.reason,
          });
        }
      }
    }

    // Determine status
    let status = 'valid';
    if (errors.length > 0) {
      status = 'invalid';
    } else if (missingFields.length > 0) {
      status = 'needs_input';
    }

    return {
      status,
      errors,
      missingFields,
    };
  }
}
