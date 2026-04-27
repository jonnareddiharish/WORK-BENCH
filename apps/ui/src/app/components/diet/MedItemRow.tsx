import { useState } from 'react';
import { ChevronDown, Info, ShieldAlert } from 'lucide-react';
import { formatDate } from '../../lib/utils';
import type { MedLogItem } from '../../types';

interface Props {
  med: MedLogItem;
  accentBg?: string;
  accentText?: string;
}

export function MedItemRow({ med, accentBg = 'bg-indigo-100', accentText = 'text-indigo-800' }: Props) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(med.sideEffects?.length || med.avoidWhileTaking?.length || med.startDate || med.endDate);

  return (
    <div className="bg-white/80 rounded-xl border border-white/60 shadow-sm overflow-hidden">
      <button
        className="w-full px-3 py-2.5 flex items-start justify-between gap-2 text-left hover:bg-slate-50/50 transition-colors"
        onClick={() => hasDetail && setOpen(o => !o)}
        type="button"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-900 leading-snug">{med.name}</p>
          {med.dosage && <p className="text-[10px] text-slate-500 mt-0.5">{med.dosage}</p>}
          {med.instructions && <p className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1">{med.instructions}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {med.duration && (
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${accentBg} ${accentText}`}>{med.duration}</span>
          )}
          {hasDetail && (
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
          )}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 bg-slate-50/80 space-y-2.5">
          {(med.startDate || med.endDate) && (
            <div className="flex gap-2">
              {med.startDate && (
                <div className="flex-1 bg-teal-50 rounded-lg p-2 border border-teal-100">
                  <p className="text-[8px] font-black uppercase text-teal-500 mb-0.5">Starts</p>
                  <p className="text-[10px] font-bold text-teal-800">{formatDate(med.startDate)}</p>
                </div>
              )}
              {med.endDate && (
                <div className="flex-1 bg-rose-50 rounded-lg p-2 border border-rose-100">
                  <p className="text-[8px] font-black uppercase text-rose-500 mb-0.5">Ends</p>
                  <p className="text-[10px] font-bold text-rose-800">{formatDate(med.endDate)}</p>
                </div>
              )}
            </div>
          )}
          {(med.sideEffects ?? []).length > 0 && (
            <div>
              <p className="text-[8px] font-black uppercase text-amber-600 tracking-wider mb-1 flex items-center gap-1">
                <Info className="w-3 h-3" />Side Effects
              </p>
              <div className="flex flex-wrap gap-1">
                {med.sideEffects!.map((se, j) => (
                  <span key={j} className="text-[9px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-full">{se}</span>
                ))}
              </div>
            </div>
          )}
          {(med.avoidWhileTaking ?? []).length > 0 && (
            <div>
              <p className="text-[8px] font-black uppercase text-rose-600 tracking-wider mb-1 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" />Avoid
              </p>
              <div className="flex flex-wrap gap-1">
                {med.avoidWhileTaking!.map((a, j) => (
                  <span key={j} className="text-[9px] bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5 rounded-full">{a}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
