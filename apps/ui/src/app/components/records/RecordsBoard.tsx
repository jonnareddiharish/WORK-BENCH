import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope, Pill, FlaskConical, Link2, Building2,
  Leaf, Activity, Plus, Trash2, LayoutGrid, Clock,
} from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { deleteHealthEvent, deleteDietLog, deleteLifestyle } from '../../lib/api';
import { MedItemRow } from '../diet/MedItemRow';
import type {
  RecordType, HealthEvent, DietLog, LifestyleRecord,
} from '../../types';

interface Props {
  type: RecordType;
  userId: string;
  healthEvents?: HealthEvent[];
  dietLogs?: DietLog[];
  lifestyleRecords?: LifestyleRecord[];
  onAdd: () => void;
  onRefetch: () => void;
}

type ViewMode = 'board' | 'timeline';

const MEAL_COLORS: Record<string, string> = {
  MEDICATION:     'bg-indigo-50 border-indigo-200 text-indigo-700',
  SUGGESTIONS:    'bg-teal-50 border-teal-200 text-teal-700',
  MANDATORY_FOOD: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  BREAKFAST:      'bg-amber-50 border-amber-200 text-amber-700',
  LUNCH:          'bg-orange-50 border-orange-200 text-orange-700',
  DINNER:         'bg-rose-50 border-rose-200 text-rose-700',
  SNACK:          'bg-sky-50 border-sky-200 text-sky-700',
  CRAVINGS:       'bg-pink-50 border-pink-200 text-pink-700',
  PILLS:          'bg-purple-50 border-purple-200 text-purple-700',
};

const CAT_COLORS: Record<string, string> = {
  EXERCISE: 'bg-green-50 text-green-700 border-green-200',
  SLEEP:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  STRESS:   'bg-rose-50 text-rose-700 border-rose-200',
  DIET:     'bg-teal-50 text-teal-700 border-teal-200',
  GENERAL:  'bg-slate-100 text-slate-600 border-slate-200',
};

// ─── Health board (grouped by reportGroupId) ─────────────────────────────────

