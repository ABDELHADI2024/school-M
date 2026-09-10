import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-600/20 text-indigo-300">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-white">Création contrôlée</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          La création d&apos;une école et du compte Owner est réservée au Super Admin.
          Demandez vos identifiants à l&apos;administrateur de votre établissement.
        </p>
        <Link
          href="/login"
          className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la connexion
        </Link>
      </section>
    </main>
  );
}
