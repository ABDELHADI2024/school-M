import ExcelJS from 'exceljs';

// ─────────────────────────────────────────────────────────────────────────────
// Types partagés pour le moteur Excel des élèves
// ─────────────────────────────────────────────────────────────────────────────

export interface StudentImportRow {
  lineNumber: number;
  matricule: string;
  first_name: string;
  last_name: string;
  gender: string;
  birth_date: string;
  class_name: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  // Résultat de validation (rempli côté serveur)
  isValid: boolean;
  errors: string[];
}

export interface ImportReport {
  inserted: number;
  updated: number;
  rejected: number;
  lines: {
    lineNumber: number;
    matricule?: string;
    reason: string;
  }[];
}

export const TEMPLATE_HEADERS: { key: string; label: string; required: boolean; width: number }[] = [
  { key: 'matricule', label: 'Matricule*', required: true, width: 18 },
  { key: 'last_name', label: 'Nom*', required: true, width: 20 },
  { key: 'first_name', label: 'Prénom*', required: true, width: 20 },
  { key: 'gender', label: 'Genre (M/F)*', required: true, width: 14 },
  { key: 'birth_date', label: 'Date Naissance (AAAA-MM-JJ)', required: false, width: 26 },
  { key: 'class_name', label: 'Classe*', required: true, width: 18 },
  { key: 'parent_name', label: 'Nom Tuteur', required: false, width: 22 },
  { key: 'parent_phone', label: 'Téléphone Tuteur', required: false, width: 22 },
  { key: 'parent_email', label: 'Email Tuteur', required: false, width: 28 },
];

const ORDRE_REQUIS = ['matricule', 'last_name', 'first_name', 'gender', 'birth_date', 'class_name', 'parent_name', 'parent_phone', 'parent_email'];

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation des valeurs de cellule ExcelJS (gère objets, dates, richText…)
// ─────────────────────────────────────────────────────────────────────────────
function cleanString(cellValue: unknown): string {
  if (cellValue === null || cellValue === undefined) return '';
  if (cellValue instanceof Date) {
    return cellValue.toISOString().split('T')[0];
  }
  if (typeof cellValue === 'object') {
    const record = cellValue as {
      result?: unknown;
      richText?: Array<{ text: string }>;
      text?: unknown;
    };
    if ('result' in record && record.result !== undefined && record.result !== null) {
      return String(record.result).trim();
    }
    if ('richText' in record && Array.isArray(record.richText)) {
      return record.richText.map((t) => String(t.text)).join('').trim();
    }
    if ('text' in record && record.text !== undefined && record.text !== null) {
      return String(record.text).trim();
    }
  }
  return String(cellValue).trim();
}

