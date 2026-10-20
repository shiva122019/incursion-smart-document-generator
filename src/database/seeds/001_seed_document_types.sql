-- Seed Data: Five Initial Standard Document Types

INSERT INTO document_types (id, slug, display_name, description, is_active)
VALUES
    (
        '10000000-0000-0000-0000-000000000001',
        'event_proposal',
        'Event Proposal / Submission Form',
        'Comprehensive club event proposal including objectives, target audience, schedule, and proposed budget items.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000002',
        'permission_letter',
        'Department / Venue Permission Letter',
        'Formal permission letter addressed to Dean, HOD, or Venue In-Charge requesting auditorium, lab, or campus facility access.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000003',
        'bill_certificate',
        'Bill Certificate',
        'Official certificate validating verified bills, invoices, and advance settlements for club expenditures.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000004',
        'bill_summary',
        'Bill Summary',
        'Consolidated financial bill summary aggregating expense claims, payout totals, and net claims against sanctioned budgets.',
        true
    ),
    (
        '10000000-0000-0000-0000-000000000005',
        'prize_money_receipt',
        'Prize Money Receipt',
        'Individual recipient receipt acknowledging competitive prize money disbursement with position and payout validation.',
        true
    )
ON CONFLICT (slug) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;
