import React from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function SchoolTenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ schoolSlug: string }>;
}) {
  const { schoolSlug } = await params;
  const supabase = await createClient();

  const { data: school } = await supabase
    .from('schools')
    .select('*')
    .eq('slug', schoolSlug)
    .single();

  if (!school) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  );
}
