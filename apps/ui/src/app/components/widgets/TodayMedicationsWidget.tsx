import { Pill, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import type { DietLog, HealthEvent } from '../../types';

interface Props {
  dietLogs: DietLog[];
  healthEvents: HealthEvent[];
}

function isMedActive(startDate?: string, endDate?: string): boolean {
  const now = new Date();
  if (startDate && new Date(startDate) > now) return false;
  if (endDate && new Date(endDate) < now) return false;
  return true;
}

export function TodayMedicationsWidget({ dietLogs, healthEvents }: Props) {
  // Collect medications from diet logs (MEDICATION/PILLS card types)
  const fromDiet = dietLogs
    .filter(l => l.cardType === 'MEDICATION' || l.mealTypes?.includes('PILLS'))
    .flatMap(l => (l.medicationItems ?? []).filter(m => isMedActive(m.startDate, m.endDate)))
    .map(m => ({ name: m.name, dosage: m.dosage ?? '', instructions: m.instructions ?? '', source: 'diet' as const }));

  // Collect active medications from prescription health events
  const fromHealth = healthEvents
    .filter(e => e.eventType === 'PRESCRIPTION' && (e.status === 'ACTIVE' || e.status === 'ONGOING'))
    .flatMap(e => (e.details?.medications ?? []).filter(m => !m.status || m.status === 'ACTIVE'))
    .map(m => ({ name: m.name, dosage: m.dosage, instructions: m.instructions ?? '', source: 'health' as const }));

  // Deduplicate by name (diet takes precedence)
  const seen = new Set<string>();
  const meds = [...fromDiet, ...fromHealth].filter(m => {
    const key = m.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (meds.length === 0) return null;

  return (
    <section className="bg-white rounded-3xl border border-indigo-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-indigo-50">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-100 rounded-xl">
            <Pill className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="text-sm font-bold text-slate-800">Today's Medications</span>
          <span className="text-[10px] font-bold bg-indigo-500 text-white px-2 py-0.5 rounded-full">{meds.length}</span>
        </div>
      </div>

      <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
        {meds.map((med, i) => (
          <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
            <div className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Pill className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800">{med.name}</p>
              {med.dosage && (
                <p className="text-[10px] text-slate-500 mt-0.5">{med.dosage}</p>
              )}
              {med.instructions && (
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-2.5 h-2.5 text-teal-500 flex-shrink-0" />
                  <p className="text-[10px] text-teal-700">{med.instructions}</p>
                </div>
              )}
            </div>
            <CheckCircle2 className="w-4 h-4 text-slate-200 hover:text-emerald-500 cursor-pointer flex-shrink-0 transition-colors mt-0.5" />
          </div>
        ))}
      </div>

      <div className="px-5 py-3 bg-indigo-50/40 border-t border-indigo-100/60">
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3 text-indigo-400" />
          <p className="text-[10px] text-indigo-600 font-medium">Always consult your doctor before changing dosage</p>
        </div>
      </div>
    </section>
  );
}
