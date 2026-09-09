import { NextResponse, type NextRequest } from 'next/server';
import { authorizeManagerForSchool, getAdminClient, missingServiceKeyMessage } from '@/lib/users-api';
import { buildStudentExport, type ExportRow } from '@/lib/excel/studentsExcel';

export const dynamic = 'force-dynamic';

/**
 * GET /api/school/students/export?schoolId=...&classId=...&format=xlsx|csv
 * Exporte l'effectif des élèves avec statistiques (Total, Filles, Garçons).
 */
export async function GET(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  }
  const classId = request.nextUrl.searchParams.get('classId') || null;
  const format = (request.nextUrl.searchParams.get('format') || 'xlsx') as 'xlsx' | 'csv';

  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  let query = admin
    .from('students')
    .select('matricule, first_name, last_name, gender, status, class_id, classes(name)')
    .eq('school_id', schoolId)
    .order('last_name', { ascending: true });

  if (classId) query = query.eq('class_id', classId);
  const { data: students } = await query;

  const rows: ExportRow[] = (students || []).map((s) => {
    const clsName =
      (s.classes as unknown as { name?: string } | null)?.name ||
      (Array.isArray(s.classes) ? (s.classes[0] as { name: string })?.name : '');
    return {
      matricule: s.matricule,
      first_name: s.first_name,
      last_name: s.last_name,
      gender: s.gender || '',
      class_name: clsName,
      status: s.status || 'active',
    };
  });

  const girls = rows.filter((r) => r.gender.toUpperCase() === 'F').length;
  const boys = rows.filter((r) => r.gender.toUpperCase() === 'M').length;
  const total = rows.length;

  const out = await buildStudentExport(rows, { total, girls, boys }, format);

  const schoolName = (await admin.from('schools').select('name').eq('id', schoolId).maybeSingle()).data?.name || 'ecole';
  const suffix = classId ? '_classe' : '';
  const filename = `effectifs_${schoolName.toLowerCase().replace(/\s+/g, '_')}${suffix}.${format}`;

  const mime =
    format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const body =
    typeof out === 'string'
      ? new TextEncoder().encode(out)
      : new Uint8Array(out);

  return new NextResponse(body, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
