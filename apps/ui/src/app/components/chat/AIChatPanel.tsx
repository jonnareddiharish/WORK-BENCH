import { useState, useRef, useEffect } from 'react';
import {
  X, BrainCircuit, ChevronRight, Paperclip, FileScan,
  Cpu, Zap, Wind, CheckCircle2, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE } from '../../lib/api';
import type { ChatMessage, ChatModelId } from '../../types';

interface Props {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

const MODELS: { id: ChatModelId; label: string; note: string; icon: typeof Cpu; activeClass: string }[] = [
  { id: 'claude-sonnet-4-6',       label: 'Claude',  note: 'Anthropic Claude Sonnet 4.6 — best accuracy',  icon: BrainCircuit, activeClass: 'bg-violet-100 text-violet-700 border-violet-300' },
  { id: 'gpt-4o-mini',             label: 'GPT-4o',  note: 'OpenAI GPT-4o mini — fast & capable',           icon: Cpu,          activeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { id: 'llama-3.3-70b-versatile', label: 'Llama',   note: 'Meta Llama 3.3 70B via Groq — open-source',    icon: Zap,          activeClass: 'bg-amber-100 text-amber-700 border-amber-300' },
  { id: 'gemini-1.5-flash',        label: 'Gemini',  note: 'Google Gemini 1.5 Flash — multimodal',          icon: Wind,         activeClass: 'bg-sky-100 text-sky-700 border-sky-300' },
];

export function AIChatPanel({ userId, isOpen, onClose }: Props) {
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [input, setInput]           = useState('');
  const [model, setModel]           = useState<ChatModelId>('claude-sonnet-4-6');
  const [submitting, setSubmitting] = useState(false);
  const [attachedFile, setFile]     = useState<File | null>(null);
  const [filePreview, setPreview]   = useState<string | null>(null);

  const endRef      = useRef<HTMLDivElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

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

    const fileSnap = attachedFile;
    const previewSnap = filePreview;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
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
          setMessages(prev => [
            ...prev.slice(0, -1),
            { role: 'ai', content: data.reply, intent: data.intent, retrievedCount: data.retrievedCount, model: data.model, isStreaming: false },
          ]);
        }
      } else {
        const res = await fetch(`${API_BASE}/agent/${userId}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history: historyForApi, model }),
        });
        if (!res.ok || !res.body) throw new Error('Stream failed');

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            if (!part.trim()) continue;
            let eventType = 'message';
            let eventData = '';
            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              else if (line.startsWith('data: ')) eventData = line.slice(6);
            }
            if (!eventData) continue;
            try {
              const data = JSON.parse(eventData);
              if (eventType === 'node') {
                setMessages(prev => {
                  const u    = [...prev];
                  const last = u[u.length - 1];
                  u[u.length - 1] = { ...last, steps: [...(last.steps ?? []), { label: data.label as string, done: false }] };
                  return u;
                });
              } else if (eventType === 'token') {
                setMessages(prev => {
                  const u    = [...prev];
                  const last = u[u.length - 1];
                  u[u.length - 1] = { ...last, content: (last.content ?? '') + (data.token as string) };
                  return u;
                });
              } else if (eventType === 'done') {
                setMessages(prev => {
                  const u    = [...prev];
                  const last = u[u.length - 1];
                  u[u.length - 1] = {
                    ...last,
                    isStreaming: false,
                    steps: (last.steps ?? []).map(s => ({ ...s, done: true })),
                    intent: data.intent as string[],
                    retrievedCount: data.retrievedCount as number,
                    model: data.model as string,
                  };
                  return u;
                });
              } else if (eventType === 'error') {
                setMessages(prev => {
                  const u    = [...prev];
                  const last = u[u.length - 1];
                  u[u.length - 1] = {
                    ...last,
                    steps: (last.steps ?? []).map(s => ({ ...s, done: true })),
                    content: (data.message as string) || 'An error occurred.',
                    isStreaming: false,
                  };
                  return u;
                });
              }
            } catch { /* ignore malformed SSE */ }
          }
        }
      }
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'ai', content: 'Something went wrong. Please try again.', isStreaming: false },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const activeModel = MODELS.find(m => m.id === model)!;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-slate-900/50 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.96, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 10 }}
            className="bg-white rounded-3xl w-full max-w-2xl h-[90vh] max-h-[800px] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex-shrink-0 bg-gradient-to-r from-indigo-600 to-violet-700 px-5 py-4 text-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
                    <BrainCircuit className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">AI Health Agent</p>
                    <p className="text-[10px] text-white/60">Powered by {activeModel.label}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Model selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {MODELS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    disabled={submitting}
                    title={m.note}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-all disabled:opacity-40 ${
                      model === m.id ? m.activeClass : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-8">
                  <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                    <BrainCircuit className="w-8 h-8 text-indigo-400" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-700 mb-2">How can I help today?</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">Ask about your medications, diet recommendations, or share a medical report to have it parsed automatically.</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {/* AI metadata pills */}
                    {msg.role === 'ai' && !msg.isStreaming && (msg.intent?.length || msg.retrievedCount != null) && (
                      <div className="flex flex-wrap gap-1.5 mb-1.5 px-1">
                        {msg.model && (() => {
                          const m = MODELS.find(cm => cm.id === msg.model);
                          return m ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.activeClass}`}>{m.label}</span> : null;
                        })()}
                        {(msg.intent || []).filter(i => i !== 'OTHER' && i !== 'QUERY').map(i => (
                          <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 uppercase tracking-wide">
                            {i.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {msg.retrievedCount != null && msg.retrievedCount > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600 tracking-wide">
                            {msg.retrievedCount} records retrieved
                          </span>
                        )}
                      </div>
                    )}

                    {/* Processing steps history */}
                    {msg.role === 'ai' && (msg.steps?.length ?? 0) > 0 && (
                      <div className="flex flex-col gap-1 mb-1.5 px-1">
                        {msg.steps!.map((step, si) => (
                          <span key={si} className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border w-fit ${step.done ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-indigo-50 text-indigo-500 border-indigo-100'}`}>
                            {step.done ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin" />}
                            {step.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Attached file */}
                    {msg.attachedFile && (
                      <div className="mb-1.5 max-w-[75%]">
                        {msg.attachedFile.preview ? (
                          <img src={msg.attachedFile.preview} alt={msg.attachedFile.name} className="rounded-2xl rounded-tr-none max-h-40 object-cover border border-indigo-200 shadow-sm" />
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500 text-white rounded-2xl rounded-tr-none text-xs font-medium shadow-sm">
                            <FileScan className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate max-w-[160px]">{msg.attachedFile.name}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bubble */}
                    {(msg.content || (msg.role === 'ai' && msg.isStreaming)) && (
                      <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm shadow-sm whitespace-pre-wrap leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-tr-none'
                          : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                      }`}>
                        {msg.content}
                        {msg.isStreaming && (
                          <span className="inline-block w-[2px] h-[1em] bg-indigo-400 ml-0.5 align-middle animate-pulse" />
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>

            {/* Input area */}
            <div className="flex-shrink-0 border-t border-slate-100 bg-white">
              {/* File preview */}
              {attachedFile && (
                <div className="px-5 pt-3 pb-0">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl">
                    {filePreview ? (
                      <img src={filePreview} alt="preview" className="h-10 w-10 rounded-lg object-cover border border-indigo-200 flex-shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <FileScan className="w-5 h-5 text-indigo-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-indigo-700 truncate">{attachedFile.name}</p>
                      <p className="text-[10px] text-indigo-400 mt-0.5">
                        {attachedFile.type.startsWith('image/') ? 'Image — Claude Vision will extract medical data' : 'PDF — text will be extracted and analysed'}
                      </p>
                    </div>
                    <button onClick={clearFile} className="p-1.5 hover:bg-indigo-100 rounded-lg transition-colors text-indigo-400 hover:text-indigo-600 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="p-4 flex items-center gap-2.5">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="hidden" onChange={handleFileChange} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={submitting}
                  title="Attach image or PDF"
                  className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${attachedFile ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500'} disabled:opacity-40`}
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={attachedFile ? 'Add a note (optional)...' : 'Ask your AI health agent...'}
                  className="flex-1 px-4 py-3 bg-slate-50 rounded-2xl text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-200 focus:bg-white focus:outline-none transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={submitting || (!input.trim() && !attachedFile)}
                  className="p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
