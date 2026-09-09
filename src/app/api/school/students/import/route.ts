import { NextResponse, type NextRequest } from 'next/server';
import { authorizeManagerForSchool, getAdminClient, missingServiceKeyMessage } from '@/lib/users-api';
import {
  parseStudentImport,
  isValidDateString,
  type ImportReport,
} from '@/lib/excel/studentsExcel';

export const dynamic = 'force-dynamic';

const REQUIRED_KEYS = ['matricule', 'first_name', 'last_name', 'gender', 'class_name'] as const;
const GENDERS = ['M', 'F'];

/**
 * POST /api/school/students/import
 * Import atomique massif d'élèves depuis un fichier Excel (.xlsx).
 *  - Parsing serveur strict (format date, champs obligatoires, classe existante)
 *  - Détection des doublons de matricule (dans le fichier et en base)
 *  - Insertion en batch avec création automatique des classes manquantes
 *  - Retourne un rapport détaillé (insérées, mises à jour, rejetées + motifs)
 */
export async function POST(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  }

  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Seuls school_admin et director peuvent importer
  const callerRole = auth.profile?.role ?? '';
  if (callerRole === 'teacher') {
    return NextResponse.json({ error: 'Accès refusé : import réservé à l’administration' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Type de contenu invalide' }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext !== 'xlsx' && ext !== 'xls') {
    return NextResponse.json({ error: 'Format non supporté. Utilisez un fichier .xlsx' }, { status: 400 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  // Chargement des classes de l'école (nom → id)
  const { data: classesData } = await admin
    .from('classes')
    .select('id, name')
    .eq('school_id', schoolId);
  const classByName = new Map<string, string>();
  (classesData || []).forEach((c: { id: string; name: string }) => {
    classByName.set(c.name.trim().toLowerCase(), c.id);
  });

  // Parsing serveur
  const arrayBuffer = await file.arrayBuffer();
  const rows = await parseStudentImport(arrayBuffer);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Aucune ligne d’élève détectée dans le fichier' }, { status: 400 });
  }

  const report: ImportReport = { inserted: 0, updated: 0, rejected: 0, lines: [] };

  // ── Phase 1 : validation ligne par ligne ──────────────────────────────────
  const seenMatricules = new Set<string>();
  const validRows = rows.map((row) => {
    const errors: string[] = [];

    // Champs obligatoires
    for (const key of REQUIRED_KEYS) {
      if (!String((row as unknown as Record<string, string>)[key]).trim()) {
        errors.push(`Champ obligatoire manquant : ${key}`);
      }
    }

    // Genre
    if (row.gender && !GENDERS.includes(row.gender.toUpperCase())) {
      errors.push(`Genre invalide « ${row.gender} » (attendu M ou F)`);
    }

    // Date de naissance
    if (row.birth_date && !isValidDateString(row.birth_date)) {
      errors.push(`Date de naissance invalide « ${row.birth_date} » (format AAAA-MM-JJ)`);
    }

    // Email du tuteur
    if (row.parent_email && !row.parent_email.includes('@')) {
      errors.push(`Email du tuteur invalide « ${row.parent_email} »`);
    }

    // Doublon dans le fichier
    const normMatricule = row.matricule.trim().toLowerCase();
    if (normMatricule) {
      if (seenMatricules.has(normMatricule)) {
        errors.push(`Matricule « ${row.matricule} » en doublon dans le fichier`);
      } else {
        seenMatricules.add(normMatricule);
      }
    }

    // Classe doit être renseignée (sinon erreur) — sera créée si inexistante
    if (!row.class_name.trim()) {
      errors.push('Classe obligatoire');
    }

    return { ...row, isValid: errors.length === 0, errors };
  });

  // ── Phase 2 : doublons en base ────────────────────────────────────────────
  const validMatricules = validRows
    .filter((r) => r.isValid && r.matricule.trim())
    .map((r) => r.matricule.trim());
  const existInDb = new Set<string>();
  if (validMatricules.length > 0) {
    const { data: existing } = await admin
      .from('students')
      .select('matricule')
      .eq('school_id', schoolId)
      .in('matricule', validMatricules);
    (existing || []).forEach((e: { matricule: string }) => {
      existInDb.add(e.matricule.trim().toLowerCase());
    });
  }

  const toInsert: unknown[] = [];
  for (const row of validRows) {
    if (!row.isValid) {
      report.rejected++;
      report.lines.push({ lineNumber: row.lineNumber, matricule: row.matricule, reason: row.errors.join(' ; ') });
      continue;
    }
    const normMatricule = row.matricule.trim().toLowerCase();
    if (existInDb.has(normMatricule)) {
      report.rejected++;
      report.lines.push({
        lineNumber: row.lineNumber,
        matricule: row.matricule,
        reason: 'Matricule déjà existant en base',
      });
      continue;
    }
    toInsert.push(row);
  }

  // ── Phase 3 : insertion en batch (avec création des classes manquantes) ──
  if (toInsert.length > 0) {
    // Créer les classes absentes
    const missingClassNames = new Set<string>();
    toInsert.forEach((r) => {
      const name = (r as { class_name: string }).class_name.trim();
      if (!classByName.has(name.toLowerCase())) {
        missingClassNames.add(name);
      }
    });
    if (missingClassNames.size > 0) {
      const { data: created, error: classErr } = await admin
        .from('classes')
        .insert(
          [...missingClassNames].map((name) => ({
            school_id: schoolId,
            name,
            level: 'college',
            academic_year: '2026-2027',
          }))
        )
        .select('id, name');
      if (!classErr && created) {
        created.forEach((c: { id: string; name: string }) => {
          classByName.set(c.name.trim().toLowerCase(), c.id);
        });
      }
    }

    const studentRows = toInsert
      .filter((r) => {
        // Re-home : si la classe n'a pas pu être créée (erreur), on rejette
        const name = (r as { class_name: string }).class_name.trim();
        return classByName.has(name.toLowerCase());
      })
      .map((r) => {
        const row = r as {
          matricule: string;
          first_name: string;
          last_name: string;
          gender: string;
          birth_date: string;
          class_name: string;
          parent_name: string;
          parent_phone: string;
          parent_email: string;
        };
        return {
          school_id: schoolId,
          class_id: classByName.get(row.class_name.trim().toLowerCase()) || null,
          matricule: row.matricule.trim(),
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          gender: row.gender.toUpperCase() || null,
          birth_date: row.birth_date || null,
          parent_name: row.parent_name.trim() || null,
          parent_phone: row.parent_phone.trim() || null,
          parent_email: row.parent_email.trim() || null,
          status: 'active',
        };
      });

    if (studentRows.length > 0) {
      // Insertion en batch — 500 par lot pour rester sous la limite Supabase
      const BATCH = 500;
      for (let i = 0; i < studentRows.length; i += BATCH) {
        const chunk = studentRows.slice(i, i + BATCH);
        const { error } = await admin.from('students').insert(chunk);
        if (error) {
          report.rejected += chunk.length;
          chunk.forEach((c, j) => {
            report.lines.push({
              lineNumber: validRows.find((vr) => vr.matricule === c.matricule)?.lineNumber ?? 0,
              matricule: c.matricule,
              reason: error.message,
            });
          });
          continue;
        }
        report.inserted += chunk.length;
      }
    }
  }

  return NextResponse.json({ report, totalRows: rows.length });
}
