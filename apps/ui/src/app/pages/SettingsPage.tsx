import { useState } from 'react';
import { Settings, BrainCircuit, Cpu, Zap, Wind, CheckCircle2 } from 'lucide-react';
import { getDefaultModel, saveDefaultModel } from '../lib/modelPreference';
import type { ChatModelId } from '../types';

const MODELS: { id: ChatModelId; label: string; note: string; description: string; icon: typeof Cpu; ring: string; badge: string }[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    note: 'Anthropic',
    description: 'Best accuracy for medical reasoning, medication analysis, and report parsing. Recommended for health use cases.',
    icon: BrainCircuit,
    ring: 'ring-violet-300 border-violet-200',
    badge: 'bg-violet-100 text-violet-700',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    note: 'OpenAI',
    description: 'Fast and capable. Good for general health questions and diet recommendations.',
    icon: Cpu,
    ring: 'ring-emerald-300 border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B',
    note: 'Meta · Groq',
    description: 'Open-source model served via Groq for ultra-low latency. Great for quick lookups.',
    icon: Zap,
    ring: 'ring-amber-300 border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    note: 'Google',
    description: 'Multimodal — can analyse images. Ideal when sharing medical scan images or photos of reports.',
    icon: Wind,
    ring: 'ring-sky-300 border-sky-200',
    badge: 'bg-sky-100 text-sky-700',
  },
];

export function SettingsPage() {
  const [defaultModel, setDefaultModel] = useState<ChatModelId>(getDefaultModel());
  const [saved, setSaved] = useState(false);

  const handleSelect = (id: ChatModelId) => {
    setDefaultModel(id);
    saveDefaultModel(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-black text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Configure your application preferences</p>
      </div>

      {/* AI Model section */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 rounded-xl">
              <BrainCircuit className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Default AI Model</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Used when opening AI Health Agent chat</p>
            </div>
          </div>
          {saved && (
            <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              Saved
            </div>
          )}
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MODELS.map(m => {
            const Icon = m.icon;
            const isSelected = defaultModel === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleSelect(m.id)}
                className={`relative text-left p-5 rounded-2xl border-2 transition-all hover:shadow-md ${
                  isSelected
                    ? `${m.ring} ring-2 bg-white shadow-sm`
                    : 'border-slate-100 hover:border-slate-200 bg-slate-50/50'
                }`}
              >
                {isSelected && (
                  <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-indigo-600" />
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-xl ${isSelected ? m.badge : 'bg-slate-100 text-slate-500'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{m.label}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSelected ? m.badge : 'bg-slate-100 text-slate-500'}`}>
                      {m.note}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{m.description}</p>
              </button>
            );
          })}
        </div>

        <div className="px-6 pb-5">
          <p className="text-[11px] text-slate-400">
            You can also switch models during any chat session. The default applies only when opening a new conversation.
          </p>
        </div>
      </section>

      {/* Placeholder for future settings */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden opacity-50">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
          <div className="p-2.5 bg-slate-100 rounded-xl">
            <Settings className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-600">Notifications & Reminders</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Coming soon</p>
          </div>
        </div>
        <div className="px-6 py-8 text-center">
          <p className="text-xs text-slate-300">Notification preferences will appear here</p>
        </div>
      </section>
    </div>
  );
}