export function normalizeDate(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // ISO strict
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // yyyy-mm-dd avec autres séparateurs
  const isoMatch = trimmed.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  // dd/mm/yyyy ou dd-mm-yyyy
  const euMatch = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (euMatch) {
    return `${euMatch[3]}-${euMatch[2].padStart(2, '0')}-${euMatch[1].padStart(2, '0')}`;
  }
  // âge numérique (ex: 12)
  const ageNum = parseInt(trimmed, 10);
  if (!isNaN(ageNum) && ageNum > 0 && ageNum < 100) {
    const year = new Date().getFullYear() - ageNum;
    return `${year}-01-01`;
  }
  return '';
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// A. GÉNÉRATION DU CANEVAS (retourne un Buffer, fonctionne côté serveur)
// ─────────────────────────────────────────────────────────────────────────────
export async function buildStudentTemplate(schoolName: string = 'Mon École'): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();

  // ── Feuille 1 : Élèves
  const ws = workbook.addWorksheet('Élèves');
  ws.columns = TEMPLATE_HEADERS.map((h) => ({ header: h.label, key: h.key, width: h.width }));

  // Ligne d'en-tête verrouillée + stylisée
  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF3730A3' } },
      bottom: { style: 'thin', color: { argb: 'FF3730A3' } },
      left: { style: 'thin', color: { argb: 'FF3730A3' } },
      right: { style: 'thin', color: { argb: 'FF3730A3' } },
    };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Ligne d'exemple (ligne 2)
  ws.addRow({
    matricule: 'MAT-2026-001',
    last_name: 'Moreau',
    first_name: 'Lucas',
    gender: 'M',
    birth_date: '2014-05-12',
    class_name: '6ème A',
    parent_name: 'Claire Moreau',
    parent_phone: '0612345678',
    parent_email: 'claire.moreau@email.com',
  });
  ws.getRow(2).eachCell((cell) => {
    cell.font = { italic: true, color: { argb: 'FF94A3B8' } };
  });

  // ── Feuille 2 : Instructions
  const inst = workbook.addWorksheet('Instructions');
  inst.columns = [{ key: 'a', width: 8 }, { key: 'b', width: 60 }];
  const instructions = [
    ['📌', 'GUIDE D’IMPORT MASSIF DES ÉLÈVES'],
    ['', ''],
    ['1.', 'Remplissez la feuille « Élèves » à partir de la ligne 3 (la ligne 1 est l’entête, la ligne 2 est un exemple à effacer ou remplacer).'],
    ['2.', 'Les colonnes avec * sont obligatoires : Matricule, Nom, Prénom, Genre (M/F), Classe.'],
    ['3.', 'Genre : saisissez « M » pour masculin ou « F » pour féminin.'],
    ['4.', 'Date de naissance : format AAAA-MM-JJ (ex : 2014-05-12). Formats JJ/MM/AAAA et âge numérique (ex : 12) sont aussi acceptés.'],
    ['5.', 'Classe : saisissez le nom exact de la classe (ex : « 6ème A »). La classe sera créée automatiquement si elle n’existe pas.'],
    ['6.', 'Le matricule doit être unique. Les lignes en doublon (dans le fichier ou déjà en base) seront rejetées et signalées.'],
    ['7.', 'Astuce : n’effacez pas la ligne d’en-tête ; elle sert à détecter les colonnes.'],
    ['', ''],
    ['✅', 'Après remplissage, importez ce fichier via le bouton « Importer » de la page Inscriptions.'],
  ];
  instructions.forEach(([a, b]) => {
    const row = inst.addRow({ a, b });
    if (b.startsWith('GUIDE')) {
      row.getCell(2).font = { bold: true, size: 13, color: { argb: 'FF4F46E5' } };
    }
  });
  inst.getRow(1).getCell(2).alignment = { vertical: 'middle' };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer.slice(0, buffer.byteLength) as ArrayBuffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// B. PARSING CÔTÉ SERVEUR (validation stricte de chaque ligne)
