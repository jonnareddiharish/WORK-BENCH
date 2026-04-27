import { useState } from 'react';
import {
  BrainCircuit, MessageSquare, Sparkles, TrendingUp,
  Apple, Activity, ShieldCheck, RefreshCw,
} from 'lucide-react';
import type { User, HealthEvent, DietLog, LifestyleRecord } from '../../types';

interface Props {
  user: User;
  healthEvents: HealthEvent[];
  dietLogs: DietLog[];
  lifestyleRecords: LifestyleRecord[];
  onOpenChat: () => void;
}

export interface Insight {
  icon: typeof Activity;
  color: string;
  bg: string;
  title: string;
  body: string;
}

export function buildInsights(
  user: User,
  healthEvents: HealthEvent[],
  dietLogs: DietLog[],
  lifestyleRecords: LifestyleRecord[],
): Insight[] {
  const insights: Insight[] = [];
  const conditions = user.medicalConditions ?? [];
  const meds       = user.medications ?? [];

  // Condition-specific
  if (conditions.some(c => /diabet/i.test(c))) {
    insights.push({
      icon: Apple, color: 'text-emerald-600', bg: 'bg-emerald-50',
      title: 'Diabetes Management',
      body: 'Monitor carb intake at each meal. Prefer low-GI foods like whole grains, legumes and non-starchy vegetables.',
    });
  }
  if (conditions.some(c => /hypertension|blood pressure/i.test(c))) {
    insights.push({
      icon: Activity, color: 'text-rose-600', bg: 'bg-rose-50',
      title: 'Blood Pressure Control',
      body: 'Reduce sodium intake to < 2g/day. Daily 30-min walks and stress management can significantly lower systolic pressure.',
    });
  }
  if (conditions.some(c => /esophag|gastritis|gerd|ulcer|duodenit/i.test(c))) {
    insights.push({
      icon: ShieldCheck, color: 'text-teal-600', bg: 'bg-teal-50',
      title: 'GI Health',
      body: 'Eat smaller, frequent meals. Avoid spicy foods, caffeine and lying down within 2h of eating to reduce reflux symptoms.',
    });
  }

  // Med count insight
  if (meds.length >= 3) {
    insights.push({
      icon: ShieldCheck, color: 'text-indigo-600', bg: 'bg-indigo-50',
      title: 'Medication Adherence',
      body: `You have ${meds.length} active medications. Set a consistent daily schedule and use the medication reminder to avoid missed doses.`,
    });
  }

  // Diet quality
  const recentDiet = dietLogs.slice(0, 5);
  if (recentDiet.length > 0) {
    insights.push({
      icon: Apple, color: 'text-amber-600', bg: 'bg-amber-50',
      title: 'Nutrition Tip',
      body: 'Your recent diet logs show activity. Aim to log every meal for better AI-powered recommendations and personalized meal plans.',
    });
  }

  // Lifestyle
  const hasExercise = lifestyleRecords.some(r => r.categories?.includes('EXERCISE'));
  if (!hasExercise && lifestyleRecords.length > 0) {
    insights.push({
      icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50',
      title: 'Physical Activity',
      body: 'No exercise logs detected recently. Even a 20-min walk 3× per week can improve cardiovascular health and energy levels.',
    });
  }

  // Trend observation
  if (healthEvents.length > 0) {
    insights.push({
      icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50',
      title: 'Health Trend',
      body: `You have ${healthEvents.length} health record${healthEvents.length !== 1 ? 's' : ''} logged. Regular tracking helps detect patterns early — keep it up!`,
    });
  }

  // Fallback
  if (insights.length === 0) {
    insights.push({
      icon: Sparkles, color: 'text-teal-600', bg: 'bg-teal-50',
      title: 'Getting Started',
      body: 'Add your health records, diet logs, and lifestyle notes to unlock personalised AI health insights.',
    });
  }

  return insights.slice(0, 3);
}

export function AIInsightsWidget({ user, healthEvents, dietLogs, lifestyleRecords, onOpenChat }: Props) {
  const [idx, setIdx] = useState(0);
  const insights = buildInsights(user, healthEvents, dietLogs, lifestyleRecords);
  const current  = insights[idx];
  const Icon     = current.icon;

  return (
    <section className="bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 rounded-3xl shadow-lg shadow-indigo-200 text-white overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-white/15 rounded-xl border border-white/20">
            <BrainCircuit className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold">AI Health Insights</span>
        </div>
        <div className="flex items-center gap-1.5">
          {insights.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/60'}`}
            />
          ))}
        </div>
      </div>

      <div className="px-5 py-5 min-h-[120px]">
        <div className="flex items-start gap-3">
          <div className={`p-2 ${current.bg} rounded-xl flex-shrink-0`}>
            <Icon className={`w-4 h-4 ${current.color}`} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-white/60 mb-1">{current.title}</p>
            <p className="text-sm text-white/90 leading-relaxed">{current.body}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pb-4 flex items-center gap-2">
        <button
          onClick={onOpenChat}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white text-indigo-700 font-bold text-xs rounded-2xl shadow hover:shadow-md hover:bg-indigo-50 transition-all active:scale-95"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Ask AI Agent
        </button>
        <button
          onClick={() => setIdx(i => (i + 1) % insights.length)}
          className="p-2.5 bg-white/15 hover:bg-white/25 border border-white/20 rounded-2xl transition-colors"
          title="Next insight"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
}
