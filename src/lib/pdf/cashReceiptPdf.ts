import jsPDF from 'jspdf';
import { formatNumber } from '@/lib/format';

export interface CashReceiptData {
  receiptRef: string;
  schoolName: string;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  schoolLogoUrl: string | null;
  primaryColor: string;
  studentMatricule: string;
  studentName: string;
  className: string;
  invoiceReference: string;
  invoiceTitle: string;
  amountPaid: number;
  amountDue: number;
  remainingDue: number;
  paymentMethod: string;
  paymentDate: string;
  operator: string;
  academicYear: string;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces',
  check: 'Chèque',
  bank_transfer: 'Virement bancaire',
  mobile_money: 'Mobile Money',
  card: 'Carte bancaire',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method || '—';
}

export function generateCashReceiptPdf(d: CashReceiptData): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 16;
  const contentW = pageW - 2 * margin;

  const primaryRGB = hexToRgb(d.primaryColor || '#0F766E');
  const r = primaryRGB?.r ?? 15;
  const g = primaryRGB?.g ?? 118;
  const b = primaryRGB?.b ?? 110;

  // ── En-tête bande colorée ──
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageW, 34, 'F');
  doc.setTextColor(255, 255, 255);

  if (d.schoolLogoUrl) {
    try {
      doc.addImage(d.schoolLogoUrl, 'PNG', margin + 2, 5, 18, 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(d.schoolName.toUpperCase(), margin + 26, 13);
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(d.schoolName.toUpperCase(), margin, 13);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(d.schoolName.toUpperCase(), margin, 13);
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const contact = [d.schoolAddress, d.schoolPhone, d.schoolEmail].filter(Boolean).join(' · ');
  doc.text(contact, margin, 21, { maxWidth: contentW });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('REÇU DE CAISSE', pageW - margin, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`N° ${d.receiptRef}`, pageW - margin, 21, { align: 'right' });
  doc.setFontSize(7.5);
  doc.text(`Date : ${d.paymentDate}`, pageW - margin, 27, { align: 'right' });

  let y = 44;

  // ── Encadré élève / facture ──
  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentW, 30, 2, 2, 'FD');

  const rowY = y + 8;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Élève :', margin + 5, rowY);
  doc.setFont('helvetica', 'normal');
  doc.text(d.studentName, margin + 30, rowY);

  doc.setFont('helvetica', 'bold');
  doc.text('Matricule :', margin + 120, rowY);
  doc.setFont('helvetica', 'normal');
  doc.text(d.studentMatricule, margin + 142, rowY);

  doc.setFont('helvetica', 'bold');
  doc.text('Classe :', margin + 5, rowY + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(d.className || '—', margin + 30, rowY + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('Obtention :', margin + 5, rowY + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(d.paymentMethod, margin + 30, rowY + 14);

  doc.setFont('helvetica', 'bold');
  doc.text('Caisse :', margin + 120, rowY + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(d.operator || '—', margin + 142, rowY + 14);

  y += 42;

  // ── Détail de la facture ──
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(d.invoiceTitle, margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Facture N° ${d.invoiceReference} · Année scolaire ${d.academicYear}`, margin, y + 6);
  y += 14;

  // ── Tableau des montants ──
  const tableX = margin;
  const tableW = contentW;
  const rowH = 8;
  doc.setFillColor(r, g, b);
  doc.rect(tableX, y, tableW, rowH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Montant payé ce jour', tableX + 6, y + 5.5);
  doc.text(`${formatNumber(d.amountPaid)}`, tableX + tableW - 6, y + 5.5, { align: 'right' });
  y += rowH;

  const moneyRows: Array<[string, number]> = [
    ['Total facture', d.amountDue],
    ['Reste à recouvrer', d.remainingDue],
  ];
  doc.setFont('helvetica', 'normal');
  moneyRows.forEach(([label, val], i) => {
    const fill = i % 2 === 0;
    if (fill) {
      doc.setFillColor(248, 250, 252);
      doc.rect(tableX, y, tableW, rowH, 'F');
    }
    doc.setTextColor(30, 41, 59);
    doc.text(label, tableX + 6, y + 5.5);
    doc.text(`${formatNumber(val)}`, tableX + tableW - 6, y + 5.5, { align: 'right' });
    y += rowH;
  });

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(tableX, y, tableX + tableW, y);
  y += 12;

  // ── Mention ──
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  const mention = doc.splitTextToSize(
    'Merci de votre paiement. Ce reçu fait foi du règlement de la somme indiquée au titre des frais scolaires pour l’année académique en cours.',
    contentW
  );
  doc.text(mention, margin, y);
  y += mention.length * 4 + 10;

  // ── Signature / cachet ──
  const sigW = 64;
  const sigX = pageW - margin - sigW;
  const sigH = 34;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(sigX, y, sigW, sigH, 2, 2, 'S');
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('LE CAISSIER / L’ÉCONOME', sigX + sigW / 2, y + 8, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Signature et cachet', sigX + sigW / 2, y + 26, { align: 'center' });

  // ── Pied de page ──
  doc.setFillColor(r, g, b);
  doc.rect(0, 285, pageW, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    `${d.schoolName} · ${d.academicYear} · Reçu de caisse ${d.receiptRef}`,
    pageW / 2,
    292,
    { align: 'center' }
  );

  return doc;
}

export function downloadCashReceipt(data: CashReceiptData) {
  const doc = generateCashReceiptPdf(data);
  doc.save(`recu_caisse_${data.receiptRef.replace(/\s+/g, '_')}.pdf`);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}
