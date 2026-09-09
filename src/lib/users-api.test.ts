import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { authorizeManagerForSchool } from './users-api';
import { createClient } from '@/lib/supabase/server';

function mockSupabase({
  user,
  profile,
}: {
  user: { id: string; email?: string } | null;
  profile: { role: string; school_id: string | null } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const getUser = vi.fn().mockResolvedValue({
    data: { user },
    error: null,
  });

  (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser },
    from,
  });

  return { from, select, eq, maybeSingle, getUser };
}

describe('authorizeManagerForSchool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejette un utilisateur non authentifié avec 401', async () => {
    mockSupabase({ user: null, profile: null });
    const result = await authorizeManagerForSchool('school-1');
    expect(result).toEqual({ ok: false, error: 'Non authentifié', status: 401 });
  });

  it('autorise un super_admin sur n’importe quelle école', async () => {
    mockSupabase({
      user: { id: 'u1', email: 'boss@admins.io' },
      profile: { role: 'super_admin', school_id: null },
    });
    const result = await authorizeManagerForSchool('school-other');
    expect(result.ok).toBe(true);
  });

  it('limite un school_admin à sa propre école', async () => {
    mockSupabase({
      user: { id: 'u2', email: 'admin@school.com' },
      profile: { role: 'school_admin', school_id: 'school-a' },
    });
    const ownSchool = await authorizeManagerForSchool('school-a');
    expect(ownSchool.ok).toBe(true);

    const otherSchool = await authorizeManagerForSchool('school-b');
    expect(otherSchool).toEqual({ ok: false, error: 'Accès refusé', status: 403 });
  });

  it('autorise un director sur sa propre école uniquement', async () => {
    mockSupabase({
      user: { id: 'u3', email: 'd@school.com' },
      profile: { role: 'director', school_id: 'school-a' },
    });
    const ok = await authorizeManagerForSchool('school-a');
    expect(ok.ok).toBe(true);

    const denied = await authorizeManagerForSchool('school-b');
    expect(denied).toEqual({ ok: false, error: 'Accès refusé', status: 403 });
  });

  it('refuse un rôle non autorisé (teacher, staff, parent)', async () => {
    mockSupabase({
      user: { id: 'u4', email: 't@school.com' },
      profile: { role: 'teacher', school_id: 'school-a' },
    });
    const result = await authorizeManagerForSchool('school-a');
    expect(result).toEqual({ ok: false, error: 'Rôle non autorisé', status: 403 });
  });

  it('refuse un utilisateur sans profil', async () => {
    mockSupabase({ user: { id: 'u5', email: 'x@school.com' }, profile: null });
    const result = await authorizeManagerForSchool('school-a');
    expect(result).toEqual({ ok: false, error: 'Profil utilisateur introuvable', status: 403 });
  });
});