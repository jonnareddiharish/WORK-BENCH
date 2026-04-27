import { useParams, useNavigate } from 'react-router-dom';
import { BrainCircuit, ChevronLeft, ShieldAlert, Stethoscope } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { buildInsights } from '../components/widgets/AIInsightsWidget';
import { ChatPanel } from '../components/chat/ChatPanel';
import { PageSpinner } from '../components/ui/Spinner';

export function AIInsightsPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, healthEvents, dietLogs, lifestyleRecords, loading } = useDashboardData(userId);

  if (loading || !user) return <PageSpinner />;

  const allInsights = buildInsights(user, healthEvents, dietLogs, lifestyleRecords, 20);

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Back nav */}
      <button
        onClick={() => navigate(`/dashboard/${userId}`)}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-600 transition-colors font-medium self-start flex-shrink-0"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Profile
      </button>

      {/* Split layout */}
      <div className="flex gap-6 flex-1 min-h-0">

        {/* ── Left: All Insights ── */}
        <div className="w-[45%] flex flex-col min-h-0">
          {/* Panel header */}
          <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 rounded-3xl shadow-lg shadow-indigo-200 text-white overflow-hidden flex-shrink-0 mb-4">
            <div className="px-6 py-5 flex items-center gap-3">
              <div className="p-2.5 bg-white/15 rounded-xl border border-white/20">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold">AI Health Insights</h2>
                <p className="text-[11px] text-white/60 mt-0.5">Personalised for {user.name}</p>
              </div>
            </div>

            {/* User conditions summary strip */}
            {(user.medicalConditions ?? []).length > 0 && (
              <div className="px-6 pb-5">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldAlert className="w-3 h-3 text-white/60" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-white/50">Active Conditions</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {user.medicalConditions!.map(c => (
                    <span key={c} className="text-[10px] font-bold px-2.5 py-1 bg-white/15 text-white border border-white/20 rounded-full">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Insight cards — scrollable */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {allInsights.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Stethoscope className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-slate-400 font-medium text-sm">No insights available yet</p>
                <p className="text-xs text-slate-300 mt-1">Add health records, diet logs, and lifestyle data to generate insights.</p>
              </div>
            ) : (
              allInsights.map((ins, i) => {
                const Icon = ins.icon;
                return (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-indigo-200 transition-all">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 ${ins.bg} rounded-xl flex-shrink-0 shadow-sm`}>
                        <Icon className={`w-5 h-5 ${ins.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">{ins.title}</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{ins.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Health stats footer */}
            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 mt-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Health Summary</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Health Records', count: healthEvents.length,     color: 'bg-indigo-500' },
                  { label: 'Diet Logs',       count: dietLogs.length,          color: 'bg-teal-500' },
                  { label: 'Lifestyle',       count: lifestyleRecords.length,  color: 'bg-blue-500' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="text-2xl font-black text-slate-800">{s.count}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                      <p className="text-[10px] text-slate-400 font-medium">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Chat ── */}
        <ChatPanel userId={userId} className="flex-1" />
      </div>
    </div>
  );
}
