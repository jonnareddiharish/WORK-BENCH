import { Bell, CalendarCheck, FlaskRound, AlarmClock, CheckCircle2, Link2 } from 'lucide-react';
import { getDaysUntil, formatDate } from '../../lib/utils';
import type { Reminder } from '../../types';
import { dismissReminder as apiDismiss } from '../../lib/api';

interface Props {
  reminders: Reminder[];
  userId: string;
  onDismiss: (id: string) => void;
}

const typeIcon = {
  APPOINTMENT:    CalendarCheck,
  FOLLOW_UP_TEST: FlaskRound,
  MEDICATION_END: AlarmClock,
};

const typeLabel = {
  APPOINTMENT:    'Appointment',
  FOLLOW_UP_TEST: 'Follow-up Test',
  MEDICATION_END: 'Medication End',
};

export function RemindersWidget({ reminders, userId, onDismiss }: Props) {
  if (reminders.length === 0) return null;

  const handleDismiss = async (id: string) => {
    try {
      await apiDismiss(userId, id);
      onDismiss(id);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <section className="bg-white rounded-3xl border border-amber-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-amber-50">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-100 rounded-xl">
            <Bell className="w-4 h-4 text-amber-600" />
          </div>
          <span className="text-sm font-bold text-slate-800">Reminders</span>
          <span className="text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">{reminders.length}</span>
        </div>
      </div>

      <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
        {reminders.map(rem => {
          const days = getDaysUntil(rem.dueDate);
          const overdue = days < 0;
          const soon    = days >= 0 && days <= 7;
          const Icon    = typeIcon[rem.reminderType as keyof typeof typeIcon] ?? AlarmClock;

          return (
            <div
              key={rem._id}
              className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${overdue ? 'bg-rose-50/40' : soon ? 'bg-amber-50/40' : ''}`}
            >
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${overdue ? 'text-rose-500' : soon ? 'text-amber-500' : 'text-slate-400'}`} />

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 line-clamp-1">{rem.title}</p>

                <p className={`text-[10px] font-bold mt-0.5 ${overdue ? 'text-rose-600' : soon ? 'text-amber-600' : 'text-slate-400'}`}>
                  {overdue
                    ? `${Math.abs(days)}d overdue`
                    : days === 0
                      ? 'Today'
                      : `In ${days} day${days !== 1 ? 's' : ''}`}
                  {' · '}{formatDate(rem.dueDate)}
                </p>

                {rem.reportLabel && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold text-indigo-500 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full">
                    <Link2 className="w-2.5 h-2.5" />{rem.reportLabel}
                  </span>
                )}
              </div>

              <button
                onClick={() => handleDismiss(rem._id)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0"
                title="Mark as done"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
