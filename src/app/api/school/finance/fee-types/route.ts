import { NextResponse, type NextRequest } from 'next/server';
import {
  authorizeManagerForSchool,
  getAdminClient,
  missingServiceKeyMessage,
} from '@/lib/users-api';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['inscription', 'ecolage', 'cantine', 'transport', 'autres'];

export async function GET(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  }
  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });

  const [{ data: feeTypes, error: ftErr }, { data: prices, error: prErr }, { data: classes, error: clErr }] =
    await Promise.all([
      admin.from('fee_types').select('*').eq('school_id', schoolId).order('name'),
      admin.from('fee_class_prices').select('*').eq('fee_types.school_id', schoolId),
      admin.from('classes').select('id, name, level').eq('school_id', schoolId).order('name'),
    ]);

  if (ftErr || prErr || clErr) {
    return NextResponse.json({ error: ftErr?.message || prErr?.message || clErr?.message }, { status: 500 });
  }

  const pricesByFee = new Map<string, { class_id: string; amount: number }[]>();
  (prices as { fee_type_id: string; class_id: string; amount: number }[] | null)?.forEach((p) => {
    const arr = pricesByFee.get(p.fee_type_id) || [];
    arr.push({ class_id: p.class_id, amount: Number(p.amount) });
    pricesByFee.set(p.fee_type_id, arr);
  });

  const out = ((feeTypes as { id: string; name: string; amount: number; category: string; description: string | null; is_active: boolean }[] | null) || []).map(
    (f) => ({
      ...f,
      amount: Number(f.amount),
      class_prices: pricesByFee.get(f.id) || [],
    })
  );

  return NextResponse.json({ fee_types: out, classes: classes ?? [] });
}

export async function POST(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  if (!schoolId) return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });

  let body: { name?: string; amount?: number; category?: string; description?: string; is_active?: boolean; class_prices?: { class_id: string; amount: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
  const amount = Number(body.amount) || 0;
  const category = CATEGORIES.includes(body.category || '') ? body.category! : 'ecolage';

  const { data: inserted, error } = await admin
    .from('fee_types')
    .insert({
      school_id: schoolId,
      name,
      amount,
      category,
      description: body.description || null,
      is_active: body.is_active !== false,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.class_prices?.length) {
    const rows = body.class_prices
      .filter((p) => p.class_id && isFinite(Number(p.amount)))
      .map((p) => ({ fee_type_id: inserted.id, class_id: p.class_id, amount: Number(p.amount) }));
    if (rows.length) {
      const { error: prErr } = await admin.from('fee_class_prices').insert(rows);
      if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  const id = request.nextUrl.searchParams.get('id');
  if (!schoolId) return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'Paramètre id manquant' }, { status: 400 });
  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });

  let body: { name?: string; amount?: number; category?: string; description?: string; is_active?: boolean; class_prices?: { class_id: string; amount: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.amount !== undefined) patch.amount = Number(body.amount) || 0;
  if (body.category !== undefined && CATEGORIES.includes(body.category)) patch.category = body.category;
  if (body.description !== undefined) patch.description = body.description || null;
  if (body.is_active !== undefined) patch.is_active = body.is_active === true;

  const { error: upErr } = await admin
    .from('fee_types')
    .update(patch)
    .eq('id', id)
    .eq('school_id', schoolId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  if (body.class_prices) {
    const { error: delErr } = await admin.from('fee_class_prices').delete().eq('fee_type_id', id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const rows = body.class_prices
      .filter((p) => p.class_id && isFinite(Number(p.amount)))
      .map((p) => ({ fee_type_id: id, class_id: p.class_id, amount: Number(p.amount) }));
    if (rows.length) {
      const { error: prErr } = await admin.from('fee_class_prices').insert(rows);
      if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get('schoolId');
  const id = request.nextUrl.searchParams.get('id');
  if (!schoolId) return NextResponse.json({ error: 'Paramètre schoolId manquant' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'Paramètre id manquant' }, { status: 400 });
  const auth = await authorizeManagerForSchool(schoolId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: missingServiceKeyMessage() }, { status: 500 });

  const { error } = await admin.from('fee_types').delete().eq('id', id).eq('school_id', schoolId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
