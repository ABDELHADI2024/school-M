import ExcelJS from 'exceljs';
import { ALL_MODULES as MODULE_CATALOG } from '@/types';

export interface UserExcelRow {
  full_name: string;
  email: string;
  role: string;
  modules: string;
  isValid: boolean;
  error?: string;
}

function getCleanString(cellValue: unknown): string {
  if (cellValue === null || cellValue === undefined) return '';
  if (typeof cellValue === 'object') {
    const record = cellValue as { result?: unknown; richText?: Array<{ text: string }>; text?: unknown };
    if ('result' in record && record.result !== undefined && record.result !== null) {
      return String(record.result).trim();
    }
    if ('richText' in record && Array.isArray(record.richText)) {
      return record.richText.map((t) => String(t.text)).join('').trim();
    }
    if ('text' in record && record.text) {
      return String(record.text).trim();
    }
    if (cellValue instanceof Date) {
      return cellValue.toISOString().split('T')[0];
    }
  }
  return String(cellValue).trim();
}

const VALID_ROLES = ['director', 'staff', 'teacher'];
// Source unique du catalogue : src/types/index.ts ('messaging' n'existe plus).
const ALL_MODULES = MODULE_CATALOG.map((m) => m.id);

export async function generateUserTemplate(schoolName: string) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Personnel');

  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${schoolName.toUpperCase()} - CANEVAS DU PERSONNEL`;
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells('A2:E2');
  const legendCell = worksheet.getCell('A2');
  legendCell.value = `Rôles valides : ${VALID_ROLES.join(', ')} · Modules : ${ALL_MODULES.join(', ')}`;
  legendCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
  legendCell.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.columns = [
    { header: 'Nom complet', key: 'full_name', width: 30 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Rôle', key: 'role', width: 18 },
    { header: 'Modules (séparés par virgules)', key: 'modules', width: 40 },
    { header: 'Statut', key: 'status', width: 15 },
  ];

  const headerRow = worksheet.getRow(4);
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } } };
  });
  headerRow.height = 22;

  const sampleRows = [
    { full_name: 'Jean Dupont', email: 'jean.dupont@ecole.com', role: 'director', modules: 'attendance,grades,timetable', status: 'actif' },
    { full_name: 'Marie Koné', email: 'marie.kone@ecole.com', role: 'teacher', modules: 'grades,attendance', status: 'actif' },
    { full_name: 'Paul Mensah', email: 'paul.mensah@ecole.com', role: 'staff', modules: 'finance,students', status: 'actif' },
  ];

  sampleRows.forEach((row, idx) => {
    const dataRow = worksheet.addRow(row);
    dataRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: idx % 2 === 0 ? 'left' : 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' } };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

export async function generateUserExport(
  schoolName: string,
  users: {
    full_name: string;
    email: string;
    role: string;
    modules: string[];
    is_active: boolean;
  }[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Personnel');

  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${schoolName.toUpperCase()} - LISTE DU PERSONNEL`;
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells('A2:E2');
  const dateCell = worksheet.getCell('A2');
  dateCell.value = `Exporté le ${new Date().toLocaleDateString('fr-FR')}`;
  dateCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
  dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.columns = [
    { header: 'Nom complet', key: 'full_name', width: 30 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Rôle', key: 'role', width: 18 },
    { header: 'Modules autorisés', key: 'modules', width: 40 },
    { header: 'Statut', key: 'status', width: 15 },
  ];

  const headerRow = worksheet.getRow(4);
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } } };
  });
  headerRow.height = 22;

  const ROLE_LABELS: Record<string, string> = {
    director: 'Directeur',
    staff: 'Personnel',
    teacher: 'Enseignant',
    school_admin: 'Admin école',
    super_admin: 'Super admin',
  };

  users.forEach((u, idx) => {
    const dataRow = worksheet.addRow({
      full_name: u.full_name,
      email: u.email,
      role: ROLE_LABELS[u.role] || u.role,
      modules: u.modules.join(', '),
      status: u.is_active ? 'Actif' : 'Inactif',
    });
    dataRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = { vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' } };
    });
  });

  // Stats row
  const lastRow = worksheet.lastRow?.number || 5;
  worksheet.addRow([]);
  const statsRow = worksheet.addRow([`Total: ${users.length} membre(s)`, '', '', '', '']);
  statsRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF2563EB' } };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

export async function parseUserImport(fileBuffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const startRow = worksheet.getRow(1).getCell(1).value?.toString().includes('CANEVAS') ? 5 : 4;

  const rows: UserExcelRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < startRow) return;

    const full_name = getCleanString(row.getCell(1).value);
    const email = getCleanString(row.getCell(2).value);
    const role = getCleanString(row.getCell(3).value).toLowerCase();
    const modulesRaw = getCleanString(row.getCell(4).value);

    let error = '';
    if (!full_name) error = 'Nom requis';
    else if (!email || !email.includes('@')) error = 'Email invalide';
    else if (!VALID_ROLES.includes(role)) error = `Rôle invalide: ${role}`;

    const modules = modulesRaw.split(',').map((m) => m.trim().toLowerCase()).filter((m) => ALL_MODULES.includes(m));

    rows.push({ full_name, email, role, modules: modules.join(','), isValid: !error, error });
  });

  return rows;
}
