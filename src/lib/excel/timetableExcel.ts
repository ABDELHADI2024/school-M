import ExcelJS from 'exceljs';

export interface TimetableSlotExcelRow {
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  class_name: string;
  subject_name: string;
  teacher_name: string;
  room_name: string;
  isValid: boolean;
  error?: string;
}

const DAY_NAMES = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAY_MAP: Record<string, number> = {
  lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

// Génère un canevas de planning hebdomadaire
export async function generateTimetableTemplate(
  schoolName: string,
  className: string,
  days: string[],
  timeSlots: string[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Emploi du temps');

  // En-tête
  worksheet.mergeCells(`A1:${String.fromCharCode(65 + days.length)}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${schoolName.toUpperCase()} — EMPLOI DU TEMPS : ${className}`;
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  // Légende
  worksheet.mergeCells(`A2:${String.fromCharCode(65 + days.length)}2`);
  const legendCell = worksheet.getCell('A2');
  legendCell.value = 'Remplissez chaque cellule avec : Matière / Professeur / Salle (ex: Mathématiques / M. Dupont / Salle 101)';
  legendCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
  legendCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Colonnes : Heure + jours
  worksheet.columns = [
    { header: 'Heure', key: 'time', width: 14 },
    ...days.map((d) => ({ header: d, key: d, width: 28 })),
  ];

  const headerRow = worksheet.getRow(3);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Lignes horaires
  timeSlots.forEach((slot) => {
    worksheet.addRow({ time: slot });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `emploi_du_temps_${className.toLowerCase().replace(/\s+/g, '_')}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Export de l'emploi du temps formaté
export async function exportTimetable(
  schoolName: string,
  viewLabel: string,
  days: string[],
  timeSlots: string[],
  slots: {
    day_of_week: number;
    start_time: string;
    end_time: string;
    subject_name: string;
    teacher_name: string;
    room_name: string;
    class_name: string;
  }[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Emploi du temps');

  // En-tête
  worksheet.mergeCells(`A1:${String.fromCharCode(65 + days.length)}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${schoolName.toUpperCase()} — ${viewLabel}`;
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  worksheet.columns = [
    { header: 'Heure', key: 'time', width: 14 },
    ...days.map((d) => ({ header: d, key: d, width: 30 })),
  ];

  const headerRow = worksheet.getRow(2);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Construire la grille
  const grid: Record<string, Record<number, string[]>> = {};
  timeSlots.forEach((ts) => {
    grid[ts] = {};
    for (let d = 1; d <= days.length; d++) grid[ts][d] = [];
  });

  slots.forEach((s) => {
    const slotKey = timeSlots.find((ts) => {
      const [h, m] = ts.split(':').map(Number);
      const [sh, sm] = s.start_time.split(':').map(Number);
      return h === sh && m === sm;
    });
    if (slotKey && grid[slotKey]?.[s.day_of_week]) {
      grid[slotKey][s.day_of_week].push(`${s.subject_name}\n${s.teacher_name}\n${s.room_name}`);
    }
  });

  timeSlots.forEach((ts) => {
    const rowData: Record<string, string> = { time: ts };
    for (let d = 1; d <= days.length; d++) {
      rowData[days[d - 1]] = grid[ts][d]?.join('\n---\n') || '';
    }
    worksheet.addRow(rowData);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `emploi_du_temps_${viewLabel.toLowerCase().replace(/\s+/g, '_')}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Parseur pour importer un emploi du temps depuis Excel
export async function parseTimetableExcel(file: File): Promise<TimetableSlotExcelRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: TimetableSlotExcelRow[] = [];

  // Détection de la ligne d'en-tête
  let headerRowIdx = -1;

  worksheet.eachRow((row, rowNumber) => {
    if (headerRowIdx !== -1) return;
    const rowTexts = row.values as unknown[];
    if (!Array.isArray(rowTexts)) return;

    const lineStr = rowTexts.map(v => String(v ?? '').toLowerCase()).join(' ');
    if (lineStr.includes('heure') || lineStr.includes('lundi') || lineStr.includes('cours')) {
      headerRowIdx = rowNumber;
    }
  });

  if (headerRowIdx === -1) headerRowIdx = 1;

  // Les en-têtes colonnes = jours (col 2+), col 1 = heure
  const headerRow = worksheet.getRow(headerRowIdx);
  const dayColumns: { col: number; dayOfWeek: number }[] = [];

  headerRow.eachCell((cell, colNumber) => {
    if (colNumber === 1) return; // Heure
    const val = String(cell.value ?? '').toLowerCase().trim();
    if (DAY_MAP[val]) {
      dayColumns.push({ col: colNumber, dayOfWeek: DAY_MAP[val] });
    }
  });

  // Parser chaque ligne horaire
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIdx) return;

    const timeCell = String(row.getCell(1).value ?? '').trim();
    if (!timeCell) return;

    // Extraire l'heure de début
    const timeMatch = timeCell.match(/(\d{1,2})[:\s]?(\d{2})/);
    if (!timeMatch) return;
    const startTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;

    dayColumns.forEach(({ col, dayOfWeek }) => {
      const cellValue = String(row.getCell(col).value ?? '').trim();
      if (!cellValue || cellValue === '-' || cellValue === '/') return;

      // Format attendu : "Matière / Prof / Salle" ou "Matière - Prof - Salle"
      const parts = cellValue.split(/\/|-–/).map((p) => p.trim());
      const subject = parts[0] || '';
      const teacher = parts[1] || '';
      const room = parts[2] || '';

      if (!subject) return;

      // Calculer end_time (par défaut +1h)
      const [h, m] = startTime.split(':').map(Number);
      const endH = h + 1;
      const endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      rows.push({
        day_of_week: dayOfWeek,
        day_name: DAY_NAMES[dayOfWeek],
        start_time: startTime,
        end_time: endTime,
        class_name: '',
        subject_name: subject,
        teacher_name: teacher,
        room_name: room,
        isValid: true,
      });
    });
  });

  return rows;
}
