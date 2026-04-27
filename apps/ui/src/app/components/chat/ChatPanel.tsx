import { useState, useRef, useEffect } from 'react';
import {
  BrainCircuit, ChevronRight, Paperclip, FileScan,
  Cpu, Zap, Wind, X, Settings, CheckCircle2, Star,
} from 'lucide-react';
import { API_BASE } from '../../lib/api';
import { getDefaultModel, saveDefaultModel } from '../../lib/modelPreference';
import type { ChatMessage, ChatModelId } from '../../types';

const MODELS: { id: ChatModelId; label: string; provider: string; description: string; icon: typeof Cpu; activeClass: string; ring: string }[] = [
  { id: 'claude-sonnet-4-6',       label: 'Claude Sonnet 4.6', provider: 'Anthropic', description: 'Best accuracy for medical reasoning, medication analysis, and report parsing.', icon: BrainCircuit, activeClass: 'bg-violet-100 text-violet-700 border-violet-300', ring: 'ring-violet-300 border-violet-200' },
  { id: 'gpt-4o-mini',             label: 'GPT-4o mini',        provider: 'OpenAI',    description: 'Fast and capable. Good for general health questions and diet recommendations.', icon: Cpu,          activeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300', ring: 'ring-emerald-300 border-emerald-200' },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',      provider: 'Meta · Groq', description: 'Open-source model via Groq for ultra-low latency. Great for quick queries.',  icon: Zap,          activeClass: 'bg-amber-100 text-amber-700 border-amber-300',         ring: 'ring-amber-300 border-amber-200' },
  { id: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash',   provider: 'Google',    description: 'Multimodal — can analyse images. Ideal for sharing medical scan photos.',       icon: Wind,         activeClass: 'bg-sky-100 text-sky-700 border-sky-300',                ring: 'ring-sky-300 border-sky-200' },
];

interface Props {
  userId: string;
  className?: string;
}

export function ChatPanel({ userId, className = '' }: Props) {
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [input, setInput]           = useState('');
  const [model, setModel]           = useState<ChatModelId>(getDefaultModel());
  const [submitting, setSubmitting] = useState(false);
  const [attachedFile, setFile]     = useState<File | null>(null);
  const [filePreview, setPreview]   = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen]       = useState(false);
  const [defaultModel, setDefaultModelState] = useState<ChatModelId>(getDefaultModel());
  const [savedPulse, setSavedPulse]           = useState<ChatModelId | null>(null);

  const endRef   = useRef<HTMLDivElement>(null);
  const fileRef  = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const clearFile = () => {
    setFile(null);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) setPreview(URL.createObjectURL(f));
    else setPreview(null);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !attachedFile) return;
    if (submitting) return;

    const fileSnap    = attachedFile;
    const previewSnap = filePreview;
    const userMsg: ChatMessage = {
      role: 'user', content: text,
      attachedFile: fileSnap ? { name: fileSnap.name, type: fileSnap.type, preview: previewSnap ?? undefined } : undefined,
    };
    const aiPlaceholder: ChatMessage = { role: 'ai', content: '', isStreaming: true };

    setMessages(prev => [...prev, userMsg, aiPlaceholder]);
    setInput('');
    clearFile();
    setSubmitting(true);
    const historyForApi = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      if (fileSnap) {
        const form = new FormData();
        form.append('file', fileSnap);
        form.append('message', text);
        form.append('history', JSON.stringify(historyForApi));
        form.append('model', model);
        const res = await fetch(`${API_BASE}/agent/${userId}/chat-with-file`, { method: 'POST', body: form });
        if (res.ok) {
          const data = await res.json();
          setMessages(prev => [...prev.slice(0, -1), { role: 'ai', content: data.reply, intent: data.intent, retrievedCount: data.retrievedCount, model: data.model, isStreaming: false }]);
        }
      } else {
        const res = await fetch(`${API_BASE}/agent/${userId}/chat/stream`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history: historyForApi, model }),
        });
        if (!res.ok || !res.body) throw new Error('Stream failed');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            if (!part.trim()) continue;
            let eventType = 'message', eventData = '';
            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              else if (line.startsWith('data: ')) eventData = line.slice(6);
            }
            if (!eventData) continue;
            try {
              const data = JSON.parse(eventData);
              if (eventType === 'node')  setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], streamingStep: data.label }; return u; });
              else if (eventType === 'token') setMessages(prev => { const u = [...prev]; const last = u[u.length - 1]; u[u.length - 1] = { ...last, content: (last.content ?? '') + data.token }; return u; });
              else if (eventType === 'done')  setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], isStreaming: false, streamingStep: undefined, intent: data.intent, retrievedCount: data.retrievedCount, model: data.model }; return u; });
              else if (eventType === 'error') setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'ai', content: data.message || 'An error occurred.', isStreaming: false }; return u; });
            } catch { /* ignore */ }
          }
        }
      }
    } catch {
      setMessages(prev => [...prev.slice(0, -1), { role: 'ai', content: 'Something went wrong. Please try again.', isStreaming: false }]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = (id: ChatModelId) => {
    saveDefaultModel(id);
    setDefaultModelState(id);
    setSavedPulse(id);
    setTimeout(() => setSavedPulse(null), 1800);
  };

  const activeModel = MODELS.find(m => m.id === model)!;

  return (
    <div className={`bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0 ${className}`}>

      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-gradient-to-r from-indigo-600 to-violet-700 px-5 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold">AI Health Agent</p>
              <p className="text-[10px] text-white/60">Powered by {activeModel.label}</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(v => !v)}
            title="Model settings"
            className={`p-2 rounded-xl border transition-all ${settingsOpen ? 'bg-white/25 border-white/40' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20 hover:text-white'}`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Settings panel ── */}
      {settingsOpen && (
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50 min-h-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-black text-slate-800">AI Model</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Click a card to use · ★ to set as default</p>
            </div>
            <button onClick={() => setSettingsOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2.5">
            {MODELS.map(m => {
              const Icon = m.icon;
              const active = model === m.id;
              const isDefault = defaultModel === m.id;
              const justSaved = savedPulse === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={`relative group cursor-pointer p-3.5 rounded-2xl border-2 transition-all hover:shadow-sm ${active ? `${m.ring} ring-2 bg-white` : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <button
                    onClick={e => { e.stopPropagation(); handleSetDefault(m.id); setModel(m.id); }}
                    className={`absolute top-2.5 right-2.5 p-0.5 rounded transition-all ${isDefault ? 'text-amber-500' : 'text-slate-200 hover:text-amber-400'}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isDefault ? 'fill-amber-400' : ''}`} />
                  </button>
                  <div className="flex items-center gap-2.5 pr-6 mb-1.5">
                    <div className={`p-1.5 rounded-lg ${active ? m.activeClass : 'bg-slate-100 text-slate-500'}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{m.label}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${active ? m.activeClass : 'bg-slate-100 text-slate-400'}`}>{m.provider}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{m.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {active    && <span className="flex items-center gap-1 text-[9px] font-bold text-indigo-600"><CheckCircle2 className="w-3 h-3" /> Active</span>}
                    {justSaved && <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600"><Star className="w-3 h-3 fill-amber-400" /> Saved as default</span>}
                    {isDefault && !justSaved && <span className="flex items-center gap-1 text-[9px] font-bold text-amber-500 ml-auto"><Star className="w-3 h-3 fill-amber-400" /> Default</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      {!settingsOpen && (
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 min-h-0">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                <BrainCircuit className="w-8 h-8 text-indigo-400" />
              </div>
              <h4 className="text-base font-bold text-slate-700 mb-1.5">How can I help today?</h4>
              <p className="text-xs text-slate-400 leading-relaxed">Ask about your medications, diet recommendations, or share a medical report.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.role === 'ai' && !msg.isStreaming && (msg.intent?.length || msg.retrievedCount != null) && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5 px-1">
                    {msg.model && (() => { const m = MODELS.find(cm => cm.id === msg.model); return m ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.activeClass}`}>{m.label}</span> : null; })()}
                    {(msg.intent || []).filter(i => i !== 'OTHER' && i !== 'QUERY').map(i => (
                      <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 uppercase tracking-wide">{i.replace(/_/g, ' ')}</span>
                    ))}
                    {msg.retrievedCount != null && msg.retrievedCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600">{msg.retrievedCount} records retrieved</span>
                    )}
                  </div>
                )}
                {msg.role === 'ai' && msg.isStreaming && msg.streamingStep && (
                  <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 mb-1.5 rounded-full bg-indigo-50 text-indigo-500 border border-indigo-100">
                    <span className="flex gap-0.5">{[0,150,300].map(d => <span key={d} className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</span>
                    {msg.streamingStep}
                  </span>
                )}
                {msg.attachedFile && (
                  <div className="mb-1.5 max-w-[75%]">
                    {msg.attachedFile.preview
                      ? <img src={msg.attachedFile.preview} alt={msg.attachedFile.name} className="rounded-2xl rounded-tr-none max-h-40 object-cover border border-indigo-200 shadow-sm" />
                      : <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500 text-white rounded-2xl rounded-tr-none text-xs font-medium"><FileScan className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate max-w-[140px]">{msg.attachedFile.name}</span></div>
                    }
                  </div>
                )}
                {(msg.content || (msg.role === 'ai' && msg.isStreaming)) && (
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-sm whitespace-pre-wrap leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'}`}>
                    {msg.content}
                    {msg.isStreaming && <span className="inline-block w-[2px] h-[1em] bg-indigo-400 ml-0.5 align-middle animate-pulse" />}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      )}

      {/* ── Input ── */}
      <div className="flex-shrink-0 border-t border-slate-100 bg-white">
        {attachedFile && (
          <div className="px-4 pt-3 pb-0">
            <div className="flex items-center gap-3 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl">
              {filePreview
                ? <img src={filePreview} alt="preview" className="h-9 w-9 rounded-lg object-cover border border-indigo-200 flex-shrink-0" />
                : <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0"><FileScan className="w-4 h-4 text-indigo-500" /></div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-indigo-700 truncate">{attachedFile.name}</p>
                <p className="text-[10px] text-indigo-400">{attachedFile.type.startsWith('image/') ? 'Image — Claude Vision will extract medical data' : 'PDF — text will be extracted and analysed'}</p>
              </div>
              <button onClick={clearFile} className="p-1 hover:bg-indigo-100 rounded-lg transition-colors text-indigo-400"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
        <div className="p-3.5 flex items-center gap-2.5">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="hidden" onChange={handleFileChange} />
          <button onClick={() => fileRef.current?.click()} disabled={submitting} title="Attach image or PDF"
            className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${attachedFile ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500'} disabled:opacity-40`}>
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <input
            ref={inputRef} type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={attachedFile ? 'Add a note (optional)...' : 'Ask your AI health agent...'}
            className="flex-1 px-4 py-2.5 bg-slate-50 rounded-2xl text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-200 focus:bg-white focus:outline-none transition-all"
          />
          <button onClick={handleSend} disabled={submitting || (!input.trim() && !attachedFile)}
            className="p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
