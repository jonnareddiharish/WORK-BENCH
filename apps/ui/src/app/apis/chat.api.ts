import { API_BASE } from '../lib/api';
import type { ChatModelId } from '../types';

const STREAMER_BASE = 'http://localhost:3001';

// ─── Request / Response types ────────────────────────────────────────────────

export interface StartChatBody {
  message: string;
  inputType: 'TEXT' | 'IMAGE' | 'PDF';
  fileBase64?: string;
  fileMimeType?: string;
  modelId?: ChatModelId;
}

export interface StartChatResponse {
  sessionId: string;
  processInstanceId: string | null;
}

export interface ChatSession {
  _id: string;
  userId: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  processInstanceId?: string;
  processDefinitionKey?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatHistoryMessage {
  _id: string;
  sessionId: string;
  userId: string;
  role: 'USER' | 'ASSISTANT' | 'WORKER_STEP';
  content: string;
  sequence: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Camunda Streamer endpoints ───────────────────────────────────────────────

export async function startChatSession(userId: string, body: StartChatBody): Promise<StartChatResponse> {
  const res = await fetch(`${STREAMER_BASE}/stream/${userId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`startChatSession → ${res.status}`);
  return res.json();
}

export async function getChatSseStream(sessionId: string): Promise<Response> {
  const res = await fetch(`${STREAMER_BASE}/stream/${sessionId}/sse`);
  if (!res.ok || !res.body) throw new Error(`getChatSseStream → ${res.status}`);
  return res;
}

// ─── Chat history endpoints (read-only, served by apps/api) ──────────────────

async function chatRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

export const getChatSessions = (userId: string) =>
  chatRequest<ChatSession[]>(`/chat-model/${userId}/sessions`);

export const getChatSession = (userId: string, sessionId: string) =>
  chatRequest<ChatSession>(`/chat-model/${userId}/sessions/${sessionId}`);

export const getChatMessages = (userId: string, sessionId: string) =>
  chatRequest<ChatHistoryMessage[]>(`/chat-model/${userId}/sessions/${sessionId}/messages`);
