import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ShieldCheck,
  GraduationCap,
  CreditCard,
  QrCode,
  FileSpreadsheet,
  ArrowRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { role: string; school_id: string | null; full_name: string } | null = null;
  let schoolSlug: string | null = null;

  if (user) {
    const { data } = await supabase
      .from('user_profiles')
      .select('role, school_id, full_name')
      .eq('user_id', user.id)
      .maybeSingle();
    profile = data;

    if (profile?.school_id) {
      const { data: school } = await supabase
        .from('schools')
        .select('slug')
        .eq('id', profile.school_id)
        .maybeSingle();
      schoolSlug = school?.slug ?? null;
    }
  }

  // Connected user: redirect immediately to their designated area
  if (user) {
    if (profile?.role === 'super_admin') {
      redirect('/super-admin');
    }
    if (schoolSlug) {
      redirect(`/${schoolSlug}/dashboard`);
    }
    redirect('/super-admin/schools');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      <header className="border-b border-slate-800/60 backdrop-blur-md sticky top-0 z-50 bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white block leading-none">
                PLATEFORME SCOLAIRE
              </span>
              <span className="text-xs text-slate-400 tracking-wider font-medium">
                SYSTÈME INTÉGRÉ DE GESTION & PILOTAGE
              </span>
            </div>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all duration-200 shadow-lg shadow-indigo-600/25"
          >
            <span>Accéder à l&apos;Espace</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold uppercase tracking-wider text-indigo-400">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            Environnement Sécurisé & Certifié
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Système Unifié de Pilotage Pédagogique & Administratif
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto font-normal leading-relaxed">
            Un écosystème centralisé au service des établissements d&apos;excellence : administration, corps enseignant, secrétariat et familles réunis sur un même portail.
          </p>

          <div className="pt-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-base transition-all duration-200 shadow-xl shadow-indigo-600/30"
            >
              <span>Connexion au Portail de l&apos;Établissement</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <CreditCard className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-white">Gestion Financière & Caisse</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Encaissements guichet avec reçus numérotés, bordereaux bancaires et suivi des règlements en temps réel.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-white">Canevas & Suivi MASSAR</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Notes de contrôles continus, appels de séance numériques et interopérabilité avec les formats officiels.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <QrCode className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-white">Badges QR & Espace Famille</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Cartes scolaires scannables, autorisations cantine/bus et suivi à 360° pour les tuteurs légaux.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-900 py-6 px-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Plateforme de Gestion Scolaire. Tous droits réservés.
      </footer>
    </div>
  );
}
