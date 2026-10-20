import { query, withTransaction } from '../connection.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';

export class EventsRepository {
  /**
   * Creates an event along with its initial Revision #1 and optional initial field sources in a single transaction.
   */
  static async create(eventData, client = null) {
    const execute = async (tx) => {
      const insertSql = `
        INSERT INTO events (
          club_id, title, category, description, objectives, target_audience,
          start_date, end_date, start_time, end_time, timezone, venue,
          expected_participants, status, current_revision_number, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1, $15)
        RETURNING *;
      `;

      const values = [
        eventData.clubId,
        eventData.title,
        eventData.category,
        eventData.description || null,
        eventData.objectives || null,
        eventData.targetAudience || null,
        eventData.startDate,
        eventData.endDate || null,
        eventData.startTime || null,
        eventData.endTime || null,
        eventData.timezone || 'Asia/Kolkata',
        eventData.venue,
        eventData.expectedParticipants !== undefined ? eventData.expectedParticipants : 0,
        eventData.status || 'draft',
        eventData.createdBy || null,
      ];

      const res = await tx.query(insertSql, values);
      const event = res.rows[0];

      // Create initial Revision 1
      const revSql = `
        INSERT INTO event_revisions (event_id, revision_number, event_data, change_summary, created_by)
        VALUES ($1, 1, $2, $3, $4)
        RETURNING *;
      `;
      const revRes = await tx.query(revSql, [
        event.id,
        JSON.stringify(eventData),
        'Initial event creation',
        eventData.createdBy || null,
      ]);
      const revision = revRes.rows[0];

      // If initial field sources are provided, track provenance
      if (Array.isArray(eventData.fieldSources) && eventData.fieldSources.length > 0) {
        for (const source of eventData.fieldSources) {
          await tx.query(
            `
            INSERT INTO event_field_sources (
              event_revision_id, field_path, value_text, value_json,
              source_type, verification_status, extraction_confidence, verified_by, verified_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
          `,
            [
              revision.id,
              source.fieldPath,
              source.valueText || null,
              source.valueJson ? JSON.stringify(source.valueJson) : null,
              source.sourceType || 'user_input',
              source.verificationStatus || 'unverified',
              source.extractionConfidence !== undefined ? source.extractionConfidence : null,
              source.verifiedBy || null,
              source.verifiedAt || null,
            ]
          );
        }
      }

      return { event, revision };
    };

    if (client) {
      return execute(client);
    }
    return withTransaction(execute);
  }

