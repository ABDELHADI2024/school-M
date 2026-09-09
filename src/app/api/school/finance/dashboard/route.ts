import { NextResponse, type NextRequest } from 'next/server';
import {
  authorizeManagerForSchool,
  getAdminClient,
  missingServiceKeyMessage,
} from '@/lib/users-api';
import { computeInvoiceStatus, unifyStatus, type InvoiceStatus } from '@/lib/finance';

export const dynamic = 'force-dynamic';

interface InvoiceRow {
  id: string;
  reference: string | null;
  title: string;
  amount_due: number;
  amount_paid: number;
  due_date: string | null;
  status: string;
  note: string | null;
  created_at: string | null;
  fee_type_id: string | null;
  students: {
    id: string;
    matricule: string;
    first_name: string;
    last_name: string;
    gender: string | null;
    classes: { name: string | null } | null;
  } | null;
}

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

  const { data: raw, error } = await admin
    .from('invoices')
    .select('*, students(matricule, first_name, last_name, gender, classes(name))')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const invoices = (raw as InvoiceRow[] | null) ?? [];

  let totalEmitted = 0;
  let totalCollected = 0;
  for (const inv of invoices) {
    totalEmitted += Number(inv.amount_due) || 0;
    totalCollected += Number(inv.amount_paid) || 0;
  }

  const remaining = totalEmitted - totalCollected;
  const recoveryRate =
    totalEmitted > 0 ? Math.round((totalCollected / totalEmitted) * 1000) / 10 : 0;

  const byStatus: Record<InvoiceStatus, number> = {
    paid: 0,
    partial: 0,
    overdue: 0,
    pending: 0,
  };

  const out = (invoices as InvoiceRow[]).map((inv) => {
    const amtDue = Number(inv.amount_due) || 0;
    const amtPaid = Number(inv.amount_paid) || 0;
    const status = computeInvoiceStatus(amtDue, amtPaid, inv.due_date);
    byStatus[status] += 1;
    return {
      id: inv.id,
      reference: inv.reference || `INV-${inv.id.slice(0, 8).toUpperCase()}`,
      title: inv.title,
      amount_due: amtDue,
      amount_paid: amtPaid,
      remaining: Math.max(0, amtDue - amtPaid),
      due_date: inv.due_date,
      status,
      note: inv.note,
      created_at: inv.created_at,
      fee_type_id: inv.fee_type_id,
      student: inv.students
        ? {
            id: inv.students.id,
            matricule: inv.students.matricule,
            first_name: inv.students.first_name,
            last_name: inv.students.last_name,
            gender: inv.students.gender,
            class_name: inv.students.classes?.name ?? null,
          }
        : null,
    };
  });

  const paid = byStatus.paid;
  const partial = byStatus.partial;

  return NextResponse.json({
    kpis: {
      total_emitted: totalEmitted,
      total_collected: totalCollected,
      remaining,
      recovery_rate: recoveryRate,
      invoices: invoices.length,
      paid,
      partial,
      overdue: byStatus.overdue,
      pending: byStatus.pending,
      current_status: unifyStatus(String(byStatus.paid) === String(invoices.length) ? 'paid' : 'pending'),
    },
    invoices: out,
  });
}
