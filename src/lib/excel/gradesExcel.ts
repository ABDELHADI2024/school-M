import ExcelJS from 'exceljs';

export interface GradeExcelRow {
  matricule: string;
  student_name: string;
  score: number | null;
  comment?: string;
  isValid: boolean;
  error?: string;
}

// Génère la grille Excel pré-remplie avec les élèves de la classe pour saisie des notes
export async function generateGradesTemplate(
  schoolName: string,
  className: string,
  subjectName: string,
  evaluationTitle: string,
  students: { matricule: string; first_name: string; last_name: string }[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Saisie des Notes');

  // En-tête informatif
  worksheet.mergeCells('A1:D1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${schoolName.toUpperCase()} - SAISIE DES NOTES : ${subjectName} (${className}) - ${evaluationTitle}`;
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  // Colonnes
  worksheet.columns = [
    { header: 'Matricule (Ne pas modifier)', key: 'matricule', width: 25 },
    { header: 'Nom & Prénom', key: 'student_name', width: 30 },
    { header: 'Note / 20 *', key: 'score', width: 16 },
    { header: 'Appréciation / Commentaire', key: 'comment', width: 35 },
  ];

  const headerRow = worksheet.getRow(2);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Injecter la liste réelle des élèves de la classe
  students.forEach((s) => {
    worksheet.addRow({
      matricule: s.matricule,
      student_name: `${s.last_name} ${s.first_name}`,
      score: '',
      comment: '',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notes_${className}_${subjectName}.xlsx`.toLowerCase().replace(/\s+/g, '_');
  a.click();
  window.URL.revokeObjectURL(url);
}

// Lit et extrait les notes depuis le fichier Excel complété
export async function parseGradesExcel(file: File): Promise<GradeExcelRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: GradeExcelRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;

    const matricule = String(row.getCell(1).value || '').trim();
    const student_name = String(row.getCell(2).value || '').trim();
    const rawScore = row.getCell(3).value;
    const comment = String(row.getCell(4).value || '').trim();

    if (!matricule && !student_name) return;

    let score: number | null = null;
    let isValid = true;
    let error: string | undefined;

    if (rawScore !== null && rawScore !== undefined && rawScore !== '') {
      const num = parseFloat(String(rawScore).replace(',', '.'));
      if (isNaN(num) || num < 0 || num > 20) {
        isValid = false;
        error = 'Note invalide (doit être entre 0 et 20)';
      } else {
        score = num;
      }
    }

    rows.push({
      matricule,
      student_name,
      score,
      comment,
      isValid,
      error,
    });
  });

  return rows;
}