// ─────────────────────────────────────────────────────────────────────────────
export async function parseStudentImport(buffer: ArrayBuffer): Promise<StudentImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // Détection de la feuille : priorité « Élèves », sinon la première
  const ws =
    workbook.worksheets.find((w) => /élèves?/i.test(w.name)) ||
    workbook.worksheets[0];
  if (!ws) return [];

  // Détection de la ligne d'en-tête
  let headerRowIdx = -1;
  const colMap: Record<string, number> = {};

  ws.eachRow((row, rowNumber) => {
    if (headerRowIdx !== -1) return;
    const values = row.values as unknown[];
    if (!Array.isArray(values)) return;
    const lineStr = values.map((v) => cleanString(v).toLowerCase()).join(' ');
    if (/matricule|prenom|nom|classe|genre/.test(lineStr)) {
      headerRowIdx = rowNumber;
      row.eachCell((cell, colNumber) => {
        const val = cleanString(cell.value).toLowerCase().replace('*', '');
        colMap[val] = colNumber;
      });
    }
  });
  if (headerRowIdx === -1) headerRowIdx = 1;

  const col = (rowIndex: number, key: string): string => {
    const idx = colMap[key];
    if (idx === undefined) {
      // fallback par position canonique
      const position =
        key === 'matricule' ? 1 :
        key === 'last_name' ? 2 :
        key === 'first_name' ? 3 :
        key === 'gender' ? 4 :
        key === 'birth_date' ? 5 :
        key === 'class_name' ? 6 :
        key === 'parent_name' ? 7 :
        key === 'parent_phone' ? 8 :
        key === 'parent_email' ? 9 : -1;
      if (position === -1) return '';
      return cleanString(ws.getRow(rowIndex).getCell(position).value);
    }
    return cleanString(ws.getRow(rowIndex).getCell(idx).value);
  };

  const rows: StudentImportRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIdx) return;
    const matricule = col(rowNumber, 'matricule');
    const last_name = col(rowNumber, 'last_name');
    const first_name = col(rowNumber, 'first_name');
    const gender = col(rowNumber, 'gender');
    const birth_date = col(rowNumber, 'birth_date');
    const class_name = col(rowNumber, 'class_name');
    const parent_name = col(rowNumber, 'parent_name');
    const parent_phone = col(rowNumber, 'parent_phone');
    const parent_email = col(rowNumber, 'parent_email');

    // Ligne entièrement vide => on ignore
    const allEmpty = [matricule, last_name, first_name, gender, birth_date, class_name, parent_name, parent_phone, parent_email]
      .every((v) => v.trim() === '');
    if (allEmpty) return;

    rows.push({
      lineNumber: rowNumber,
      matricule,
      first_name,
      last_name,
      gender: gender.toUpperCase(),
      birth_date: normalizeDate(birth_date),
      class_name,
      parent_name,
      parent_phone,
      parent_email,
      isValid: true,
      errors: [],
    });
  });

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// C. EXPORT DES EFFECTIFS (xlsx et csv, retourne un Buffer)
// ─────────────────────────────────────────────────────────────────────────────
export interface ExportRow {
  matricule: string;
  first_name: string;
  last_name: string;
  gender: string;
  class_name: string;
  status: string;
}

export async function buildStudentExport(
  rows: ExportRow[],
  stats: { total: number; girls: number; boys: number },
  format: 'xlsx' | 'csv',
): Promise<ArrayBuffer | string> {
  if (format === 'csv') {
    const header = 'Matricule,Nom,Prénom,Genre,Classe,Statut\n';
    const body = rows
      .map((r) =>
        [r.matricule, r.last_name, r.first_name, r.gender, r.class_name, r.status]
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    const footer = `\n\nTotal,${stats.total}\nFilles,${stats.girls}\nGarçons,${stats.boys}\n`;
    return header + body + footer;
  }

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Effectifs');

  // Ligne de statistiques
  ws.addRow(['Effectif des élèves']);
  ws.mergeCells('A1:F1');
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.addRow([]);
  ws.addRow(['Total élèves', stats.total, 'Filles', stats.girls, 'Garçons', stats.boys]);
  ws.addRow([]);

  ws.columns = [
    { header: 'Matricule', key: 'matricule', width: 18 },
    { header: 'Nom', key: 'last_name', width: 20 },
    { header: 'Prénom', key: 'first_name', width: 20 },
    { header: 'Genre', key: 'gender', width: 10 },
    { header: 'Classe', key: 'class_name', width: 18 },
    { header: 'Statut', key: 'status', width: 14 },
  ];

  const dataStartRow = ws.rowCount + 1;
  rows.forEach((r) => ws.addRow(r));

  const headerRow = ws.getRow(dataStartRow);
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  ws.views = [{ state: 'frozen', ySplit: dataStartRow }];

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer.slice(0, buffer.byteLength) as ArrayBuffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers navigateur : téléchargement d'un Buffer reçu du serveur
// ─────────────────────────────────────────────────────────────────────────────
export function downloadBlob(buffer: ArrayBuffer, filename: string, mime: string) {
  const blob = new Blob([buffer], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
