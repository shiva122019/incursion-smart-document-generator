/**
 * Service for deterministic financial calculations.
 * Avoids IEEE 754 floating-point inaccuracies by computing in integer cents/paise (scale = 2)
 * before returning standard fixed 2-decimal strings or BigInt-derived numbers.
 */

/**
 * Converts a decimal string or number to integer cents.
 * @param {string|number} amount
 * @returns {bigint}
 */
export function toCents(amount) {
  if (amount === null || amount === undefined || amount === '') {
    return 0n;
  }
  const clean = String(amount).trim();
  const sign = clean.startsWith('-') ? -1n : 1n;
  const absVal = clean.replace(/^[+-]/, '');
  const [intPart, fracPart = ''] = absVal.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);
  const cents = BigInt(intPart || '0') * 100n + BigInt(paddedFrac);
  return sign * cents;
}

/**
 * Converts integer cents back to a fixed 2-decimal string.
 * @param {bigint} cents
 * @returns {string} e.g. "1250.50"
 */
export function toDecimalString(cents) {
  const isNegative = cents < 0n;
  const absCents = isNegative ? -cents : cents;
  const intPart = absCents / 100n;
  const fracPart = absCents % 100n;
  const paddedFrac = fracPart.toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${intPart.toString()}.${paddedFrac}`;
}

/**
 * Calculates total for a single proposed budget item.
 * Total = (quantity * unit_price) + other_charges
 * @param {{ quantity: number|string, unit_price: number|string, other_charges?: number|string }} item
 * @returns {{ itemTotal: string, cents: bigint }}
 */
export function calculateBudgetItemTotal(item) {
  const qty = parseFloat(item.quantity || 0);
  const unitPriceCents = toCents(item.unit_price);
  const otherChargesCents = toCents(item.other_charges || 0);

  // Multiply unit price cents by quantity, then round appropriately
  const baseCents = BigInt(Math.round(Number(unitPriceCents) * qty));
  const totalCents = baseCents + otherChargesCents;

  return {
    itemTotal: toDecimalString(totalCents),
    cents: totalCents,
  };
}

/**
 * Calculates grand total for a proposed event budget.
 * @param {Array<{ quantity: number|string, unit_price: number|string, other_charges?: number|string }>} items
 * @returns {{ grandTotal: string, cents: bigint, itemCount: number }}
 */
export function calculateProposedBudgetTotal(items = []) {
  let totalCents = 0n;
  for (const item of items) {
    const { cents } = calculateBudgetItemTotal(item);
    totalCents += cents;
  }
  return {
    grandTotal: toDecimalString(totalCents),
    cents: totalCents,
    itemCount: items.length,
  };
}

/**
 * Calculates total for an expense item in an actual expense claim.
 * Total = (quantity * unit_cost) + tax_amount + other_charges
 * @param {{ quantity: number|string, unit_cost: number|string, tax_amount?: number|string, other_charges?: number|string }} item
 * @returns {{ itemTotal: string, cents: bigint }}
 */
export function calculateExpenseItemTotal(item) {
  const qty = parseFloat(item.quantity || 0);
  const unitCostCents = toCents(item.unit_cost);
  const taxCents = toCents(item.tax_amount || 0);
  const otherCents = toCents(item.other_charges || 0);

  const baseCents = BigInt(Math.round(Number(unitCostCents) * qty));
  const totalCents = baseCents + taxCents + otherCents;

  return {
    itemTotal: toDecimalString(totalCents),
    cents: totalCents,
  };
}

/**
 * Calculates total for an expense claim from its items.
 * @param {Array<any>} items
 * @param {number|string} [advanceAmount=0]
 * @returns {{ itemsTotal: string, advanceAmount: string, netPayable: string }}
 */
export function calculateExpenseClaimTotal(items = [], advanceAmount = 0) {
  let totalCents = 0n;
  for (const item of items) {
    const { cents } = calculateExpenseItemTotal(item);
    totalCents += cents;
  }
  const advanceCents = toCents(advanceAmount);
  const netCents = totalCents - advanceCents;

  return {
    itemsTotal: toDecimalString(totalCents),
    advanceAmount: toDecimalString(advanceCents),
    netPayable: toDecimalString(netCents),
  };
}

/**
 * Derives the consolidated Bill Summary grand total from applicable expense claims and payouts.
 * Grand Total = Total Actual Expenses + Total Approved Payouts
 * Net Disbursable = Grand Total - Total Advances
 *
 * @param {Object} params
 * @param {Array<{ items: Array<any>, advance_amount?: number|string }>} params.expenseClaims
 * @param {Array<{ amount: number|string, status?: string }>} params.payouts
 * @returns {{ totalExpenses: string, totalPayouts: string, totalAdvances: string, grandTotal: string, netPayable: string }}
 */
export function calculateBillSummaryTotals({ expenseClaims = [], payouts = [] }) {
  let expensesCents = 0n;
  let advancesCents = 0n;

  for (const claim of expenseClaims) {
    let claimItemCents = 0n;
    const items = claim.items || [];
    for (const item of items) {
      claimItemCents += calculateExpenseItemTotal(item).cents;
    }
    expensesCents += claimItemCents;
    advancesCents += toCents(claim.advance_amount || 0);
  }

  let payoutsCents = 0n;
  for (const payout of payouts) {
    // Only count approved / processed / pending payouts, avoid cancelled
    if (payout.status !== 'cancelled') {
      payoutsCents += toCents(payout.amount);
    }
  }

  const grandTotalCents = expensesCents + payoutsCents;
  const netPayableCents = grandTotalCents - advancesCents;

  return {
    totalExpenses: toDecimalString(expensesCents),
    totalPayouts: toDecimalString(payoutsCents),
    totalAdvances: toDecimalString(advancesCents),
    grandTotal: toDecimalString(grandTotalCents),
    netPayable: toDecimalString(netPayableCents),
  };
}
