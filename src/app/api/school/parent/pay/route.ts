import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient, missingServiceKeyMessage } from '@/lib/users-api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  }

  let body: { invoice_id?: string; amount_paid?: number; payment_method?: string; payment_date?: string; note?: string };
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

  // Authentification parent via cookie
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });
  }

  // Vérifier que l'invoice appartient à l'école et que le parent possède l'élève associé
  const { data: inv } = await admin
    .from('invoices')
    .select('id, school_id, student_id, amount_due, amount_paid')
    .eq('id', body.invoice_id)
    .eq('school_id', schoolId)
    .single();

  if (!inv) {
    return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });
  }

  // Maximum qu'il faut régler = solde restant
  const balance = Number(inv.amount_due) - Number(inv.amount_paid);
  if (amount > balance + 0.001) {
    return NextResponse.json({ error: 'Montant supérieur au solde restant' }, { status: 400 });
  }

  // Le parent doit être rattaché à l'élève
  const { data: stu } = await admin
    .from('students')
    .select('id')
    .eq('id', inv.student_id)
    .eq('parent_user_id', user.id)
    .maybeSingle();
  if (!stu) {
    return NextResponse.json({ error: 'Vous n\'êtes pas le tuteur de cet élève' }, { status: 403 });
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
    p_note: body.note || 'Règlement en ligne (portail parent)',
    p_recorded_by: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message || 'Encaissement impossible' }, { status: 500 });
  }

  // Consigner dans le journal de notifications
  try {
    const ref = (data?.receipt_reference || data?.reference || (data && typeof data === 'object' ? (data as Record<string, unknown>).receipt_reference : null)) as string | undefined;
    await admin.from('notifications_log').insert({
      school_id: schoolId,
      student_id: inv.student_id,
      type: 'payment_receipt',
      message: `Paiement de ${amount.toLocaleString('fr-FR')} FCFA reçu${ref ? ` (n° ${ref})` : ''} via le portail parent.`,
    });
  } catch {
    // non bloquant
  }

  return NextResponse.json({ payment: data });
}
