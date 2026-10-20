import { query } from '../connection.js';
import { encryptField, decryptField, maskAccountNumber } from '../../services/encryptionService.js';

export class FinancialRepository {
  // --- Proposed Budgets ---

  static async createBudgetItem({ eventId, description, quantity, unitPrice, otherCharges = 0, displayOrder = 0 }, client = null) {
    const sql = `
      INSERT INTO event_budget_items (event_id, description, quantity, unit_price, other_charges, display_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [eventId, description, quantity, unitPrice, otherCharges, displayOrder]);
    return res.rows[0];
  }

  static async getBudgetItemsByEvent(eventId, client = null) {
    const sql = `
      SELECT * FROM event_budget_items
      WHERE event_id = $1
      ORDER BY display_order ASC, created_at ASC;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [eventId]);
    return res.rows;
  }

  // --- Actual Expense Claims & Items ---

  static async createExpenseClaim({
    eventId,
    approvalNoteRef = null,
    purchaseOrderRef = null,
    purchaseOrderDate = null,
    headOfAccountCode = null,
    advanceAmount = 0,
    supplierName = null,
    supplierGstNumber = null,
    invoiceNumber = null,
    invoiceDate = null,
    status = 'draft',
    createdBy = null,
  }, client = null) {
    const sql = `
      INSERT INTO expense_claims (
        event_id, approval_note_ref, purchase_order_ref, purchase_order_date,
        head_of_account_code, advance_amount, supplier_name, supplier_gst_number,
        invoice_number, invoice_date, status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [
      eventId,
      approvalNoteRef,
      purchaseOrderRef,
      purchaseOrderDate,
      headOfAccountCode,
      advanceAmount,
      supplierName,
      supplierGstNumber,
      invoiceNumber,
      invoiceDate,
      status,
      createdBy,
    ]);
    return res.rows[0];
  }

  static async addExpenseItem({
    expenseClaimId,
    description,
    quantity,
    unitCost,
    taxAmount = 0,
    otherCharges = 0,
    displayOrder = 0,
  }, client = null) {
    const sql = `
      INSERT INTO expense_items (expense_claim_id, description, quantity, unit_cost, tax_amount, other_charges, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [expenseClaimId, description, quantity, unitCost, taxAmount, otherCharges, displayOrder]);
    return res.rows[0];
  }

  static async getExpenseClaimWithItems(claimId, client = null) {
    const runner = client ? client.query.bind(client) : query;
    const claimRes = await runner('SELECT * FROM expense_claims WHERE id = $1;', [claimId]);
    if (claimRes.rows.length === 0) return null;

    const claim = claimRes.rows[0];
    const itemsRes = await runner(
      'SELECT * FROM expense_items WHERE expense_claim_id = $1 ORDER BY display_order ASC, created_at ASC;',
      [claimId]
    );
    claim.items = itemsRes.rows;
    return claim;
  }

  // --- Payout Recipients & Sensitive Bank Details ---

  static async createRecipient({ clubId, name, rollNumber = null, course = null, semester = null, contactEmail = null, contactPhone = null }, client = null) {
    const sql = `
      INSERT INTO payout_recipients (club_id, name, roll_number, course, semester, contact_email, contact_phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [clubId, name, rollNumber, course, semester, contactEmail, contactPhone]);
    return res.rows[0];
  }

  static async addRecipientPaymentDetails({
    recipientId,
    bankName,
    accountHolderName,
    accountNumber,
    ifscCode,
    panNumber = null,
  }, client = null) {
    const encryptedAccount = encryptField(accountNumber);
    const encryptedIfsc = encryptField(ifscCode);
    const encryptedPan = panNumber ? encryptField(panNumber) : null;
    const maskedAccount = maskAccountNumber(accountNumber);

    const sql = `
      INSERT INTO recipient_payment_details (
        recipient_id, bank_name, account_holder_name,
        encrypted_account_number, encrypted_ifsc_code, encrypted_pan_number, masked_account_number
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (recipient_id) DO UPDATE SET
        bank_name = EXCLUDED.bank_name,
        account_holder_name = EXCLUDED.account_holder_name,
        encrypted_account_number = EXCLUDED.encrypted_account_number,
        encrypted_ifsc_code = EXCLUDED.encrypted_ifsc_code,
        encrypted_pan_number = EXCLUDED.encrypted_pan_number,
        masked_account_number = EXCLUDED.masked_account_number,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, recipient_id, bank_name, account_holder_name, masked_account_number, created_at, updated_at;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [
      recipientId,
      bankName,
      accountHolderName,
      encryptedAccount,
      encryptedIfsc,
      encryptedPan,
      maskedAccount,
    ]);
    return res.rows[0];
  }

  static async getRecipientPaymentDetails(recipientId, { decrypt = false } = {}, client = null) {
    const runner = client ? client.query.bind(client) : query;
    const sql = `SELECT * FROM recipient_payment_details WHERE recipient_id = $1;`;
    const res = await runner(sql, [recipientId]);
    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    if (decrypt) {
      return {
        id: row.id,
        recipientId: row.recipient_id,
        bankName: row.bank_name,
        accountHolderName: row.account_holder_name,
        accountNumber: decryptField(row.encrypted_account_number),
        ifscCode: decryptField(row.encrypted_ifsc_code),
        panNumber: row.encrypted_pan_number ? decryptField(row.encrypted_pan_number) : null,
        maskedAccountNumber: row.masked_account_number,
      };
    }

    return {
      id: row.id,
      recipientId: row.recipient_id,
      bankName: row.bank_name,
      accountHolderName: row.account_holder_name,
      maskedAccountNumber: row.masked_account_number,
    };
  }

  // --- Payouts ---

  static async createPayout({
    eventId,
    recipientId,
    payoutPurpose,
    competitionName = null,
    position = null,
    amount,
    currency = 'INR',
    status = 'pending',
    approvalRef = null,
    paymentRef = null,
    createdBy = null,
  }, client = null) {
    const sql = `
      INSERT INTO payouts (
        event_id, recipient_id, payout_purpose, competition_name, position,
        amount, currency, status, approval_ref, payment_ref, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [
      eventId,
      recipientId,
      payoutPurpose,
      competitionName,
      position,
      amount,
      currency,
      status,
      approvalRef,
      paymentRef,
      createdBy,
    ]);
    return res.rows[0];
  }

  static async getPayoutsByEvent(eventId, client = null) {
    const sql = `
      SELECT p.*, r.name as recipient_name, r.roll_number, r.course
      FROM payouts p
      JOIN payout_recipients r ON p.recipient_id = r.id
      WHERE p.event_id = $1
      ORDER BY p.created_at ASC;
    `;
    const runner = client ? client.query.bind(client) : query;
    const res = await runner(sql, [eventId]);
    return res.rows;
  }
}
