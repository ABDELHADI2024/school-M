import { describe, it, expect } from 'vitest';
import { canDelegateTo } from './index';

describe('canDelegateTo', () => {
  it('respecte les niveaux Super Admin, Owner et Directeur', () => {
    expect(canDelegateTo('super_admin', 'school_admin')).toBe(true);
    expect(canDelegateTo('super_admin', 'director')).toBe(false);
    expect(canDelegateTo('school_admin', 'director')).toBe(true);
    expect(canDelegateTo('school_admin', 'staff')).toBe(true);
    expect(canDelegateTo('school_admin', 'teacher')).toBe(false);
  });

  it('permet à un director de déléguer aux personnels (staff, teacher)', () => {
    expect(canDelegateTo('director', 'staff')).toBe(true);
    expect(canDelegateTo('director', 'teacher')).toBe(true);
  });

  it('empêche un director de déléguer à des rôles de gestion', () => {
    expect(canDelegateTo('director', 'school_admin')).toBe(false);
    expect(canDelegateTo('director', 'director')).toBe(false);
  });

  it('n’autorise aucun rôle subalterne à déléguer', () => {
    expect(canDelegateTo('staff', 'director')).toBe(false);
    expect(canDelegateTo('teacher', 'staff')).toBe(false);
  });
});