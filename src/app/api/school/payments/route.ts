import { NextResponse, type NextRequest } from 'next/server';
import {
  authorizeManagerForSchool,
  getAdminClient,
  missingServiceKeyMessage,
} from '@/lib/users-api';

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
    invoice_id?: string;
    amount_paid?: number;
    payment_method?: string;
    payment_date?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  if (!body.invoice_id) {
    return NextResponse.json({ error: 'Paramètre invoice_id manquant' }, { status: 400 });
  }
  const amount = Number(body.amount_paid);
  if (!isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
  }
  const method = body.payment_method || 'cash';
  const date = body.payment_date || new Date().toISOString().slice(0, 10);

  const { data, error } = await admin.rpc('record_payment', {
    p_school_id: schoolId,
    p_invoice_id: body.invoice_id,
    p_amount_paid: amount,
    p_payment_method: method,
    p_payment_date: date,
    p_reference: null,
    p_note: body.note || null,
    p_recorded_by: auth.user.id,
  });

  if (error) {
    const msg = error.message || 'Encaissement impossible';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ payment: data });
}