function HealthBoard({
  events, userId, onRefetch,
}: { events: HealthEvent[]; userId: string; onRefetch: () => void }) {
  const navigate = useNavigate();

  const sorted = useMemo(() =>
    [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [events]
  );

  const userEvents   = sorted.filter(e => !e.source || e.source === 'USER');
  const doctorEvents = sorted.filter(e => e.source === 'DOCTOR' || e.source === 'AI');

  const groups = useMemo(() => {
    const map = new Map<string, HealthEvent[]>();
    for (const ev of doctorEvents) {
      const key = ev.reportGroupId || ev._id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries());
  }, [doctorEvents]);

  const handleDelete = async (evId: string) => {
    try { await deleteHealthEvent(userId, evId); onRefetch(); } catch {}
  };

  const openHealth = (evs: HealthEvent[]) => {
    const groupId = evs[0].reportGroupId || evs[0]._id;
    navigate(`/dashboard/${userId}/health?group=${groupId}`);
  };

  return (
    <div className="space-y-6">
      {/* User-logged events */}
      {userEvents.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">My Logs</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {userEvents.map(ev => (
              <div
                key={ev._id}
                onClick={() => openHealth([ev])}
                className="group relative bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-teal-300 hover:shadow-md transition-all"
              >
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(ev._id); }}
                    className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-200 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-[10px] text-slate-400 font-medium mb-1">{formatDate(ev.date)}</p>
                  <p className="text-sm font-bold text-slate-800 line-clamp-2 pr-6">{(ev.titles || []).join(', ')}</p>
                  <span className={`mt-2 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${ev.status === 'ACTIVE' ? 'bg-amber-50 text-amber-600 border border-amber-200' : ev.status === 'RESOLVED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                    {ev.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Doctor report groups */}
        {groups.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Doctor Reports</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groups.map(([key, evs]) => {
                const visitEv = evs.find(e => e.eventType === 'DOCTOR_VISIT');
                const rxEv    = evs.find(e => e.eventType === 'PRESCRIPTION');
                const testEv  = evs.find(e => e.eventType === 'TEST_RESULTS');
                const docInfo = visitEv?.details?.doctorInfo ?? rxEv?.details?.doctorInfo;
                const isGroup = !!evs[0].reportGroupId;

                if (!isGroup) {
                  const ev = evs[0];
                  return (
                    <div
                      key={key}
                      onClick={() => openHealth(evs)}
                      className="group relative bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
                    >
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(ev._id); }}
                        className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-200 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <p className="text-[10px] text-slate-400 font-medium mb-1">{formatDate(ev.date)}</p>
                      <p className="text-sm font-bold text-slate-800 line-clamp-2 pr-6">{(ev.titles || []).join(', ')}</p>
                      <span className="mt-2 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">{ev.eventType}</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={key}
                    onClick={() => openHealth(evs)}
                    className="bg-white border border-indigo-100 rounded-2xl overflow-hidden cursor-pointer hover:border-indigo-300 hover:shadow-lg transition-all group"
                  >
                    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3 flex items-center justify-between gap-2 border-b border-indigo-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link2 className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-wider">Visit Group</span>
                        <span className="text-[9px] text-indigo-400">· {formatDate(evs[0].date)}</span>
                      </div>
                      {docInfo?.name && (
                        <span className="text-[10px] font-bold text-indigo-700 truncate max-w-[100px] flex-shrink-0">{docInfo.name}</span>
                      )}
                    </div>

                    {(docInfo?.hospital || docInfo?.address) && (
                      <div className="px-4 py-2 flex items-center gap-1.5 border-b border-slate-100 bg-white/60">
                        <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <span className="text-[10px] text-slate-500 line-clamp-1">{[docInfo.hospital, docInfo.address].filter(Boolean).join(' — ')}</span>
                      </div>
                    )}

                    {visitEv && (
                      <div className="px-4 py-2.5 border-b border-slate-50 flex items-start gap-2">
                        <Stethoscope className="w-3.5 h-3.5 text-rose-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Findings</p>
                          <p className="text-xs font-semibold text-slate-700 line-clamp-2">{visitEv.details?.conditions?.join(', ') || visitEv.titles?.[0]}</p>
                        </div>
                      </div>
                    )}
                    {rxEv && (
                      <div className="px-4 py-2.5 border-b border-slate-50 flex items-start gap-2">
                        <Pill className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Prescription</p>
                          <p className="text-xs font-semibold text-slate-700 line-clamp-1">{rxEv.details?.medications?.map(m => m.name).join(', ') || rxEv.titles?.[0]}</p>
                        </div>
                      </div>
                    )}
                    {testEv && (
                      <div className="px-4 py-2.5 flex items-start gap-2">
                        <FlaskConical className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Tests</p>
                          <p className="text-xs font-semibold text-slate-700 line-clamp-1">{testEv.details?.testResults?.map(t => t.testName).join(', ') || testEv.titles?.[0]}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {userEvents.length === 0 && groups.length === 0 && (
          <div className="py-16 text-center">
            <Stethoscope className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No health records yet</p>
            <p className="text-xs text-slate-300 mt-1">Add your first record using the + button</p>
          </div>
        )}
    </div>
  );
}

// ─── Diet board ───────────────────────────────────────────────────────────────

function DietBoard({
  logs, userId, onRefetch,
}: { logs: DietLog[]; userId: string; onRefetch: () => void }) {
  const navigate = useNavigate();

  const sorted = useMemo(() =>
    [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [logs]
  );

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await deleteDietLog(userId, id); onRefetch(); } catch {}
  };

  return (
    <>
      {sorted.length === 0 ? (
        <div className="py-16 text-center">
          <Leaf className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No diet logs yet</p>
          <p className="text-xs text-slate-300 mt-1">Log a meal or medication card to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sorted.map(log => {
            const cardKey = log.cardType || log.mealTypes?.[0] || 'GENERAL';
            const colorCls = MEAL_COLORS[cardKey] ?? 'bg-slate-50 border-slate-200 text-slate-700';
            const isMed = log.cardType === 'MEDICATION';

            return (
              <div
                key={log._id}
                onClick={() => navigate(`/dashboard/${userId}/diet?record=${log._id}`)}
                className={`group relative border rounded-2xl overflow-hidden cursor-pointer hover:shadow-md transition-all ${colorCls}`}
              >
                <div className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {(log.mealTypes || []).map(t => (
                        <span key={t} className="text-[9px] font-black uppercase tracking-wider bg-white/60 px-1.5 py-0.5 rounded-full border border-current/20">{t}</span>
                      ))}
                    </div>
                    <p className="text-[10px] font-medium opacity-60">{formatDate(log.date)}</p>
                    {log.reportLabel && (
                      <div className="flex items-center gap-1 mt-1">
                        <Link2 className="w-2.5 h-2.5 opacity-50" />
                        <span className="text-[9px] font-bold opacity-60 truncate">{log.reportLabel}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={e => handleDelete(log._id, e)}
                    className="p-1.5 rounded-lg hover:bg-white/60 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isMed && (log.medicationItems ?? []).length > 0 ? (
                  <div className="px-3 pb-3 space-y-1.5" onClick={e => e.stopPropagation()}>
                    {log.medicationItems!.slice(0, 2).map((med, i) => (
                      <MedItemRow
                        key={i}
                        med={med}
                        accentBg="bg-indigo-100"
                        accentText="text-indigo-800"
                      />
                    ))}
                    {(log.medicationItems ?? []).length > 2 && (
                      <p className="text-[10px] text-center opacity-50 font-medium">
                        +{log.medicationItems!.length - 2} more medications
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="px-4 pb-3 space-y-1">
                    {(log.description ?? '').split('\n').filter(l => l.trim()).slice(0, 3).map((line, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-40 mt-1.5 flex-shrink-0" />
                        <p className="text-xs opacity-80 line-clamp-1">{line.replace(/^[•\-*]\s*/, '')}</p>
                      </div>
                    ))}
                    {(log.description ?? '').split('\n').filter(l => l.trim()).length > 3 && (
                      <p className="text-[10px] text-center opacity-40 font-medium">Click to see all</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Lifestyle board ──────────────────────────────────────────────────────────

function LifestyleBoard({
  records, userId, onRefetch,
}: { records: LifestyleRecord[]; userId: string; onRefetch: () => void }) {
  const navigate = useNavigate();

  const sorted = useMemo(() =>
    [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [records]
  );

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await deleteLifestyle(userId, id); onRefetch(); } catch {}
  };

  return (
    <>
      {sorted.length === 0 ? (
        <div className="py-16 text-center">
          <Activity className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No lifestyle records yet</p>
          <p className="text-xs text-slate-300 mt-1">Track sleep, exercise, stress, and more</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sorted.map(rec => (
            <div
              key={rec._id}
              onClick={() => navigate(`/dashboard/${userId}/lifestyle?record=${rec._id}`)}
              className="group relative bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
            >
              <button
                onClick={e => handleDelete(rec._id, e)}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-200 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {(rec.categories || []).map(cat => (
                  <span key={cat} className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${CAT_COLORS[cat] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>{cat}</span>
                ))}
              </div>

              <p className="text-[10px] text-slate-400 font-medium mb-1.5">{formatDate(rec.date)}</p>

              <div className="space-y-1 pr-6">
                {(rec.description ?? '').split('\n').filter(l => l.trim()).slice(0, 3).map((line, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                    <p className="text-xs text-slate-600 line-clamp-1">{line.replace(/^[•\-*]\s*/, '')}</p>
                  </div>
                ))}
              </div>

              {rec.reportLabel && (
                <div className="flex items-center gap-1 mt-2">
                  <Link2 className="w-2.5 h-2.5 text-indigo-400" />
                  <span className="text-[9px] font-bold text-indigo-500 truncate">{rec.reportLabel}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Timeline view (unified across types) ────────────────────────────────────

type TimelineEntry = {
  date: string;
  label: string;
  type: RecordType;
  color: string;
  id: string;
};

function TimelineView({
  healthEvents = [], dietLogs = [], lifestyleRecords = [],
}: { healthEvents?: HealthEvent[]; dietLogs?: DietLog[]; lifestyleRecords?: LifestyleRecord[] }) {
  const entries: TimelineEntry[] = useMemo(() => {
    const list: TimelineEntry[] = [
      ...healthEvents.map(e => ({
        date:  e.date,
        label: (e.titles || []).join(', ') || e.eventType,
        type:  'health' as RecordType,
        color: 'bg-indigo-500',
        id:    e._id,
      })),
      ...dietLogs.map(d => ({
        date:  d.date,
        label: d.reportLabel || (d.mealTypes || []).join(', ') || 'Diet log',
        type:  'diet' as RecordType,
        color: 'bg-teal-500',
        id:    d._id,
      })),
      ...lifestyleRecords.map(r => ({
        date:  r.date,
        label: (r.categories || []).join(', ') || 'Lifestyle',
        type:  'lifestyle' as RecordType,
        color: 'bg-blue-500',
        id:    r._id,
      })),
    ];
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [healthEvents, dietLogs, lifestyleRecords]);

  if (entries.length === 0) {
    return (
      <div className="py-16 text-center">
        <Clock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 font-medium">No records to display</p>
      </div>
    );
  }

  return (
    <div className="relative pl-8">
      <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-200 rounded-full" />
      <div className="space-y-4">
        {entries.map(entry => (
          <div key={entry.id} className="relative flex items-start gap-4">
            <div className={`absolute -left-5 w-3 h-3 rounded-full ${entry.color} ring-2 ring-white flex-shrink-0 mt-1.5`} />
            <div className="flex-1 bg-white border border-slate-100 rounded-xl p-3 hover:border-slate-300 hover:shadow-sm transition-all">
              <p className="text-[10px] text-slate-400 font-medium mb-0.5">{formatDate(entry.date)}</p>
              <p className="text-sm font-semibold text-slate-800 line-clamp-1">{entry.label}</p>
              <span className={`mt-1 inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                entry.type === 'health'    ? 'bg-indigo-50 text-indigo-600'
                : entry.type === 'diet'   ? 'bg-teal-50 text-teal-600'
                :                           'bg-blue-50 text-blue-600'
              }`}>{entry.type}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function RecordsBoard({
  type, userId, healthEvents = [], dietLogs = [], lifestyleRecords = [], onAdd, onRefetch,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('board');

  const title =
    type === 'health'    ? 'Health Records'
    : type === 'diet'   ? 'Diet Logs'
    :                     'Lifestyle Records';

  const count =
    type === 'health'   ? healthEvents.length
    : type === 'diet'   ? dietLogs.length
    :                     lifestyleRecords.length;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          {count > 0 && (
            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{count}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-slate-100 rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('board')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'board' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
              title="Board view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'timeline' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
              title="Timeline view"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 sm:p-6">
        {viewMode === 'timeline' ? (
          <TimelineView
            healthEvents={type === 'health' ? healthEvents : undefined}
            dietLogs={type === 'diet' ? dietLogs : undefined}
            lifestyleRecords={type === 'lifestyle' ? lifestyleRecords : undefined}
          />
        ) : type === 'health' ? (
          <HealthBoard events={healthEvents} userId={userId} onRefetch={onRefetch} />
        ) : type === 'diet' ? (
          <DietBoard logs={dietLogs} userId={userId} onRefetch={onRefetch} />
        ) : (
          <LifestyleBoard records={lifestyleRecords} userId={userId} onRefetch={onRefetch} />
        )}
      </div>
    </div>
  );
}
