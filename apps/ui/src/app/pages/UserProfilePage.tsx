import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BrainCircuit, MessageSquare, ChevronLeft, CalendarDays,
  ShieldAlert, Pill, User,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { getInitials } from '../lib/utils';
import { useDashboardData } from '../hooks/useDashboardData';
import { createHealthEvent, createDietLog, createLifestyle } from '../lib/api';
import { RemindersWidget } from '../components/reminders/RemindersWidget';
import { RecordsBoard } from '../components/records/RecordsBoard';
import { MealPlanWidget } from '../components/meal-plan/MealPlanWidget';
import { AIChatPanel } from '../components/chat/AIChatPanel';
import { AIInsightsWidget } from '../components/widgets/AIInsightsWidget';
import { TodayMedicationsWidget } from '../components/widgets/TodayMedicationsWidget';
import { AppointmentsCalendar } from '../components/widgets/AppointmentsCalendar';
import { PageSpinner, SkeletonCard } from '../components/ui/Spinner';
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
  const [chatOpen, setChatOpen]     = useState(false);
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
      {/* AI Chat */}
      <AIChatPanel userId={userId} isOpen={chatOpen} onClose={() => setChatOpen(false)} />

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

        {/* Profile header */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className={`h-2 bg-gradient-to-r ${avatarGrad(user.name)}`} />
          <div className="p-6 flex items-center gap-5 flex-wrap">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${avatarGrad(user.name)} flex items-center justify-center text-white font-extrabold text-2xl shadow-lg flex-shrink-0`}>
              {getInitials(user.name)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-slate-900">{user.name}</h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span className="text-xs">{new Date(user.dob).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
                {user.biologicalSex && (
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <User className="w-3.5 h-3.5" />
                    <span className="text-xs">{user.biologicalSex}</span>
                  </div>
                )}
              </div>
              {(user.medicalConditions ?? []).length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <ShieldAlert className="w-3 h-3 text-rose-500 flex-shrink-0" />
                  {user.medicalConditions!.map(c => (
                    <span key={c} className="text-[10px] font-bold px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-full">{c}</span>
                  ))}
                </div>
              )}
              {(user.medications ?? []).length > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Pill className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                  {user.medications!.map(m => (
                    <span key={m} className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full">{m}</span>
                  ))}
                </div>
              )}
            </div>

            {/* AI Chat button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-sm rounded-2xl shadow-lg shadow-indigo-200 transition-all flex-shrink-0"
            >
              <MessageSquare className="w-4 h-4" />
              AI Health Agent
              <BrainCircuit className="w-4 h-4 opacity-70" />
            </motion.button>
          </div>
        </div>

        {/* Reminders */}
        {reminders.length > 0 && (
          <RemindersWidget reminders={reminders} userId={userId} onDismiss={dismissReminder} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left col: Records board */}
          <div className="lg:col-span-2 space-y-0">
            {/* Tab bar */}
            <div className="flex bg-white border border-slate-200 rounded-2xl p-1 mb-4 gap-1 shadow-sm">
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

          {/* Right col: AI insights, widgets, meal plan */}
          <div className="space-y-5">
            <AIInsightsWidget
              user={user}
              healthEvents={healthEvents}
              dietLogs={dietLogs}
              lifestyleRecords={lifestyleRecords}
              onOpenChat={() => setChatOpen(true)}
            />

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
        </div>
      </div>
    </>
  );
}
