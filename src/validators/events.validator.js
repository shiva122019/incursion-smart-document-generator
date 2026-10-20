import { z } from 'zod';
import { uuidSchema } from './common.validator.js';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createEventSchema = z
  .object({
    clubId: uuidSchema,
    title: z.string().trim().min(1, 'Title is required').max(255),
    category: z.string().trim().min(1, 'Category is required').max(100),
    description: z.string().trim().nullish(),
    objectives: z.string().trim().nullish(),
    targetAudience: z.string().trim().max(255).nullish(),
    venue: z.string().trim().min(1, 'Venue is required').max(255),
    expectedParticipants: z.coerce.number().int().min(0, 'Expected participants cannot be negative').default(0),
    status: z.enum(['draft', 'proposed', 'approved', 'rejected', 'completed', 'cancelled']).default('draft'),
    timezone: z.string().trim().default('Asia/Kolkata'),

    // Date/time fields (either ISO timestamps startAt/endAt or separate date/time fields)
    startAt: z.string().datetime({ offset: true }).optional(),
    endAt: z.string().datetime({ offset: true }).optional(),
    startDate: z.string().regex(dateRegex, 'startDate must be in YYYY-MM-DD format').optional(),
    endDate: z.string().regex(dateRegex, 'endDate must be in YYYY-MM-DD format').nullish(),
    startTime: z.string().regex(timeRegex, 'startTime must be in HH:MM or HH:MM:SS format').nullish(),
    endTime: z.string().regex(timeRegex, 'endTime must be in HH:MM or HH:MM:SS format').nullish(),

    // Optional field sources for AI/provenance tracking
    fieldSources: z
      .array(
        z.object({
          fieldPath: z.string().min(1),
          valueText: z.string().nullish(),
          valueJson: z.any().nullish(),
          sourceType: z.enum(['user_input', 'llm_extraction', 'verified_database_record', 'system_default']).default('user_input'),
          verificationStatus: z.enum(['unverified', 'verified', 'rejected', 'flagged']).default('unverified'),
          extractionConfidence: z.number().min(0).max(1).nullish(),
        })
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Ensure either startDate or startAt is supplied
    if (!data.startDate && !data.startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either startDate or startAt is required',
        path: ['startDate'],
      });
    }

    // Determine effective dates for comparison
    const effStartDate = data.startDate || (data.startAt ? data.startAt.split('T')[0] : null);
    const effEndDate = data.endDate || (data.endAt ? data.endAt.split('T')[0] : null);

    if (effStartDate && effEndDate && effEndDate < effStartDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date cannot precede start date',
        path: ['endDate'],
      });
    }

    // Determine effective times if on same date
    if (effStartDate && effEndDate && effStartDate === effEndDate) {
      const effStartTime = data.startTime || (data.startAt ? data.startAt.split('T')[1].slice(0, 8) : null);
      const effEndTime = data.endTime || (data.endAt ? data.endAt.split('T')[1].slice(0, 8) : null);

      if (effStartTime && effEndTime && effEndTime < effStartTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End time cannot precede start time on the same date',
          path: ['endTime'],
        });
      }
    }
  });

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(255).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().nullish(),
    objectives: z.string().trim().nullish(),
    targetAudience: z.string().trim().max(255).nullish(),
    venue: z.string().trim().min(1).max(255).optional(),
    expectedParticipants: z.coerce.number().int().min(0, 'Expected participants cannot be negative').optional(),
    status: z.enum(['draft', 'proposed', 'approved', 'rejected', 'completed', 'cancelled']).optional(),
    timezone: z.string().trim().optional(),

    startAt: z.string().datetime({ offset: true }).optional(),
    endAt: z.string().datetime({ offset: true }).optional(),
    startDate: z.string().regex(dateRegex, 'startDate must be in YYYY-MM-DD format').optional(),
    endDate: z.string().regex(dateRegex, 'endDate must be in YYYY-MM-DD format').nullish(),
    startTime: z.string().regex(timeRegex, 'startTime must be in HH:MM or HH:MM:SS format').nullish(),
    endTime: z.string().regex(timeRegex, 'endTime must be in HH:MM or HH:MM:SS format').nullish(),

    expectedRevisionNumber: z.coerce.number().int().min(1).optional(),
    changeSummary: z.string().trim().max(500).optional(),

    // Disallowed protected fields
    id: z.never({ message: 'Modifying event ID is forbidden' }).optional(),
    clubId: z.never({ message: 'Modifying club ID is forbidden' }).optional(),
    club_id: z.never({ message: 'Modifying club ID is forbidden' }).optional(),
    createdBy: z.never({ message: 'Modifying createdBy is forbidden' }).optional(),
    created_by: z.never({ message: 'Modifying created_by is forbidden' }).optional(),
    currentRevisionNumber: z.never({ message: 'Modifying currentRevisionNumber directly is forbidden' }).optional(),
    current_revision_number: z.never({ message: 'Modifying current_revision_number directly is forbidden' }).optional(),
  })
  .superRefine((data, ctx) => {
    // Check that at least one mutable field is provided
    const mutableFields = [
      'title', 'category', 'description', 'objectives', 'targetAudience',
      'venue', 'expectedParticipants', 'status', 'timezone',
      'startAt', 'endAt', 'startDate', 'endDate', 'startTime', 'endTime',
    ];
    const hasUpdate = mutableFields.some((f) => data[f] !== undefined);
    if (!hasUpdate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one mutable field must be provided for update',
      });
    }

    // Date range validation if both are present in update
    const effStartDate = data.startDate || (data.startAt ? data.startAt.split('T')[0] : null);
    const effEndDate = data.endDate || (data.endAt ? data.endAt.split('T')[0] : null);
    if (effStartDate && effEndDate && effEndDate < effStartDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date cannot precede start date',
        path: ['endDate'],
      });
    }
  });

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  clubId: uuidSchema.optional(),
  status: z.enum(['draft', 'proposed', 'approved', 'rejected', 'completed', 'cancelled']).optional(),
  search: z.string().trim().max(100).optional(),
});

export const validateEventBodySchema = z.object({
  documentType: z.string().trim().optional(),
  documentTypeId: uuidSchema.optional(),
});

export const eventRevisionParamSchema = z.object({
  eventId: uuidSchema,
  revisionNumber: z.coerce.number().int().min(1),
});
