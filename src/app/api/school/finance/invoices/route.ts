import { NextResponse, type NextRequest } from 'next/server';
import {
  authorizeManagerForSchool,
  getAdminClient,
  missingServiceKeyMessage,
} from '@/lib/users-api';
import { nextInvoiceReference } from '@/lib/finance';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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

  let body: {
    mode?: 'single' | 'class';
    student_id?: string;
    class_id?: string;
    fee_type_id?: string;
    amount?: number;
    due_date?: string;
    title?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const mode = body.mode === 'class' ? 'class' : 'single';

  // Récupérer le type de frais (pour le libellé et le tarif par défaut)
  let feeType: { id: string; name: string; amount: number } | null = null;
  let classPrice: { amount: number } | null = null;

  if (body.fee_type_id) {
    const { data: ft, error: ftErr } = await admin
      .from('fee_types')
      .select('id, name, amount')
      .eq('id', body.fee_type_id)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (ftErr) {
      return NextResponse.json({ error: 'Type de frais introuvable' }, { status: 400 });
    }
    feeType = ft as { id: string; name: string; amount: number } | null;
    if (!feeType) {
      return NextResponse.json({ error: 'Type de frais introuvable' }, { status: 400 });
    }
  }

  // Sélectionner les élèves ciblés
  let targets: { id: string; first_name: string; last_name: string; matricule: string; class_id: string | null }[] = [];

  if (mode === 'single') {
    if (!body.student_id) {
      return NextResponse.json({ error: 'Paramètre student_id manquant' }, { status: 400 });
    }
    const { data, error } = await admin
      .from('students')
      .select('id, first_name, last_name, matricule, class_id')
      .eq('id', body.student_id)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: 'Élève introuvable' }, { status: 400 });
    }
    targets = [data as typeof targets[number]];
  } else {
    if (!body.class_id) {
      return NextResponse.json({ error: 'Paramètre class_id manquant' }, { status: 400 });
    }
    const { data, error } = await admin
      .from('students')
      .select('id, first_name, last_name, matricule, class_id')
      .eq('class_id', body.class_id)
      .eq('school_id', schoolId)
      .eq('status', 'active');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    targets = (data as typeof targets) ?? [];
  }

  if (targets.length === 0) {
    return NextResponse.json({ error: 'Aucun élève éligible trouvé' }, { status: 400 });
  }

  // Tarif unitaire : override explicite > tarif par classe > tarif du type
  let unitAmount: number | null = body.amount ?? null;
  if (feeType) {
    unitAmount = body.amount ?? feeType.amount ?? 0;
  }
  if (unitAmount == null) unitAmount = 0;

  const effectiveClassId = mode === 'single' ? targets[0].class_id : (body.class_id ?? null);
  if (feeType && body.amount == null && effectiveClassId) {
    const { data: cp } = await admin
      .from('fee_class_prices')
      .select('amount')
      .eq('fee_type_id', feeType.id)
      .eq('class_id', effectiveClassId)
      .maybeSingle();
    if (cp) classPrice = cp as { amount: number };
    if (classPrice && Number(classPrice.amount) > 0) unitAmount = Number(classPrice.amount);
  }

  const dueDate = body.due_date || null;

  // Comptage des factures existantes pour générer des références uniques
  const year = String(new Date().getFullYear());
  const { count } = await admin
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId);

  let base = (count ?? 0);
  const academicYear = '2026-2027';

  const rows = targets.map((t) => ({
    school_id: schoolId,
    student_id: t.id,
    fee_type_id: feeType?.id ?? null,
    title: body.title || feeType?.name || 'Frais de scolarité',
    amount_due: unitAmount,
    amount_paid: 0,
    due_date: dueDate,
    status: dueDate ? 'pending' : 'pending',
    note: `${t.first_name} ${t.last_name} · ${academicYear}`,
    reference: null as string | null,
  }));

  const inserted: { id: string; reference: string }[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    base += 1;
    row.reference = nextInvoiceReference(year, base);
    const { data, error } = await admin
      .from('invoices')
      .insert(row)
      .select('id, reference')
      .single();
    if (error) {
      errors.push(`${row.student_id}: ${error.message}`);
    } else if (data) {
      inserted.push(data as { id: string; reference: string });
    }
  }

  return NextResponse.json({
    issued: inserted.length,
    errors,
    references: inserted.map((i) => i.reference),
  });
}
