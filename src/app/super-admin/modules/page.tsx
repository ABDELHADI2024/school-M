'use client';

import React from 'react';
import { PILLIERS, CORE_MODULES } from '@/types';
import { Layers, CheckCircle2 } from 'lucide-react';
import { getModuleMeta, getPillarMeta } from '@/lib/modules';

export default function ModulesCatalogPage() {
  const pillarsWithItems = PILLIERS.filter((p) => p.id !== 'direction').map((pillar) => {
    const pillarMeta = getPillarMeta(pillar.id);
    const items = pillar.modules.map((moduleId) => {
      const meta = getModuleMeta(moduleId);
      const isCore = CORE_MODULES.includes(moduleId);
      return {
        id: moduleId,
        label: meta.label,
        description: meta.description,
        icon: meta.icon,
        color: meta.color,
        isCore,
      };
    });
    return { ...pillar, pillarMeta, items };
  });

  const totalModules = pillarsWithItems.reduce((acc, p) => acc + p.items.length, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Catalogue de modules</h2>
        <p className="text-sm text-slate-400">
          {totalModules} modules répartis en {pillarsWithItems.length} piliers métier.
          Les modules « Inclus de base » ({CORE_MODULES.length}) sont automatiquement activés pour chaque nouvelle école.
        </p>
      </div>

      <div className="space-y-10">
        {pillarsWithItems.map((pillar) => {
          const PillarIcon = pillar.pillarMeta.icon;
          return (
            <div key={pillar.id} className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className={pillar.pillarMeta.color}>
                  <PillarIcon className="text-xl" />
                </div>
                <h3 className="font-bold text-white text-sm">{pillar.label}</h3>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md font-medium">
                  {pillar.items.length} module{pillar.items.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pillar.items.map((m) => {
                  const Icon = m.icon;
                  return (
                    <div
                      key={m.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={m.color}>
                          <Icon className="h-6 w-6" />
                        </div>
                        {m.isCore ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                            <CheckCircle2 className="h-3 w-3" />
                            Inclus de base
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                            Optionnel
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-white text-sm mb-1">{m.label}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">{m.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-slate-600">
              <Layers className="text-xl" />
            </div>
            <h3 className="font-bold text-white text-sm">Direction & Pilotage</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-950/60 rounded-xl p-3 border border-dashed border-slate-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Tableau de bord décisionnel centralisé — module auto-inclus pour chaque établissement.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
