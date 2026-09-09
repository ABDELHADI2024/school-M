export type InvoiceStatus = 'paid' | 'partial' | 'overdue' | 'pending';

export function computeInvoiceStatus(
  amountDue: number,
  amountPaid: number,
  dueDate: string | null
): InvoiceStatus {
  if (amountPaid >= amountDue && amountDue > 0) return 'paid';
  if (amountPaid > 0) return 'partial';
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate && dueDate < today) return 'overdue';
  return 'pending';
}

export function unifyStatus(s: string | null | undefined): InvoiceStatus {
  if (s === 'paid' || s === 'partial' || s === 'overdue') return s;
  return 'pending';
}

export function nextInvoiceReference(
  year: string,
  existingCount: number
): string {
  return `FAC-${year}-${String(existingCount + 1).padStart(4, '0')}`;
}

export function receiptReference(
  invoiceReference: string,
  paymentCountForInvoice: number
): string {
  return `${invoiceReference}-R${String(paymentCountForInvoice + 1).padStart(2, '0')}`;
}
