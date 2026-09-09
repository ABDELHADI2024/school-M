import ExcelJS from 'exceljs';

export interface PaymentExcelRow {
  invoice_reference: string;
  student_matricule: string;
  student_name: string;
  amount_paid: number | null;
  payment_method: string;
  payment_date: string;
  note: string;
  isValid: boolean;
  error?: string;
}

// Génère un canevas de paiements pré-rempli avec les factures en attente
export async function generatePaymentTemplate(
  schoolName: string,
  invoices: {
    id: string;
    student_matricule: string;
    student_name: string;
    title: string;
    amount_due: number;
    amount_paid: number;
    status: string;
  }[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Encaissements');

  // En-tête
  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${schoolName.toUpperCase()} - CANEVAS D'ENCAISSEMENTS`;
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  // Légende
  worksheet.mergeCells('A2:G2');
  const legendCell = worksheet.getCell('A2');
  legendCell.value = 'Modes de règlement : espèces, virement, chèque, carte';
  legendCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
  legendCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Colonnes
  worksheet.columns = [
    { header: 'Réf. Facture', key: 'invoice_ref', width: 22 },
    { header: 'Matricule', key: 'matricule', width: 20 },
    { header: 'Élève', key: 'student_name', width: 28 },
    { header: 'Montant dû', key: 'amount_due', width: 16 },
    { header: 'Déjà payé', key: 'amount_paid', width: 16 },
    { header: 'Reste à payer', key: 'remaining', width: 16 },
    { header: 'Solde', key: 'status', width: 14 },
  ];

  const headerRow = worksheet.getRow(3);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  invoices.forEach((inv) => {
    worksheet.addRow({
      invoice_ref: inv.id.slice(0, 8),
      matricule: inv.student_matricule,
      student_name: inv.student_name,
      amount_due: inv.amount_due,
      amount_paid: inv.amount_paid,
      remaining: inv.amount_due - inv.amount_paid,
      status: inv.status,
    });
  });

  // Feuille 2 : Saisie de paiement
  const ws2 = workbook.addWorksheet('Saisie Paiements');

  ws2.mergeCells('A1:F1');
  const t2 = ws2.getCell('A1');
  t2.value = 'SAISIE DES PAIEMENTS — Remplissez les colonnes ci-dessous';
  t2.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  t2.alignment = { vertical: 'middle', horizontal: 'center' };
  ws2.getRow(1).height = 28;

  ws2.columns = [
    { header: 'Réf. Facture *', key: 'invoice_ref', width: 22 },
    { header: 'Matricule *', key: 'matricule', width: 20 },
    { header: 'Nom Élève', key: 'student_name', width: 28 },
    { header: 'Montant payé *', key: 'amount_paid', width: 18 },
    { header: 'Mode (espèces/virement/chèque/carte)', key: 'payment_method', width: 30 },
    { header: 'Date (YYYY-MM-DD)', key: 'payment_date', width: 20 },
    { header: 'Note', key: 'note', width: 25 },
  ];

  const h2 = ws2.getRow(2);
  h2.height = 24;
  h2.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  invoices.forEach((inv) => {
    ws2.addRow({
      invoice_ref: inv.id.slice(0, 8),
      matricule: inv.student_matricule,
      student_name: inv.student_name,
      amount_paid: '',
      payment_method: 'espèces',
      payment_date: new Date().toISOString().split('T')[0],
      note: '',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `canevas_encaissements_${schoolName.toLowerCase().replace(/\s+/g, '_')}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Export de l'état financier global
export async function generateFinanceReport(
  schoolName: string,
  rows: {
    matricule: string;
    student_name: string;
    parent_phone: string;
    total_due: number;
    total_paid: number;
    remaining: number;
    status: string;
  }[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('État Financier');

  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${schoolName.toUpperCase()} - ÉTAT FINANCIER GLOBAL`;
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  worksheet.columns = [
    { header: 'Matricule', key: 'matricule', width: 20 },
    { header: 'Élève', key: 'student_name', width: 28 },
    { header: 'Téléphone Parent', key: 'parent_phone', width: 20 },
    { header: 'Total dû', key: 'total_due', width: 16 },
    { header: 'Total payé', key: 'total_paid', width: 16 },
    { header: 'Reste à payer', key: 'remaining', width: 16 },
    { header: 'Statut', key: 'status', width: 14 },
  ];

  const headerRow = worksheet.getRow(2);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Colorer les lignes en retard
  rows.forEach((r) => {
    const row = worksheet.addRow(r);
    if (r.status === 'overdue') {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `etat_financier_${schoolName.toLowerCase().replace(/\s+/g, '_')}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Export des impayés avec contacts parents pour relance
export async function generateUnpaidReport(
  schoolName: string,
  rows: {
    matricule: string;
    student_name: string;
    parent_name: string;
    parent_phone: string;
    title: string;
    amount_due: number;
    amount_paid: number;
    remaining: number;
    due_date: string;
  }[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Impayés');

  worksheet.mergeCells('A1:H1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${schoolName.toUpperCase()} - LISTE DES IMPAYÉS POUR RELANCE`;
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  worksheet.columns = [
    { header: 'Matricule', key: 'matricule', width: 20 },
    { header: 'Élève', key: 'student_name', width: 28 },
    { header: 'Responsable', key: 'parent_name', width: 24 },
    { header: 'Téléphone', key: 'parent_phone', width: 18 },
    { header: 'Facture', key: 'title', width: 24 },
    { header: 'Montant dû', key: 'amount_due', width: 14 },
    { header: 'Reste', key: 'remaining', width: 14 },
    { header: 'Échéance', key: 'due_date', width: 14 },
  ];

  const headerRow = worksheet.getRow(2);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  rows.forEach((r) => {
    const row = worksheet.addRow(r);
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `impayes_relance_${schoolName.toLowerCase().replace(/\s+/g, '_')}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Parseur pour importer des paiements depuis Excel
export async function parsePaymentExcel(file: File): Promise<PaymentExcelRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  // Chercher la feuille "Saisie Paiements" ou la première
  const targetSheet = workbook.worksheets.find((ws) =>
    ws.name.toLowerCase().includes('paiement') || ws.name.toLowerCase().includes('reglement')
  ) || worksheet;

  const rows: PaymentExcelRow[] = [];

  // Détection de la ligne d'en-tête
  let headerRowIdx = -1;
  const colMap: Record<string, number> = {};

  targetSheet.eachRow((row, rowNumber) => {
    if (headerRowIdx !== -1) return;
    const rowTexts = row.values as unknown[];
    if (!Array.isArray(rowTexts)) return;

    const lineStr = rowTexts.map(v => String(v ?? '').toLowerCase()).join(' ');
    if (
      lineStr.includes('facture') ||
      lineStr.includes('matricule') ||
      lineStr.includes('montant') ||
      lineStr.includes('paiement')
    ) {
      headerRowIdx = rowNumber;
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value ?? '').toLowerCase().trim();
        colMap[val] = colNumber;
      });
    }
  });

  if (headerRowIdx === -1) headerRowIdx = 1;

  targetSheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIdx) return;

    let invoiceRef = '';
    let matricule = '';
    let studentName = '';
    let rawAmount = '';
    let paymentMethod = 'cash';
    let paymentDate = new Date().toISOString().split('T')[0];
    let note = '';

    for (const [key, colIdx] of Object.entries(colMap)) {
      const val = String(row.getCell(colIdx).value ?? '').trim();
      if (key.includes('facture') || key.includes('ref')) invoiceRef = val;
      else if (key.includes('matricule')) matricule = val;
      else if (key.includes('nom') || key.includes('eleve') || key.includes('etudiant') || key.includes('prenom')) studentName = val;
      else if (key.includes('montant') && key.includes('pay')) rawAmount = val;
      else if (key.includes('mode') || key.includes('method')) paymentMethod = val;
      else if (key.includes('date')) paymentDate = val;
      else if (key.includes('note') || key.includes('remarque')) note = val;
    }

    // Fallback par index
    if (!invoiceRef) invoiceRef = String(row.getCell(1).value ?? '').trim();
    if (!matricule) matricule = String(row.getCell(2).value ?? '').trim();
    if (!studentName) studentName = String(row.getCell(3).value ?? '').trim();
    if (!rawAmount) rawAmount = String(row.getCell(4).value ?? '').trim();
    if (paymentMethod === 'cash') {
      const m = String(row.getCell(5).value ?? '').trim();
      if (m) paymentMethod = m;
    }
    if (paymentDate === new Date().toISOString().split('T')[0]) {
      const d = String(row.getCell(6).value ?? '').trim();
      if (d) paymentDate = d;
    }

    if (!matricule && !studentName && !invoiceRef) return;

    let amountPaid: number | null = null;
    let isValid = true;
    let error: string | undefined;

    if (rawAmount) {
      const num = parseFloat(rawAmount.replace(',', '.'));
      if (isNaN(num) || num <= 0) {
        isValid = false;
        error = 'Montant invalide';
      } else {
        amountPaid = num;
      }
    } else {
      isValid = false;
      error = 'Montant manquant';
    }

    // Normaliser le mode de paiement
    const methodMap: Record<string, string> = {
      'especes': 'cash', 'espèces': 'cash', 'cash': 'cash', 'liquide': 'cash',
      'virement': 'bank_transfer', 'banque': 'bank_transfer', 'bank_transfer': 'bank_transfer',
      'cheque': 'check', 'chèque': 'check', 'check': 'check',
      'carte': 'card', 'cb': 'card', 'card': 'card', 'mobile': 'card',
    };
    const normalizedMethod = methodMap[paymentMethod.toLowerCase()] || 'cash';

    rows.push({
      invoice_reference: invoiceRef,
      student_matricule: matricule,
      student_name: studentName,
      amount_paid: amountPaid,
      payment_method: normalizedMethod,
      payment_date: paymentDate,
      note,
      isValid,
      error,
    });
  });

  return rows;
}
