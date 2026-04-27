import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { PageSpinner } from '../components/ui/Spinner';
import type { RecordType, DetailEvs, RecordItem } from '../types';
import {
  X, Edit3, Stethoscope, Pill, FlaskConical, Leaf, Activity,
  Clock, Info, ShieldAlert, MapPin, Link2, BrainCircuit,
  RefreshCw, CheckCircle2, Plus, Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { formatDateLong, formatDate } from '../lib/utils';
import { reanalyzeHealth, reanalyzeDiet, reanalyzeLifestyle } from '../lib/api';
import type { MedicationItem, TestItem, MedLogItem, DoctorInfo } from '../types';

const API_BASE = 'http://localhost:3000/api';
async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
  return res.json();
}

// ─── Inline Detail Content (same as RecordDetailPanel but without modal wrapper) ──

function DetailContent({
  type, evs, record, userId, onRefetch,
}: {
  type: RecordType; evs?: DetailEvs; record?: RecordItem;
  userId: string; onRefetch: () => void;
}) {
  const [mode, setMode]         = useState<'view' | 'edit'>('view');
  const [hgEdit, setHgEdit]     = useState<{
    visitConditions: string[]; visitDescription: string; visitStatus: string; visitNotes: string;
    medications: MedicationItem[]; prescriptionStatus: string;
    testResults: TestItem[]; testStatus: string;
  } | null>(null);
  const [dietEdit, setDietEdit]         = useState<RecordItem | null>(null);
  const [lifestyleEdit, setLifestyleEdit] = useState<RecordItem | null>(null);
  const [analysis, setAnalysis]         = useState<{ analysis: string; profileUpdated?: boolean } | null>(null);
  const [saving, setSaving]             = useState(false);

  const visitEv = evs?.find(e => e.eventType === 'DOCTOR_VISIT');
  const rxEv    = evs?.find(e => e.eventType === 'PRESCRIPTION');
  const testEv  = evs?.find(e => e.eventType === 'TEST_RESULTS');
  const docInfo: DoctorInfo = visitEv?.details?.doctorInfo ?? rxEv?.details?.doctorInfo ?? {};

  const startEdit = () => {
    setAnalysis(null);
    if (type === 'health' && evs) {
      setHgEdit({
        visitConditions:    visitEv?.details?.conditions  ?? [],
        visitDescription:   visitEv?.description          ?? '',
        visitStatus:        visitEv?.status               ?? 'ACTIVE',
        visitNotes:         visitEv?.details?.notes       ?? '',
        medications:        (rxEv?.details?.medications   ?? []) as MedicationItem[],
        prescriptionStatus: rxEv?.status                  ?? 'ACTIVE',
        testResults:        (testEv?.details?.testResults ?? []) as TestItem[],
        testStatus:         testEv?.status                ?? 'ACTIVE',
      });
    } else if (type === 'diet' && record) {
      setDietEdit({ ...record, medicationItems: (record.medicationItems ?? []).map(m => ({ ...m })) });
    } else if (type === 'lifestyle' && record) {
      setLifestyleEdit({ ...record });
    }
    setMode('edit');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (type === 'health' && hgEdit && evs) {
        const updates: { ev: DetailEvs[0]; body: unknown }[] = [];
        if (visitEv) updates.push({ ev: visitEv, body: { description: hgEdit.visitDescription, status: hgEdit.visitStatus, details: { ...visitEv.details, conditions: hgEdit.visitConditions, notes: hgEdit.visitNotes } } });
        if (rxEv)    updates.push({ ev: rxEv,    body: { status: hgEdit.prescriptionStatus, details: { ...rxEv.details, medications: hgEdit.medications } } });
        if (testEv)  updates.push({ ev: testEv,  body: { status: hgEdit.testStatus, details: { ...testEv.details, testResults: hgEdit.testResults } } });
        const saved: { old: DetailEvs[0]; new: unknown }[] = [];
        for (const { ev, body } of updates) {
          const updated = await put(`/users/${userId}/health-events/${ev._id}`, body);
          saved.push({ old: ev, new: updated });
        }
        if (saved.length > 0) {
          const res = await reanalyzeHealth(userId, { oldEvent: saved[0].old, newEvent: saved[0].new });
          setAnalysis(res);
        }
        onRefetch(); setMode('view');
      } else if (type === 'diet' && dietEdit && record) {
        const newLog = await put(`/users/${userId}/diet-logs/${dietEdit._id}`, dietEdit);
        const res = await reanalyzeDiet(userId, { oldLog: record, newLog });
        setAnalysis(res);
        onRefetch(); setMode('view');
      } else if (type === 'lifestyle' && lifestyleEdit && record) {
        const newRec = await put(`/users/${userId}/lifestyle/${lifestyleEdit._id}`, lifestyleEdit);
        const res = await reanalyzeLifestyle(userId, { oldRec: record, newRec });
        setAnalysis(res);
        onRefetch(); setMode('view');
      }
    } finally { setSaving(false); }
  };

  const headerGrad =
    type === 'health'                       ? 'from-indigo-600 to-violet-700'
    : record?.cardType === 'MEDICATION'     ? 'from-indigo-600 to-purple-700'
    : record?.cardType === 'SUGGESTIONS'    ? 'from-teal-500 to-emerald-600'
    : record?.cardType === 'MANDATORY_FOOD' ? 'from-emerald-500 to-green-600'
    : type === 'lifestyle'                  ? 'from-blue-600 to-indigo-700'
    :                                         'from-slate-700 to-slate-800';

  const panelLabel =
    type === 'health'                       ? 'Health Report'
    : record?.cardType === 'MEDICATION'     ? 'Medication Card'
    : record?.cardType === 'SUGGESTIONS'    ? 'Diet Suggestions'
    : record?.cardType === 'MANDATORY_FOOD' ? 'Mandatory Food'
    :                                         'Lifestyle Record';

  const displayDate = formatDateLong((evs?.[0]?.date || record?.date) ?? '');

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className={`bg-gradient-to-r ${headerGrad} px-8 pt-8 pb-6 text-white`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {type === 'health'    && <Stethoscope className="w-4 h-4 opacity-60" />}
              {type === 'diet' && record?.cardType === 'MEDICATION' && <Pill className="w-4 h-4 opacity-60" />}
              {type === 'diet' && record?.cardType !== 'MEDICATION' && <Leaf className="w-4 h-4 opacity-60" />}
              {type === 'lifestyle' && <Activity className="w-4 h-4 opacity-60" />}
              <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{panelLabel}</span>
              {mode === 'edit' && <span className="ml-1 text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full border border-white/30">Editing</span>}
            </div>
            {type === 'health' && docInfo.name ? (
              <h2 className="text-2xl font-bold">
                {docInfo.name}
                {docInfo.specialty && <span className="text-white/60 font-normal text-base ml-2">· {docInfo.specialty}</span>}
              </h2>
            ) : (
              <h2 className="text-2xl font-bold">{panelLabel}</h2>
            )}
            {type === 'health' && (docInfo.hospital || docInfo.address) && (
              <p className="flex items-center gap-1 text-sm text-white/60 mt-1">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                {[docInfo.hospital, docInfo.address].filter(Boolean).join(' — ')}
              </p>
            )}
            {record?.reportLabel && (
              <div className="flex items-center gap-1 mt-2">
                <Link2 className="w-3.5 h-3.5 opacity-50" />
                <span className="text-xs font-bold opacity-60">{record.reportLabel}</span>
              </div>
            )}
            <p className="text-xs mt-2 opacity-50">{displayDate}</p>
          </div>
          {mode === 'view' && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/15 hover:bg-white/25 rounded-xl text-sm font-bold transition-colors border border-white/20 flex-shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-8 space-y-8">

        {/* ── HEALTH VIEW ── */}
        {type === 'health' && mode === 'view' && (
          <>
            {visitEv && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-rose-100 rounded-lg"><Stethoscope className="w-4 h-4 text-rose-600" /></div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">Diagnoses &amp; Findings</span>
                </div>
                {(visitEv.details?.conditions ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {visitEv.details!.conditions!.map((c, i) => (
                      <span key={i} className="px-3 py-1 bg-rose-50 text-rose-700 text-sm font-bold rounded-full border border-rose-200">{c}</span>
                    ))}
                  </div>
                )}
                {(visitEv.details?.symptoms ?? []).length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Symptoms</p>
                    <p className="text-sm text-slate-600">{visitEv.details!.symptoms!.join(', ')}</p>
                  </div>
                )}
                {(visitEv.details?.injections ?? []).length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-black uppercase text-amber-500 tracking-wider mb-1">Injections at Visit</p>
                    <p className="text-sm text-amber-700 font-medium">{visitEv.details!.injections!.join(', ')}</p>
                  </div>
                )}
                {visitEv.details?.notes && (
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Doctor Notes</p>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{visitEv.details.notes}</p>
                  </div>
                )}
              </section>
            )}

            {rxEv && (rxEv.details?.medications ?? []).length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-indigo-100 rounded-lg"><Pill className="w-4 h-4 text-indigo-600" /></div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">Prescription</span>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>{['Medication', 'Dosage', 'Frequency', 'Duration', 'Route'].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-black uppercase tracking-wider text-slate-400 text-[10px]">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rxEv.details!.medications!.map((med, i) => (
                        <tr key={i} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-800">{med.name}</span>
                            {med.isDaily && <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded-full border border-teal-100">DAILY</span>}
                            {med.instructions && <p className="text-xs text-slate-400 italic mt-0.5">{med.instructions}</p>}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{med.dosage}</td>
                          <td className="px-4 py-3 text-slate-600">{med.frequency}</td>
                          <td className="px-4 py-3 text-slate-400">{med.duration || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${med.route === 'INJECTION' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                              {med.route || 'ORAL'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {testEv && (testEv.details?.testResults ?? []).length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-emerald-100 rounded-lg"><FlaskConical className="w-4 h-4 text-emerald-600" /></div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">Test Results</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {testEv.details!.testResults!.map((t, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800">{t.testName}</p>
                        {t.value          && <p className="text-sm text-slate-600 mt-0.5">Value: <span className="font-semibold">{t.value}</span></p>}
                        {t.referenceRange && <p className="text-xs text-slate-400 mt-0.5">Ref: {t.referenceRange}</p>}
                        {t.interpretation && <p className="text-xs text-slate-500 mt-0.5 italic">{t.interpretation}</p>}
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${
                        t.status === 'ABNORMAL'   ? 'bg-rose-50 text-rose-600 border-rose-200'
                        : t.status === 'BORDERLINE' ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      }`}>{t.status || '—'}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── DIET VIEW ── */}
        {type === 'diet' && mode === 'view' && record && (
          <>
            {(record.medicationItems ?? []).length > 0 ? (
              <div className="space-y-5">
                {record.medicationItems!.map((med, i) => (
                  <div key={i} className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="bg-indigo-50 px-5 py-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-800">{med.name}</p>
                        {med.dosage && <p className="text-sm text-slate-500 mt-0.5">{med.dosage}</p>}
                      </div>
                      {med.duration && <span className="text-[10px] font-black bg-indigo-600 text-white px-3 py-1 rounded-full">{med.duration}</span>}
                    </div>
                    <div className="px-5 py-4 space-y-3">
                      {med.instructions && (
                        <div className="flex items-start gap-2">
                          <Clock className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-slate-600">{med.instructions}</p>
                        </div>
                      )}
                      {(med.startDate || med.endDate) && (
                        <div className="flex gap-3">
                          {med.startDate && <div className="flex-1 bg-teal-50 rounded-xl p-3 border border-teal-100"><p className="text-[9px] font-black uppercase text-teal-500 tracking-wider mb-1">Start</p><p className="text-sm font-bold text-teal-800">{formatDate(med.startDate)}</p></div>}
                          {med.endDate   && <div className="flex-1 bg-rose-50 rounded-xl p-3 border border-rose-100"><p className="text-[9px] font-black uppercase text-rose-500 tracking-wider mb-1">End</p><p className="text-sm font-bold text-rose-800">{formatDate(med.endDate)}</p></div>}
                        </div>
                      )}
                      {(med.sideEffects ?? []).length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2"><Info className="w-4 h-4 text-amber-500" /><p className="text-[10px] font-black uppercase text-amber-600 tracking-wider">Side Effects</p></div>
                          <div className="flex flex-wrap gap-2">{med.sideEffects!.map((se, j) => <span key={j} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">{se}</span>)}</div>
                        </div>
                      )}
                      {(med.avoidWhileTaking ?? []).length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2"><ShieldAlert className="w-4 h-4 text-rose-500" /><p className="text-[10px] font-black uppercase text-rose-600 tracking-wider">Avoid While Taking</p></div>
                          <div className="flex flex-wrap gap-2">{med.avoidWhileTaking!.map((a, j) => <span key={j} className="text-xs bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full">{a}</span>)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {(record.description ?? '').split('\n').filter(l => l.trim()).map((line, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                    <p className="text-sm text-slate-700 leading-relaxed">{line.replace(/^[•\-*]\s*/, '')}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── LIFESTYLE VIEW ── */}
        {type === 'lifestyle' && mode === 'view' && record && (
          <>
            {(record.categories ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {record.categories!.map((cat, i) => (
                  <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 text-sm font-bold rounded-full border border-blue-200">{cat}</span>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {(record.description ?? '').split('\n').filter(l => l.trim()).map((line, i) => (
                <div key={i} className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700 leading-relaxed">{line.replace(/^[•\-*]\s*/, '')}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── HEALTH EDIT ── */}
        {type === 'health' && mode === 'edit' && hgEdit && (
          <div className="space-y-6">
            {visitEv && (
              <div>
                <div className="flex items-center gap-2 mb-3"><Stethoscope className="w-4 h-4 text-rose-500" /><span className="text-xs font-black uppercase tracking-wider text-slate-500">Diagnoses &amp; Visit</span></div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Conditions (comma-separated)</label>
                <input className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-300 focus:outline-none mb-3"
                  value={hgEdit.visitConditions.join(', ')} placeholder="e.g. Hypertension, Type 2 Diabetes"
                  onChange={e => setHgEdit({ ...hgEdit, visitConditions: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Visit Summary</label>
                <textarea rows={2} className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-300 focus:outline-none resize-none mb-3"
                  value={hgEdit.visitDescription} onChange={e => setHgEdit({ ...hgEdit, visitDescription: e.target.value })} />
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Doctor Notes</label>
                <textarea rows={3} className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-300 focus:outline-none resize-none mb-3"
                  value={hgEdit.visitNotes} onChange={e => setHgEdit({ ...hgEdit, visitNotes: e.target.value })} />
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
                  <select className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                    value={hgEdit.visitStatus} onChange={e => setHgEdit({ ...hgEdit, visitStatus: e.target.value })}>
                    {['ACTIVE', 'RESOLVED', 'ONGOING'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}
            {hgEdit.medications.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3"><Pill className="w-4 h-4 text-indigo-500" /><span className="text-xs font-black uppercase tracking-wider text-slate-500">Medications</span></div>
                <div className="space-y-3">
                  {hgEdit.medications.map((med, i) => (
                    <div key={i} className="flex items-start gap-2 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        {(['name', 'dosage', 'frequency', 'duration', 'instructions'] as const).map((field, fi) => (
                          <input key={field}
                            className={`${fi === 0 || fi === 4 ? 'col-span-2' : ''} text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-300`}
                            value={(med as any)[field] || ''} placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                            onChange={e => { const m = [...hgEdit.medications]; (m[i] as any)[field] = e.target.value; setHgEdit({ ...hgEdit, medications: m }); }} />
                        ))}
                      </div>
                      <button onClick={() => setHgEdit({ ...hgEdit, medications: hgEdit.medications.filter((_, j) => j !== i) })}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 mt-1 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {hgEdit.testResults.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3"><FlaskConical className="w-4 h-4 text-emerald-500" /><span className="text-xs font-black uppercase tracking-wider text-slate-500">Test Results</span></div>
                <div className="space-y-2">
                  {hgEdit.testResults.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-sm font-semibold text-slate-700 w-40 flex-shrink-0 truncate">{t.testName}</span>
                      <input className="flex-1 text-sm px-3 py-1.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-300" value={t.value || ''} placeholder="Value"
                        onChange={e => { const tr = [...hgEdit.testResults]; tr[i] = { ...tr[i], value: e.target.value }; setHgEdit({ ...hgEdit, testResults: tr }); }} />
                      <input className="w-32 text-sm px-3 py-1.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-300" value={t.referenceRange || ''} placeholder="Ref range"
                        onChange={e => { const tr = [...hgEdit.testResults]; tr[i] = { ...tr[i], referenceRange: e.target.value }; setHgEdit({ ...hgEdit, testResults: tr }); }} />
                      <select className="text-xs border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none bg-white" value={t.status}
                        onChange={e => { const tr = [...hgEdit.testResults]; tr[i] = { ...tr[i], status: e.target.value }; setHgEdit({ ...hgEdit, testResults: tr }); }}>
                        {['NORMAL', 'ABNORMAL', 'BORDERLINE'].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DIET EDIT ── */}
        {type === 'diet' && mode === 'edit' && dietEdit && (
          <div className="space-y-4">
            {(dietEdit.medicationItems ?? []).length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">Medications</span>
                  <button onClick={() => setDietEdit({ ...dietEdit, medicationItems: [...(dietEdit.medicationItems ?? []), { name: '', dosage: '', duration: '', instructions: '', sideEffects: [], avoidWhileTaking: [] } as MedLogItem] })}
                    className="text-xs text-indigo-600 font-bold hover:text-indigo-800 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add medication
                  </button>
                </div>
                {dietEdit.medicationItems!.map((med, i) => (
                  <div key={i} className="border border-slate-200 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-500">Medication {i + 1}</span>
                      <button onClick={() => setDietEdit({ ...dietEdit, medicationItems: dietEdit.medicationItems!.filter((_, j) => j !== i) })}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {(['name', 'dosage', 'duration', 'instructions'] as const).map((field, fi) => (
                        <input key={field}
                          className={`${fi === 0 || fi === 3 ? 'col-span-2' : ''} text-sm px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-300`}
                          value={(med as any)[field] || ''} placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                          onChange={e => { const m = [...dietEdit.medicationItems!]; (m[i] as any)[field] = e.target.value; setDietEdit({ ...dietEdit, medicationItems: m }); }} />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Food / advice items (one per line)</label>
                <textarea rows={8} className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-300 focus:outline-none resize-none"
                  value={dietEdit.description || ''} onChange={e => setDietEdit({ ...dietEdit, description: e.target.value })}
                  placeholder={'• Take a probiotic after breakfast\n• Avoid processed foods'} />
              </>
            )}
          </div>
        )}

        {/* ── LIFESTYLE EDIT ── */}
        {type === 'lifestyle' && mode === 'edit' && lifestyleEdit && (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Advice items (one per line)</label>
              <textarea rows={8} className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-300 focus:outline-none resize-none"
                value={lifestyleEdit.description || ''} onChange={e => setLifestyleEdit({ ...lifestyleEdit, description: e.target.value })}
                placeholder={'• Walk 30 minutes daily\n• Avoid screen time before bed'} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Categories (comma-separated)</label>
              <input className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-300 focus:outline-none"
                value={(lifestyleEdit.categories ?? []).join(', ')}
                onChange={e => setLifestyleEdit({ ...lifestyleEdit, categories: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                placeholder="EXERCISE, SLEEP, STRESS, GENERAL" />
            </div>
          </div>
        )}

        {/* Analysis result */}
        {analysis && (
          <div className={`p-5 rounded-2xl border text-sm ${analysis.profileUpdated ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
            <p className="text-[10px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BrainCircuit className="w-3.5 h-3.5 text-indigo-500" />
              AI Analysis
              {analysis.profileUpdated && <span className="text-emerald-600 ml-1">· Profile Updated</span>}
            </p>
            <p className="leading-relaxed whitespace-pre-wrap">{analysis.analysis}</p>
          </div>
        )}

        {/* Footer buttons */}
        {mode === 'edit' && (
          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button onClick={() => { setMode('view'); setAnalysis(null); }}
              className="flex-1 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-2xl transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analysing…</> : <><CheckCircle2 className="w-4 h-4" /> Save &amp; Analyse</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export function RecordDetailPage() {
  const { id: userId = '', type = 'health' } = useParams<{ id: string; type: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const groupId = searchParams.get('group') ?? '';
  const recordId = searchParams.get('record') ?? '';

  const { healthEvents, dietLogs, lifestyleRecords, loading, refetch } = useDashboardData(userId);

  if (loading) return <PageSpinner />;

  const back = () => navigate(`/dashboard/${userId}`);

  let evs: DetailEvs | undefined;
  let record: RecordItem | undefined;

  if (type === 'health') {
    const allEvs = healthEvents.filter(e =>
      groupId ? (e.reportGroupId === groupId || e._id === groupId) : e._id === recordId
    );
    evs = allEvs as DetailEvs;
  } else if (type === 'diet') {
    const found = dietLogs.find(d => d._id === recordId);
    if (found) record = found as unknown as RecordItem;
  } else if (type === 'lifestyle') {
    const found = lifestyleRecords.find(r => r._id === recordId);
    if (found) record = found as unknown as RecordItem;
  }

  if (!evs?.length && !record) {
    return (
      <div className="max-w-3xl mx-auto py-24 text-center">
        <p className="text-slate-400 font-medium">Record not found.</p>
        <button onClick={back} className="mt-4 text-sm text-teal-600 hover:underline">← Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={back} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-teal-600 transition-colors font-medium">
        <ChevronLeft className="w-4 h-4" /> Back to Dashboard
      </button>
      <DetailContent
        type={type as RecordType}
        evs={evs}
        record={record}
        userId={userId}
        onRefetch={refetch}
      />
    </div>
  );
}
