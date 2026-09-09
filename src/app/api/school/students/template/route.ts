import { NextResponse, type NextRequest } from 'next/server';
import { authorizeManagerForSchool, getAdminClient, missingServiceKeyMessage } from '@/lib/users-api';
import { buildStudentTemplate } from '@/lib/excel/studentsExcel';

export const dynamic = 'force-dynamic';

/**
 * GET /api/school/students/template?schoolId=...
 * Génère et télécharge le canevas Excel intelligible des élèves
 * (en-têtes verrouillées + feuille d'instructions + ligne d'exemple).
 */
export async function GET(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  }

  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  const { data: school } = await admin
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .maybeSingle();

  const schoolName = school?.name || 'Mon École';
  const buffer = await buildStudentTemplate(schoolName);
  const filename = `canevas_eleves_${schoolName.toLowerCase().replace(/\s+/g, '_')}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
