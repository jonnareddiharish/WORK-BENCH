import { Trash2, ChevronRight, ShieldAlert, HeartPulse } from 'lucide-react';
import { formatDate, getInitials } from '../../lib/utils';
import type { User } from '../../types';

const GRAD = [
  'from-teal-400 to-emerald-500',
  'from-violet-400 to-indigo-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
  'from-sky-400 to-blue-500',
];

function grad(name: string) {
  return GRAD[name.charCodeAt(0) % GRAD.length];
}

interface Props {
  user: User;
  onClick: () => void;
  onDelete: () => void;
}

export function FamilyMemberCard({ user, onClick, onDelete }: Props) {
  const hasConditions = (user.medicalConditions?.length ?? 0) > 0;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-teal-200 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group flex flex-col overflow-hidden"
    >
      {/* Top strip */}
      <div className={`h-1.5 bg-gradient-to-r ${grad(user.name)}`} />

      <div className="p-6 flex flex-col flex-1">
        {/* Header row */}
        <div className="flex items-center gap-4 mb-5">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${grad(user.name)} flex items-center justify-center text-white font-extrabold text-xl shadow-md group-hover:scale-105 transition-transform duration-200 flex-shrink-0`}>
            {getInitials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-slate-900 text-base leading-snug group-hover:text-teal-700 transition-colors truncate">{user.name}</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              DOB: {formatDate(user.dob)}
              {user.biologicalSex && <span className="ml-2 text-slate-300">·</span>}
              {user.biologicalSex && <span className="ml-2">{user.biologicalSex}</span>}
            </p>
          </div>
        </div>

        {/* Conditions row */}
        <div className="flex-1 mb-5">
          {hasConditions ? (
            <div className="flex flex-wrap gap-1.5">
              {user.medicalConditions!.slice(0, 3).map(c => (
                <span key={c} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-full">
                  <ShieldAlert className="w-2.5 h-2.5" />{c}
                </span>
              ))}
              {user.medicalConditions!.length > 3 && (
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
                  +{user.medicalConditions!.length - 3} more
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-600">
              <HeartPulse className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">No active conditions</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete member"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </div>
  );
}
