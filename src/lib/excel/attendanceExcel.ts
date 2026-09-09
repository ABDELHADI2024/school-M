import ExcelJS from 'exceljs';

export interface AttendanceExcelRow {
  matricule: string;
  student_name: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  note: string;
  isValid: boolean;
  error?: string;
}

// Génère le canevas vierge de présence pour une classe et une date données
export async function generateAttendanceTemplate(
  schoolName: string,
  className: string,
  date: string,
  students: { matricule: string; first_name: string; last_name: string }[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Présences');

  // En-tête informatif
  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${schoolName.toUpperCase()} - ÉMARGEMENT : ${className} - ${date}`;
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  // Légende des statuts
  worksheet.mergeCells('A2:E2');
  const legendCell = worksheet.getCell('A2');
  legendCell.value = 'Statuts : P = Présent | A = Absent | R = Retard | J = Justifié';
  legendCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
  legendCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 20;

  // Colonnes
  worksheet.columns = [
    { header: 'Matricule', key: 'matricule', width: 20 },
    { header: 'Nom & Prénom', key: 'student_name', width: 30 },
    { header: 'Statut (P/A/R/J) *', key: 'status', width: 20 },
    { header: 'Note / Remarque', key: 'note', width: 35 },
  ];

  const headerRow = worksheet.getRow(3);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Tous les élèves marqués présents par défaut
  students.forEach((s) => {
    worksheet.addRow({
      matricule: s.matricule,
      student_name: `${s.last_name} ${s.first_name}`,
      status: 'P',
      note: '',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `emargement_${className}_${date}.xlsx`.toLowerCase().replace(/\s+/g, '_');
  a.click();
  window.URL.revokeObjectURL(url);
}

// Génère un bilan mensuel des absences par classe pour export
export async function generateAttendanceReport(
  schoolName: string,
  className: string,
  month: string,
  rows: {
    matricule: string;
    student_name: string;
    total_presences: number;
    total_absences: number;
    total_lates: number;
    total_excused: number;
  }[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Bilan Absences');

  // En-tête
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${schoolName.toUpperCase()} - BILAN D'ABSENTÉISME : ${className} - ${month}`;
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  worksheet.columns = [
    { header: 'Matricule', key: 'matricule', width: 20 },
    { header: 'Nom & Prénom', key: 'student_name', width: 30 },
    { header: 'Présences', key: 'total_presences', width: 14 },
    { header: 'Absences', key: 'total_absences', width: 14 },
    { header: 'Retards', key: 'total_lates', width: 14 },
    { header: 'Justifiés', key: 'total_excused', width: 14 },
  ];

  const headerRow = worksheet.getRow(2);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  rows.forEach((r) => {
    worksheet.addRow(r);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bilan_absences_${className}_${month}.xlsx`.toLowerCase().replace(/\s+/g, '_');
  a.click();
  window.URL.revokeObjectURL(url);
}

// Parse une feuille d'émargement importée
export async function parseAttendanceExcel(file: File): Promise<AttendanceExcelRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: AttendanceExcelRow[] = [];

  // Détection automatique de la ligne d'en-tête
  let headerRowIdx = -1;
  const colMap: Record<string, number> = {};

  worksheet.eachRow((row, rowNumber) => {
    if (headerRowIdx !== -1) return;
    const rowTexts = row.values as unknown[];
    if (!Array.isArray(rowTexts)) return;

    const lineStr = rowTexts.map(v => String(v ?? '').toLowerCase()).join(' ');
    if (
      lineStr.includes('matricule') ||
      lineStr.includes('statut') ||
      lineStr.includes('prenom') ||
      lineStr.includes('nom')
    ) {
      headerRowIdx = rowNumber;
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value ?? '').toLowerCase().trim();
        colMap[val] = colNumber;
      });
    }
  });

  if (headerRowIdx === -1) headerRowIdx = 1;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIdx) return;

    let matricule = '';
    let studentName = '';
    let rawStatus = '';
    let note = '';

    for (const [key, colIdx] of Object.entries(colMap)) {
      const val = String(row.getCell(colIdx).value ?? '').trim();
      if (key.includes('matricule')) matricule = val;
      else if (key.includes('nom') || key.includes('prenom') || key.includes('etudiant') || key.includes('eleve')) studentName = val;
      else if (key.includes('statut') || key.includes('status') || key.includes('presence')) rawStatus = val;
      else if (key.includes('note') || key.includes('remarque') || key.includes('commentaire')) note = val;
    }

    // Fallback: colonnes par index
    if (!matricule) matricule = String(row.getCell(1).value ?? '').trim();
    if (!studentName) studentName = String(row.getCell(2).value ?? '').trim();
    if (!rawStatus) rawStatus = String(row.getCell(3).value ?? '').trim();
    if (!note) note = String(row.getCell(4).value ?? '').trim();

    if (!matricule && !studentName) return;

    // Convertir le statut: P/A/R/J → present/absent/late/excused
    let status: 'present' | 'absent' | 'late' | 'excused' = 'present';
    const s = rawStatus.toLowerCase().trim();
    if (s === 'a' || s.startsWith('abs') || s === '0') status = 'absent';
    else if (s === 'r' || s.startsWith('ret') || s.startsWith('retard')) status = 'late';
    else if (s === 'j' || s.startsWith('jus') || s.startsWith('justifie')) status = 'excused';
    else if (s === 'p' || s.startsWith('pre') || s.startsWith('present') || s === '1') status = 'present';
    else if (s !== '') {
      rows.push({
        matricule,
        student_name: studentName,
        status: 'present',
        note,
        isValid: false,
        error: `Statut inconnu: "${rawStatus}"`,
      });
      return;
    }

    rows.push({
      matricule,
      student_name: studentName,
      status,
      note,
      isValid: true,
    });
  });

  return rows;
}
