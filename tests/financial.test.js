import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDatabase, teardownTestDatabase } from './testHelper.js';
import { UsersRepository } from '../src/database/repositories/users.repository.js';
import { ClubsRepository } from '../src/database/repositories/clubs.repository.js';
import { EventsRepository } from '../src/database/repositories/events.repository.js';
import { FinancialRepository } from '../src/database/repositories/financial.repository.js';
import {
  calculateBudgetItemTotal,
  calculateProposedBudgetTotal,
  calculateExpenseItemTotal,
  calculateExpenseClaimTotal,
  calculateBillSummaryTotals,
} from '../src/services/financialCalculationService.js';
import { encryptField, decryptField, maskAccountNumber } from '../src/services/encryptionService.js';

describe('Financial Records, Calculations, and Payment Encryption Tests', () => {
  let testClub;
  let testUser;
  let testEvent;

  before(async () => {
    await setupTestDatabase();

    testUser = await UsersRepository.create({
      name: 'Finance Officer',
      email: 'finance@svnit.edu',
      passwordHash: 'finance_hash',
    });

    testClub = await ClubsRepository.create({
      name: 'ACM SVNIT',
      code: 'acm-svnit',
      institutionName: 'SVNIT',
      officialContactEmail: 'acm@svnit.edu',
    });

    const res = await EventsRepository.create({
      clubId: testClub.id,
      title: 'Annual Coding Championship',
      category: 'Competition',
      startDate: '2026-12-05',
      venue: 'Main Seminar Hall',
      expectedParticipants: 200,
      createdBy: testUser.id,
    });
    testEvent = res.event;
  });

  after(async () => {
    await teardownTestDatabase();
  });

  it('should accurately calculate proposed budget totals with exact decimal arithmetic', async () => {
    // 3 items with specific prices
    const item1 = await FinancialRepository.createBudgetItem({
      eventId: testEvent.id,
      description: 'Speaker Honorarium (3 sessions)',
      quantity: 3,
      unitPrice: 4000.5,
      otherCharges: 0,
      displayOrder: 1,
    });

    const item2 = await FinancialRepository.createBudgetItem({
      eventId: testEvent.id,
      description: 'Kits and Badges',
      quantity: 150,
      unitPrice: 85.25,
      otherCharges: 500.5,
      displayOrder: 2,
    });

    // Check item totals
    const calc1 = calculateBudgetItemTotal(item1);
    // 3 * 4000.50 = 12001.50
    assert.equal(calc1.itemTotal, '12001.50');

    const calc2 = calculateBudgetItemTotal(item2);
    // 150 * 85.25 = 12787.50 + 500.50 = 13288.00
    assert.equal(calc2.itemTotal, '13288.00');

    // Total proposed budget
    const budgetTotal = calculateProposedBudgetTotal([item1, item2]);
    // 12001.50 + 13288.00 = 25289.50
    assert.equal(budgetTotal.grandTotal, '25289.50');
    assert.equal(budgetTotal.itemCount, 2);
  });

  it('should calculate actual expense claim totals and net payable after advance deduction', async () => {
    const claim = await FinancialRepository.createExpenseClaim({
      eventId: testEvent.id,
      supplierName: 'Stationery & Printing Depot',
      supplierGstNumber: '24AAACG1234F1Z5',
      advanceAmount: 5000.0,
      status: 'submitted',
      createdBy: testUser.id,
    });

    const expense1 = await FinancialRepository.addExpenseItem({
      expenseClaimId: claim.id,
      description: 'Event Certificates',
      quantity: 200,
      unitCost: 25.5,
      taxAmount: 450.0,
      otherCharges: 50.0,
      displayOrder: 1,
    });

    // (200 * 25.50) + 450.00 + 50.00 = 5100.00 + 500.00 = 5600.00
    const calcExpense1 = calculateExpenseItemTotal(expense1);
    assert.equal(calcExpense1.itemTotal, '5600.00');

    const claimSummary = calculateExpenseClaimTotal([expense1], claim.advance_amount);
    assert.equal(claimSummary.itemsTotal, '5600.00');
    assert.equal(claimSummary.advanceAmount, '5000.00');
    assert.equal(claimSummary.netPayable, '600.00');
  });

  it('should derive Bill Summary grand totals from expense claims and approved payouts without rounding errors', async () => {
    // Expense Claims total = 5600.00 with 5000.00 advance
    const expenseClaims = [
      {
        advance_amount: '5000.00',
        items: [
          { quantity: 200, unit_cost: 25.5, tax_amount: 450.0, other_charges: 50.0 }, // 5600.00
        ],
      },
      {
        advance_amount: '0.00',
        items: [
          { quantity: 1, unit_cost: 3500.0, tax_amount: 630.0, other_charges: 0 }, // 4130.00
        ],
      },
    ];

    // Payouts: 1st Prize 5000.00, 2nd Prize 3000.00, and a cancelled payout 1000.00
    const payouts = [
      { amount: '5000.00', status: 'approved' },
      { amount: '3000.00', status: 'approved' },
      { amount: '1000.00', status: 'cancelled' }, // Should be excluded from grand total
    ];

    const billSummary = calculateBillSummaryTotals({ expenseClaims, payouts });

    // Total Expenses = 5600.00 + 4130.00 = 9730.00
    assert.equal(billSummary.totalExpenses, '9730.00');
    // Total Payouts = 5000.00 + 3000.00 = 8000.00
    assert.equal(billSummary.totalPayouts, '8000.00');
    // Total Advances = 5000.00
    assert.equal(billSummary.totalAdvances, '5000.00');
    // Grand Total = 9730.00 + 8000.00 = 17730.00
    assert.equal(billSummary.grandTotal, '17730.00');
    // Net Payable = 17730.00 - 5000.00 = 12730.00
    assert.equal(billSummary.netPayable, '12730.00');
  });

  it('should encrypt and decrypt sensitive bank details using AES-256-GCM and provide masked views', async () => {
    const rawAccountNumber = '1122334455667788';
    const rawIfsc = 'SBIN0003320';
    const rawPan = 'ABCDE1234F';

    // Test encryption service directly
    const encrypted = encryptField(rawAccountNumber);
    assert.notEqual(encrypted, rawAccountNumber);
    const decrypted = decryptField(encrypted);
    assert.equal(decrypted, rawAccountNumber);

    const masked = maskAccountNumber(rawAccountNumber);
    assert.equal(masked, 'XXXX-XXXX-7788');

    // Create recipient and store encrypted details in database
    const recipient = await FinancialRepository.createRecipient({
      clubId: testClub.id,
      name: 'Rohan Verma',
      rollNumber: 'U23CS099',
      course: 'B.Tech CSE',
    });

    await FinancialRepository.addRecipientPaymentDetails({
      recipientId: recipient.id,
      bankName: 'State Bank of India',
      accountHolderName: 'Rohan Verma',
      accountNumber: rawAccountNumber,
      ifscCode: rawIfsc,
      panNumber: rawPan,
    });

    // Fetch masked view (safe for general display / logs)
    const safeView = await FinancialRepository.getRecipientPaymentDetails(recipient.id, { decrypt: false });
    assert.equal(safeView.maskedAccountNumber, 'XXXX-XXXX-7788');
    assert.equal(safeView.accountNumber, undefined);

    // Fetch decrypted view (authorized finance officer workflow)
    const decryptedView = await FinancialRepository.getRecipientPaymentDetails(recipient.id, { decrypt: true });
    assert.equal(decryptedView.accountNumber, rawAccountNumber);
    assert.equal(decryptedView.ifscCode, rawIfsc);
    assert.equal(decryptedView.panNumber, rawPan);
  });
});