  /**
   * Retrieves an event by UUID.
   */
  static async findById(id, client = null) {
    const sql = `SELECT * FROM events WHERE id = $1;`;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Lists events with parameterized filtering, search, pagination, and deterministic sorting.
   */
  static async findWithPagination({ clubId = null, status = null, search = null, page = 1, limit = 10, allowedClubIds = null }, client = null) {
    const conditions = [];
    const params = [];

    if (clubId) {
      params.push(clubId);
      conditions.push(`club_id = $${params.length}`);
    } else if (allowedClubIds && allowedClubIds.length > 0) {
      params.push(allowedClubIds);
      conditions.push(`club_id = ANY($${params.length})`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`title ILIKE $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countSql = `SELECT COUNT(*)::int AS total FROM events ${whereClause};`;
    const runner = client ? client.query.bind(client) : query;
    const countRes = await runner(countSql, params);
    const total = countRes.rows[0]?.total || 0;

    // Get paginated records
    const offset = (page - 1) * limit;
    const queryParams = [...params, limit, offset];
    const dataSql = `
      SELECT * FROM events
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length};
    `;
    const dataRes = await runner(dataSql, queryParams);

    return {
      records: dataRes.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves events belonging to a specific club (enforces club data isolation).
   */
  static async findByClub(clubId, { limit = 50, offset = 0 } = {}, client = null) {
    const sql = `
      SELECT * FROM events
      WHERE club_id = $1
      ORDER BY start_date DESC, created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [clubId, limit, offset]);
    return res.rows;
  }

  /**
   * Updates an event using optimistic concurrency and revision management.
   * If expectedRevisionNumber is specified and does not match the locked record, throws ConflictError.
   * If no fields have changed, does not create an unnecessary revision.
   */
  static async updateWithRevision({
    eventId,
    updates,
    expectedRevisionNumber = null,
    userId = null,
    changeSummary = 'Event details updated',
    fieldSources = [],
  }, client = null) {
    const execute = async (tx) => {
      // 1. Acquire row lock on the event
      const lockRes = await tx.query(
        'SELECT * FROM events WHERE id = $1 FOR UPDATE;',
        [eventId]
      );

      if (lockRes.rows.length === 0) {
        throw new NotFoundError(`Event ${eventId} not found.`);
      }

      const currentEvent = lockRes.rows[0];

      // 2. Optimistic Concurrency check
      if (expectedRevisionNumber !== null && expectedRevisionNumber !== undefined) {
        if (Number(expectedRevisionNumber) !== Number(currentEvent.current_revision_number)) {
          throw new ConflictError(
            `Revision conflict: Expected revision ${expectedRevisionNumber}, but current revision is ${currentEvent.current_revision_number}.`,
            [
              {
                currentRevisionNumber: currentEvent.current_revision_number,
                expectedRevisionNumber: Number(expectedRevisionNumber),
              },
            ]
          );
        }
      }

      // 3. Determine if any fields actually changed
      const fieldsToCheck = [
        ['title', updates.title],
        ['category', updates.category],
        ['description', updates.description],
        ['objectives', updates.objectives],
        ['target_audience', updates.targetAudience],
        ['start_date', updates.startDate],
        ['end_date', updates.endDate],
        ['start_time', updates.startTime],
        ['end_time', updates.endTime],
        ['timezone', updates.timezone],
        ['venue', updates.venue],
        ['expected_participants', updates.expectedParticipants],
        ['status', updates.status],
      ];

      let hasChanges = false;
      const setClauses = [];
      const setValues = [];

      for (const [colName, newValue] of fieldsToCheck) {
        if (newValue !== undefined) {
          const currentVal = currentEvent[colName];
          // Check for actual difference
          const isDifferent =
            colName === 'start_date' || colName === 'end_date'
              ? currentVal ? new Date(currentVal).toISOString().split('T')[0] !== newValue : newValue !== null
              : String(currentVal ?? '') !== String(newValue ?? '');

          if (isDifferent) {
            hasChanges = true;
          }

          setValues.push(newValue);
          setClauses.push(`${colName} = $${setValues.length}`);
        }
      }

      // If no values changed, return existing state without creating a new revision
      if (!hasChanges) {
        const latestRevRes = await tx.query(
          'SELECT * FROM event_revisions WHERE event_id = $1 AND revision_number = $2;',
          [eventId, currentEvent.current_revision_number]
        );
        return {
          event: currentEvent,
          revision: latestRevRes.rows[0] || null,
          isNoOp: true,
        };
      }

      // 4. Increment revision number and update event
      const nextRev = Number(currentEvent.current_revision_number) + 1;
      setValues.push(nextRev);
      setClauses.push(`current_revision_number = $${setValues.length}`);
      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

      setValues.push(eventId);
      const updateSql = `
        UPDATE events
        SET ${setClauses.join(', ')}
        WHERE id = $${setValues.length}
        RETURNING *;
      `;

      const updateRes = await tx.query(updateSql, setValues);
      const updatedEvent = updateRes.rows[0];

      // 5. Create new revision snapshot
      const snapshotData = {
        id: updatedEvent.id,
        clubId: updatedEvent.club_id,
        title: updatedEvent.title,
        category: updatedEvent.category,
        description: updatedEvent.description,
        objectives: updatedEvent.objectives,
        targetAudience: updatedEvent.target_audience,
        startDate: updatedEvent.start_date,
        endDate: updatedEvent.end_date,
        startTime: updatedEvent.start_time,
        endTime: updatedEvent.end_time,
        timezone: updatedEvent.timezone,
        venue: updatedEvent.venue,
        expectedParticipants: updatedEvent.expected_participants,
        status: updatedEvent.status,
      };

      const revSql = `
        INSERT INTO event_revisions (event_id, revision_number, event_data, change_summary, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
      const revRes = await tx.query(revSql, [
        eventId,
        nextRev,
        JSON.stringify(snapshotData),
        changeSummary || `Updated to revision ${nextRev}`,
        userId || null,
      ]);
      const revision = revRes.rows[0];

      // 6. Record field provenance if provided
      if (Array.isArray(fieldSources) && fieldSources.length > 0) {
        for (const src of fieldSources) {
          await tx.query(
            `
            INSERT INTO event_field_sources (
              event_revision_id, field_path, value_text, value_json,
              source_type, verification_status, extraction_confidence, verified_by, verified_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
          `,
            [
              revision.id,
              src.fieldPath,
              src.valueText || null,
              src.valueJson ? JSON.stringify(src.valueJson) : null,
              src.sourceType || 'user_input',
              src.verificationStatus || 'unverified',
              src.extractionConfidence !== undefined ? src.extractionConfidence : null,
              src.verifiedBy || null,
              src.verifiedAt || null,
            ]
          );
        }
      }

      return {
        event: updatedEvent,
        revision,
        isNoOp: false,
      };
    };

    if (client) {
      return execute(client);
    }
    return withTransaction(execute);
  }

  /**
   * Creates a revision (alias for backward compatibility with existing tests).
   */
  static async createRevision({ eventId, eventData, changeSummary, userId, fieldSources = [] }, client = null) {
    const res = await this.updateWithRevision(
      {
        eventId,
        updates: eventData,
        userId,
        changeSummary,
        fieldSources,
      },
      client
    );
    return res.revision;
  }

  /**
   * Retrieves all revisions for an event.
   */
  static async getRevisions(eventId, client = null) {
    const sql = `
      SELECT id, event_id, revision_number, change_summary, created_by, created_at
      FROM event_revisions
      WHERE event_id = $1
      ORDER BY revision_number ASC;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [eventId]);
    return res.rows;
  }

  /**
   * Retrieves a specific historical revision by revision number.
   */
  static async getRevisionByNumber(eventId, revisionNumber, client = null) {
    const sql = `
      SELECT id, event_id, revision_number, event_data, change_summary, created_by, created_at
      FROM event_revisions
      WHERE event_id = $1 AND revision_number = $2;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [eventId, revisionNumber]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves field provenance entries for a specific revision.
   */
  static async getFieldSources(eventRevisionId, client = null) {
    const sql = `
      SELECT * FROM event_field_sources
      WHERE event_revision_id = $1
      ORDER BY created_at ASC;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [eventRevisionId]);
    return res.rows;
  }
}
