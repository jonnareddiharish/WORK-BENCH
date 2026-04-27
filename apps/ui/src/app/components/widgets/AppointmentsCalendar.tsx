import { CalendarCheck, FlaskRound, AlarmClock, ChevronRight } from 'lucide-react';
import { getDaysUntil, formatDate } from '../../lib/utils';
import type { Reminder } from '../../types';

interface Props {
  reminders: Reminder[];
  userId: string;
  onDismiss: (id: string) => void;
}

const TYPE_ICON = {
  APPOINTMENT:    CalendarCheck,
  FOLLOW_UP_TEST: FlaskRound,
  MEDICATION_END: AlarmClock,
};

const TYPE_LABEL = {
  APPOINTMENT:    'Appointment',
  FOLLOW_UP_TEST: 'Follow-up Test',
  MEDICATION_END: 'Medication End',
};

function MonthHeader({ label }: { label: string }) {
  return (
    <div className="px-5 py-1.5 bg-slate-50 border-y border-slate-100">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

export function AppointmentsCalendar({ reminders, userId, onDismiss }: Props) {
  // Sort by dueDate ascending, separate overdue from upcoming
  const sorted = [...reminders].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  if (sorted.length === 0) return null;

  // Group by month
  const grouped = new Map<string, typeof sorted>();
  for (const rem of sorted) {
    const monthKey = new Date(rem.dueDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!grouped.has(monthKey)) grouped.set(monthKey, []);
    grouped.get(monthKey)!.push(rem);
  }

  return (
    <section className="bg-white rounded-3xl border border-teal-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-teal-50">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-100 rounded-xl">
            <CalendarCheck className="w-4 h-4 text-teal-600" />
          </div>
          <span className="text-sm font-bold text-slate-800">Upcoming Appointments</span>
          <span className="text-[10px] font-bold bg-teal-500 text-white px-2 py-0.5 rounded-full">{sorted.length}</span>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {Array.from(grouped.entries()).map(([month, rems]) => (
          <div key={month}>
            <MonthHeader label={month} />
            {rems.map(rem => {
              const days    = getDaysUntil(rem.dueDate);
              const overdue = days < 0;
              const soon    = days >= 0 && days <= 7;
              const Icon    = TYPE_ICON[rem.reminderType as keyof typeof TYPE_ICON] ?? CalendarCheck;
              const d       = new Date(rem.dueDate);

              return (
                <div
                  key={rem._id}
                  className={`flex items-start gap-3 px-5 py-3.5 border-b border-slate-50 last:border-0 transition-colors ${
                    overdue ? 'bg-rose-50/30' : soon ? 'bg-amber-50/30' : ''
                  }`}
                >
                  {/* Date block */}
                  <div className={`flex-shrink-0 w-10 rounded-xl text-center py-1 ${
                    overdue ? 'bg-rose-100' : soon ? 'bg-amber-100' : 'bg-slate-100'
                  }`}>
                    <p className={`text-[8px] font-black uppercase ${overdue ? 'text-rose-500' : soon ? 'text-amber-500' : 'text-slate-400'}`}>
                      {d.toLocaleDateString('en-US', { month: 'short' })}
                    </p>
                    <p className={`text-base font-black leading-none ${overdue ? 'text-rose-600' : soon ? 'text-amber-600' : 'text-slate-700'}`}>
                      {d.getDate()}
                    </p>
                  </div>

                  <Icon className={`w-4 h-4 mt-1 flex-shrink-0 ${overdue ? 'text-rose-500' : soon ? 'text-amber-500' : 'text-slate-400'}`} />

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 line-clamp-1">{rem.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold ${overdue ? 'text-rose-500' : soon ? 'text-amber-500' : 'text-slate-400'}`}>
                        {overdue
                          ? `${Math.abs(days)}d overdue`
                          : days === 0
                            ? 'Today'
                            : `In ${days} day${days !== 1 ? 's' : ''}`}
                      </span>
                      {rem.reportLabel && (
                        <span className="text-[9px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100 font-bold">
                          {rem.reportLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {TYPE_LABEL[rem.reminderType as keyof typeof TYPE_LABEL] ?? rem.reminderType}
                    </p>
                  </div>

                  <button
                    onClick={() => onDismiss(rem._id)}
                    className="p-1.5 rounded-lg text-slate-200 hover:text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0"
                    title="Mark done"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
