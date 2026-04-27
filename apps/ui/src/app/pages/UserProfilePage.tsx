import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BrainCircuit, MessageSquare, ChevronLeft, CalendarDays,
  ShieldAlert, User, PanelRight, X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { getInitials } from '../lib/utils';
import { useDashboardData } from '../hooks/useDashboardData';
import { createHealthEvent, createDietLog, createLifestyle } from '../lib/api';
import { RemindersWidget } from '../components/reminders/RemindersWidget';
import { RecordsBoard } from '../components/records/RecordsBoard';
import { MealPlanWidget } from '../components/meal-plan/MealPlanWidget';
import { buildInsights } from '../components/widgets/AIInsightsWidget';
import { TodayMedicationsWidget } from '../components/widgets/TodayMedicationsWidget';
import { AppointmentsCalendar } from '../components/widgets/AppointmentsCalendar';
import { PageSpinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import type { MealPlan } from '../types';

const AVATAR_GRADS = [
  'from-teal-400 to-emerald-500',
  'from-violet-400 to-indigo-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
  'from-sky-400 to-blue-500',
];
function avatarGrad(name: string) {
  return AVATAR_GRADS[name.charCodeAt(0) % AVATAR_GRADS.length];
}

type RecordTab = 'health' | 'diet' | 'lifestyle';

export function UserProfilePage() {
  const { id: userId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { user, healthEvents, dietLogs, lifestyleRecords, mealPlan: initPlan, reminders, loading, error, refetch, dismissReminder } =
    useDashboardData(userId);

  const [activeTab, setActiveTab]   = useState<RecordTab>('health');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<MealPlan | null>(null);

  // Add-record modals
  const [healthModal, setHealthModal]     = useState(false);
  const [dietModal, setDietModal]         = useState(false);
  const [lifestyleModal, setLifestyleModal] = useState(false);

  // Simple new-record forms
  const [newHealth, setNewHealth]     = useState({ eventType: 'DOCTOR_VISIT', title: '', date: new Date().toISOString().split('T')[0], status: 'ACTIVE' });
  const [newDiet, setNewDiet]         = useState({ mealType: 'BREAKFAST', description: '', date: new Date().toISOString().split('T')[0] });
  const [newLifestyle, setNewLifestyle] = useState({ categories: 'GENERAL', description: '', date: new Date().toISOString().split('T')[0] });

  const activePlan = currentPlan ?? initPlan;
  const insights   = user ? buildInsights(user, healthEvents, dietLogs, lifestyleRecords) : [];

  if (loading) return <PageSpinner />;
  if (error || !user) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-slate-500 font-medium">User not found</p>
      <button onClick={() => navigate('/dashboard')} className="mt-4 text-sm text-teal-600 hover:underline">← Back to Dashboard</button>
    </div>
  );

  const handleAddHealth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createHealthEvent(userId, { eventType: newHealth.eventType, titles: [newHealth.title], date: newHealth.date, status: newHealth.status });
      setHealthModal(false);
      setNewHealth({ eventType: 'DOCTOR_VISIT', title: '', date: new Date().toISOString().split('T')[0], status: 'ACTIVE' });
      refetch();
    } catch {}
  };

  const handleAddDiet = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createDietLog(userId, { mealTypes: [newDiet.mealType], description: newDiet.description, date: newDiet.date, foodItems: [] });
      setDietModal(false);
      setNewDiet({ mealType: 'BREAKFAST', description: '', date: new Date().toISOString().split('T')[0] });
      refetch();
    } catch {}
  };

  const handleAddLifestyle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createLifestyle(userId, { categories: newLifestyle.categories.split(',').map(s => s.trim()).filter(Boolean), description: newLifestyle.description, date: newLifestyle.date });
      setLifestyleModal(false);
      setNewLifestyle({ categories: 'GENERAL', description: '', date: new Date().toISOString().split('T')[0] });
      refetch();
    } catch {}
  };

  const tabs: { id: RecordTab; label: string }[] = [
    { id: 'health',    label: 'Health' },
    { id: 'diet',      label: 'Diet' },
    { id: 'lifestyle', label: 'Lifestyle' },
  ];

  return (
    <>
      {/* Add Health Modal */}
      <Modal open={healthModal} onClose={() => setHealthModal(false)} title="Add Health Record" size="md">
        <form onSubmit={handleAddHealth} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Event Type</label>
            <select value={newHealth.eventType} onChange={e => setNewHealth({ ...newHealth, eventType: e.target.value })}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white">
              {['DOCTOR_VISIT', 'DIAGNOSIS', 'TREATMENT', 'MEDICATION', 'LAB_TEST', 'SYMPTOM'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Title / Summary</label>
            <input value={newHealth.title} onChange={e => setNewHealth({ ...newHealth, title: e.target.value })} required
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-300 focus:outline-none"
              placeholder="e.g. Blood pressure follow-up" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Date</label>
              <input type="date" value={newHealth.date} onChange={e => setNewHealth({ ...newHealth, date: e.target.value })} required
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Status</label>
              <select value={newHealth.status} onChange={e => setNewHealth({ ...newHealth, status: e.target.value })}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white">
                {['ACTIVE', 'RESOLVED', 'ONGOING'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setHealthModal(false)} className="flex-1 py-2.5 text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-sm transition-colors">Add Record</button>
          </div>
        </form>
      </Modal>

      {/* Add Diet Modal */}
      <Modal open={dietModal} onClose={() => setDietModal(false)} title="Add Diet Log" size="md">
        <form onSubmit={handleAddDiet} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Meal Type</label>
            <select value={newDiet.mealType} onChange={e => setNewDiet({ ...newDiet, mealType: e.target.value })}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-300 focus:outline-none bg-white">
              {['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'CRAVINGS', 'PILLS', 'MEDICATION', 'SUGGESTIONS'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Description (one item per line)</label>
            <textarea rows={4} value={newDiet.description} onChange={e => setNewDiet({ ...newDiet, description: e.target.value })} required
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-300 focus:outline-none resize-none"
              placeholder="• Idli with sambar&#10;• Fresh fruit juice" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Date</label>
            <input type="date" value={newDiet.date} onChange={e => setNewDiet({ ...newDiet, date: e.target.value })} required
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-300 focus:outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setDietModal(false)} className="flex-1 py-2.5 text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 text-sm font-bold text-white bg-teal-500 hover:bg-teal-600 rounded-2xl shadow-sm transition-colors">Add Diet Log</button>
          </div>
        </form>
      </Modal>

      {/* Add Lifestyle Modal */}
      <Modal open={lifestyleModal} onClose={() => setLifestyleModal(false)} title="Add Lifestyle Record" size="md">
        <form onSubmit={handleAddLifestyle} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Categories (comma-separated)</label>
            <input value={newLifestyle.categories} onChange={e => setNewLifestyle({ ...newLifestyle, categories: e.target.value })}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-300 focus:outline-none"
              placeholder="EXERCISE, SLEEP, STRESS" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Notes (one item per line)</label>
            <textarea rows={4} value={newLifestyle.description} onChange={e => setNewLifestyle({ ...newLifestyle, description: e.target.value })} required
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-300 focus:outline-none resize-none"
              placeholder="• Walked 30 minutes&#10;• Slept 7 hours" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Date</label>
            <input type="date" value={newLifestyle.date} onChange={e => setNewLifestyle({ ...newLifestyle, date: e.target.value })} required
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-300 focus:outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setLifestyleModal(false)} className="flex-1 py-2.5 text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-2xl shadow-sm transition-colors">Add Record</button>
          </div>
        </form>
      </Modal>

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Back nav */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-teal-600 transition-colors font-medium"
        >
          <ChevronLeft className="w-4 h-4" /> All Members
        </button>

        {/* Header: same grid as content (2+1 cols) so panels align perfectly */}
        <div className="grid grid-cols-3 gap-6 items-start">

          {/* col-span-2 — AI Suggestions + Agent Interaction */}
          <div className="col-span-2 bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 rounded-3xl shadow-lg shadow-indigo-200 text-white overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/15 rounded-xl border border-white/20">
                  <BrainCircuit className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold">AI Health Insights</span>
                <span className="text-[10px] text-white/50 font-medium">Personalised for {user.name}</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/chat/${userId}`)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 font-bold text-xs rounded-2xl shadow hover:bg-indigo-50 transition-all"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Ask AI Health Agent
                <BrainCircuit className="w-3.5 h-3.5 opacity-60" />
              </motion.button>
            </div>

            <div className="p-6">
              <div className={`grid gap-4 ${insights.length === 1 ? 'grid-cols-1' : insights.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {insights.map((ins, i) => {
                  const Icon = ins.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 bg-white/10 rounded-2xl p-4 border border-white/10 hover:bg-white/15 transition-colors">
                      <div className={`p-2 ${ins.bg} rounded-xl flex-shrink-0`}>
                        <Icon className={`w-4 h-4 ${ins.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/60 mb-1">{ins.title}</p>
                        <p className="text-sm text-white/90 leading-relaxed">{ins.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* col-span-1 — User info (conditions only) */}
          <div className="col-span-1">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-1.5 bg-gradient-to-r ${avatarGrad(user.name)}`} />
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGrad(user.name)} flex items-center justify-center text-white font-extrabold text-lg shadow flex-shrink-0`}>
                    {getInitials(user.name)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-slate-900 truncate">{user.name}</h2>
                    <div className="flex items-center gap-1 text-slate-400 mt-0.5">
                      <CalendarDays className="w-3 h-3" />
                      <span className="text-[10px]">{new Date(user.dob).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    {user.biologicalSex && (
                      <div className="flex items-center gap-1 text-slate-400">
                        <User className="w-3 h-3" />
                        <span className="text-[10px]">{user.biologicalSex}</span>
                      </div>
                    )}
                  </div>
                </div>

                {(user.medicalConditions ?? []).length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <ShieldAlert className="w-3 h-3 text-rose-500 flex-shrink-0" />
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Conditions</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {user.medicalConditions!.map(c => (
                        <span key={c} className="text-[10px] font-bold px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl leading-snug">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Reminders */}
        {reminders.length > 0 && (
          <RemindersWidget reminders={reminders} userId={userId} onDismiss={dismissReminder} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left col: Records board */}
          <div className={`${sidebarOpen ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-0 transition-all`}>
            {/* Tab bar + sidebar toggle */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex flex-1 bg-white border border-slate-200 rounded-2xl p-1 gap-1 shadow-sm">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                      activeTab === tab.id
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSidebarOpen(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-2xl border text-xs font-bold shadow-sm transition-all flex-shrink-0 ${
                  sidebarOpen
                    ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200'
                }`}
                title={sidebarOpen ? 'Hide panel' : 'Show panel'}
              >
                {sidebarOpen ? <X className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            {activeTab === 'health' && (
              <RecordsBoard
                type="health"
                userId={userId}
                healthEvents={healthEvents}
                onAdd={() => setHealthModal(true)}
                onRefetch={refetch}
              />
            )}
            {activeTab === 'diet' && (
              <RecordsBoard
                type="diet"
                userId={userId}
                dietLogs={dietLogs}
                onAdd={() => setDietModal(true)}
                onRefetch={refetch}
              />
            )}
            {activeTab === 'lifestyle' && (
              <RecordsBoard
                type="lifestyle"
                userId={userId}
                lifestyleRecords={lifestyleRecords}
                onAdd={() => setLifestyleModal(true)}
                onRefetch={refetch}
              />
            )}
          </div>

          {/* Right col: Today's meds, appointments, meal plan (hidden by default) */}
          {sidebarOpen && (
            <div className="space-y-5">
              <TodayMedicationsWidget
                dietLogs={dietLogs}
                healthEvents={healthEvents}
              />

              <AppointmentsCalendar
                reminders={reminders}
                userId={userId}
                onDismiss={dismissReminder}
              />

              <MealPlanWidget
                userId={userId}
                mealPlan={activePlan}
                loading={false}
                onPlanUpdated={plan => setCurrentPlan(plan)}
              />

              {/* Quick stats */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quick Stats</p>
                {[
                  { label: 'Health Records', count: healthEvents.length,    color: 'bg-indigo-500' },
                  { label: 'Diet Logs',      count: dietLogs.length,         color: 'bg-teal-500' },
                  { label: 'Lifestyle',      count: lifestyleRecords.length, color: 'bg-blue-500' },
                ].map(stat => (
                  <div key={stat.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full ${stat.color}`} />
                      <span className="text-xs font-medium text-slate-600">{stat.label}</span>
                    </div>
                    <span className="text-sm font-black text-slate-800">{stat.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
