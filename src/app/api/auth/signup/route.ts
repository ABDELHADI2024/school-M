import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * La création d'une école et de son Owner est réservée au Super Admin.
 * Le parcours public est fermé pour empêcher toute création hors hiérarchie.
 */
export async function POST() {
  return NextResponse.json(
    { error: "La création d'une école est réservée au Super Admin." },
    { status: 403 }
  );
}
