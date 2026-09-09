import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  buildStudentTemplate,
  parseStudentImport,
  buildStudentExport,
  normalizeDate,
  isValidDateString,
  TEMPLATE_HEADERS,
} from './studentsExcel';

async function buildTestWorkbook(rows: string[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Élèves');
  const headers = TEMPLATE_HEADERS.map((h) => h.label);
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return buf.slice(0, buf.byteLength) as ArrayBuffer;
}

describe('Moteur Excel élèves — Template', () => {
  it('génère un canevas xlsx téléchargeable non vide', async () => {
    const buffer = await buildStudentTemplate('Test School');
    expect(buffer.byteLength).toBeGreaterThan(0);
    // doit commencer par le magic PK zip
    const header = Buffer.from(buffer).subarray(0, 2).toString();
    expect(header).toBe('PK');
  });

  it('le canevas contient les 9 colonnes d’en-tête', () => {
    expect(TEMPLATE_HEADERS.map((h) => h.label)).toEqual([
      'Matricule*',
      'Nom*',
      'Prénom*',
      'Genre (M/F)*',
      'Date Naissance (AAAA-MM-JJ)',
      'Classe*',
      'Nom Tuteur',
      'Téléphone Tuteur',
      'Email Tuteur',
    ]);
  });
});

describe('Normalisation des dates', () => {
  it('accepte ISO, européen et âge numérique', () => {
    expect(normalizeDate('2014-05-12')).toBe('2014-05-12');
    expect(normalizeDate('12/05/2014')).toBe('2014-05-12');
    expect(normalizeDate('12-05-2014')).toBe('2014-05-12');
    expect(isValidDateString('2014-05-12')).toBe(true);
  });

  it('rejette les dates invalides', () => {
    expect(isValidDateString('12/05/2014')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
  });
});

describe('Moteur Excel élèves — Import (parse serveur)', () => {
  it('parse correctement 3 élèves et la détection de la classe', async () => {
    const buffer = await buildTestWorkbook([
      ['MAT-001', 'Moreau', 'Lucas', 'M', '2014-05-12', '6ème A', 'Claire Moreau', '0612345678', 'claire@mail.com'],
      ['MAT-002', 'Diallo', 'Awa', 'F', '2013-03-01', '5ème B', 'Moussa Diallo', '0698765432', 'moussa@mail.com'],
      ['MAT-003', 'Ngo', 'Jean', 'M', '12/05/2014', '6ème A', '', '', ''],
    ]);
    const rows = await parseStudentImport(buffer);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ matricule: 'MAT-001', first_name: 'Lucas', last_name: 'Moreau', gender: 'M', birth_date: '2014-05-12', class_name: '6ème A', parent_email: 'claire@mail.com' });
    expect(rows[1]).toMatchObject({ gender: 'F', class_name: '5ème B' });
    // Date européenne normalisée en ISO
    expect(rows[2].birth_date).toBe('2014-05-12');
  });

  it('ignore les lignes vides', async () => {
    const buffer = await buildTestWorkbook([
      ['', '', '', '', '', '', '', '', ''],
      ['MAT-100', 'Test', 'Élève', 'F', '2014-05-12', '6ème A', '', '', ''],
      ['', '', '', '', '', '', '', '', ''],
    ]);
    const rows = await parseStudentImport(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0].matricule).toBe('MAT-100');
  });

  it('détecte les doublons de matricule dans un lot (logique de route)', async () => {
    const buffer = await buildTestWorkbook([
      ['MAT-500', 'Dupe', 'Un', 'M', '2014-05-12', '6ème A', '', '', ''],
      ['MAT-500', 'Dupe', 'Deux', 'M', '2014-05-12', '6ème A', '', '', ''],
      ['MAT-501', 'Unique', 'E', 'F', '2014-05-12', '6ème A', '', '', ''],
    ]);
    const rows = await parseStudentImport(buffer);
    const seen = new Set<string>();
    const dupes: string[] = [];
    rows.forEach((r) => {
      const key = r.matricule.trim().toLowerCase();
      if (seen.has(key)) dupes.push(r.matricule);
      seen.add(key);
    });
    expect(dupes).toEqual(['MAT-500']);
    expect(rows).toHaveLength(3);
  });
});

describe('Moteur Excel élèves — Export', () => {
  const rows = [
    { matricule: 'MAT-001', first_name: 'Lucas', last_name: 'Moreau', gender: 'F', class_name: '6ème A', status: 'active' },
    { matricule: 'MAT-002', first_name: 'Awa', last_name: 'Diallo', gender: 'F', class_name: '5ème B', status: 'active' },
    { matricule: 'MAT-003', first_name: 'Jean', last_name: 'Ngo', gender: 'M', class_name: '6ème A', status: 'inactive' },
  ];
  const stats = { total: 3, girls: 2, boys: 1 };

  it('exporčte un xlsx non vide et lisible', async () => {
    const buffer = await buildStudentExport(rows, stats, 'xlsx');
    expect((buffer as ArrayBuffer).byteLength).toBeGreaterThan(0);
    const header = Buffer.from(buffer as ArrayBuffer).subarray(0, 2).toString();
    expect(header).toBe('PK');
  });

  it('exporte un csv avec des colonnes cohérentes', async () => {
    const csv = (await buildStudentExport(rows, stats, 'csv')) as string;
    expect(csv).toContain('Matricule,Nom,Prénom,Genre,Classe,Statut');
    expect(csv).toContain('MAT-001');
    expect(csv).toContain('MAT-003');
    expect(csv).toContain('Total,3');
    expect(csv).toContain('Filles,2');
    expect(csv).toContain('Garçons,1');
  });

  it('le nombre de lignes de données du CSV correspond à l’effectif', async () => {
    const csv = (await buildStudentExport(rows, stats, 'csv')) as string;
    const dataLines = csv.split('\n').filter((l) => l.startsWith('"MAT-'));
    expect(dataLines).toHaveLength(3);
  });
});
