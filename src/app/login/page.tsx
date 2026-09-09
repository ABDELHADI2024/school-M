'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  GraduationCap,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';

type Profile = {
  id: string;
  role: string;
  school_id: string | null;
  is_active?: boolean | null;
};

const FALLBACK_DESTINATION = '/super-admin/schools';
const supabase = createClient();

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveDestination = useCallback(async (userId: string): Promise<string> => {
    // The project schema uses user_profiles.user_id. The is_active fallback
    // keeps this compatible with databases created before that column existed.
    let { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, role, school_id, is_active')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      const fallback = await supabase
        .from('user_profiles')
        .select('id, role, school_id')
        .eq('user_id', userId)
        .maybeSingle();
      profile = fallback.data as typeof profile;
      profileError = fallback.error;
    }

    if (profileError || !profile) {
      throw new Error('Profil utilisateur introuvable. Contactez la direction.');
    }

    const typedProfile = profile as Profile;

    if (typedProfile.is_active === false) {
      await supabase.auth.signOut();
      throw new Error('Ce compte a été suspendu par la direction.');
    }

    if (typedProfile.role === 'super_admin') {
      return '/super-admin';
    }

    if (typedProfile.school_id) {
      const { data: school } = await supabase
        .from('schools')
        .select('slug')
        .eq('id', typedProfile.school_id)
        .maybeSingle();

      if (school?.slug) {
        return typedProfile.role === 'parent'
          ? `/${school.slug}/parent`
          : `/${school.slug}/dashboard`;
      }
    }

    return FALLBACK_DESTINATION;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function redirectExistingSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!cancelled && session?.user) {
        const destination = await resolveDestination(session.user.id);
        if (!cancelled) router.replace(destination);
      }
    }

    void redirectExistingSession();
    return () => {
      cancelled = true;
    };
  }, [resolveDestination, router]);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError('Identifiants incorrects ou compte introuvable');
      setLoading(false);
      return;
    }

    if (!data.user) {
      setError('Connexion impossible. Veuillez réessayer.');
      setLoading(false);
      return;
    }

    try {
      const destination = await resolveDestination(data.user.id);
      router.replace(destination);
      router.refresh();
    } catch (destinationError) {
      setError(
        destinationError instanceof Error
          ? destinationError.message
          : 'Impossible de déterminer votre espace.'
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center space-y-5 mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-lg shadow-indigo-500/10">
            <GraduationCap className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-400">
              <ShieldCheck className="h-4 w-4" />
              Accès sécurisé
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Portail d&apos;Accès Sécurisé
            </h1>
            <p className="text-slate-400 text-sm">
              Connectez-vous à votre espace établissement
            </p>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 space-y-6 shadow-2xl shadow-black/20">
          {error && (
            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl p-3 text-sm" role="alert">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="vous@ecole.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white py-3 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25 transition-all"
            >
              {loading ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="text-center">
            <p className="text-sm text-slate-400">
              Pas encore de compte ?{' '}
              <Link
                href="/signup"
                className="text-indigo-400 hover:text-indigo-300 font-semibold transition"
              >
                Créer un compte
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
