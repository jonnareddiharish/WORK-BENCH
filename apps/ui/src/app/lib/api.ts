import type { User, HealthEvent, DietLog, LifestyleRecord, MealPlan, Reminder, RecordItem } from '../types';

export const API_BASE = 'http://localhost:3000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${options?.method ?? 'GET'} ${path} → ${res.status}`);
  return res.json();
}

// ─── Users ───────────────────────────────────────────────────────────────────

export const getUsers = () => request<User[]>('/users');
export const getUser  = (id: string) => request<User>(`/users/${id}`);
export const createUser = (body: Pick<User, 'name' | 'dob'> & { biologicalSex?: string }) =>
  request<User>('/users', { method: 'POST', body: JSON.stringify(body) });
export const deleteUser = (id: string) =>
  request<void>(`/users/${id}`, { method: 'DELETE' });
export const linkUsers = (body: { sourceId: string; targetId: string; relationship: string }) =>
  request<void>('/users/link', { method: 'POST', body: JSON.stringify(body) });
export const getFamilyGraph = () =>
  request<{ nodes: any[]; links: any[] }>('/users/graph');

// ─── Health Events ────────────────────────────────────────────────────────────

export const getHealthEvents = (userId: string) =>
  request<HealthEvent[]>(`/users/${userId}/health-events`);
export const createHealthEvent = (userId: string, body: Partial<HealthEvent>) =>
  request<HealthEvent>(`/users/${userId}/health-events`, { method: 'POST', body: JSON.stringify(body) });
export const updateHealthEvent = (userId: string, eventId: string, body: Partial<HealthEvent>) =>
  request<HealthEvent>(`/users/${userId}/health-events/${eventId}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteHealthEvent = (userId: string, eventId: string) =>
  request<void>(`/users/${userId}/health-events/${eventId}`, { method: 'DELETE' });

// ─── Diet Logs ────────────────────────────────────────────────────────────────

export const getDietLogs = (userId: string) =>
  request<DietLog[]>(`/users/${userId}/diet-logs`);
export const createDietLog = (userId: string, body: Partial<DietLog>) =>
  request<DietLog>(`/users/${userId}/diet-logs`, { method: 'POST', body: JSON.stringify(body) });
export const updateDietLog = (userId: string, logId: string, body: Partial<DietLog>) =>
  request<DietLog>(`/users/${userId}/diet-logs/${logId}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteDietLog = (userId: string, logId: string) =>
  request<void>(`/users/${userId}/diet-logs/${logId}`, { method: 'DELETE' });

// ─── Lifestyle ────────────────────────────────────────────────────────────────

export const getLifestyle = (userId: string) =>
  request<LifestyleRecord[]>(`/users/${userId}/lifestyle`);
export const createLifestyle = (userId: string, body: Partial<LifestyleRecord>) =>
  request<LifestyleRecord>(`/users/${userId}/lifestyle`, { method: 'POST', body: JSON.stringify(body) });
export const updateLifestyle = (userId: string, recId: string, body: Partial<LifestyleRecord>) =>
  request<LifestyleRecord>(`/users/${userId}/lifestyle/${recId}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteLifestyle = (userId: string, recId: string) =>
  request<void>(`/users/${userId}/lifestyle/${recId}`, { method: 'DELETE' });

// ─── Meal Plans ───────────────────────────────────────────────────────────────

export const getActiveMealPlan = (userId: string) =>
  request<MealPlan>(`/users/${userId}/meal-plans/active`);
export const generateMealPlan = (userId: string, body: Record<string, unknown>) =>
  request<MealPlan>(`/users/${userId}/meal-plans/generate`, { method: 'POST', body: JSON.stringify(body) });

// ─── Reminders ────────────────────────────────────────────────────────────────

export const getReminders = (userId: string) =>
  request<Reminder[]>(`/users/${userId}/reminders`);
export const dismissReminder = (userId: string, reminderId: string) =>
  request<void>(`/users/${userId}/reminders/${reminderId}/done`, { method: 'PATCH' });

// ─── Records (generic CRUD) ───────────────────────────────────────────────────

export const getRecords = (userId: string, endpoint: string) =>
  request<RecordItem[]>(`/users/${userId}/${endpoint}`);
export const saveRecord = (userId: string, endpoint: string, body: Partial<RecordItem>, id?: string) =>
  request<RecordItem>(
    id ? `/users/${userId}/${endpoint}/${id}` : `/users/${userId}/${endpoint}`,
    { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }
  );
export const deleteRecord = (userId: string, endpoint: string, id: string) =>
  request<void>(`/users/${userId}/${endpoint}/${id}`, { method: 'DELETE' });

// ─── Agent / AI ───────────────────────────────────────────────────────────────

export const reanalyzeHealth = (userId: string, body: { oldEvent: unknown; newEvent: unknown; model?: string }) =>
  request<{ analysis: string; profileUpdated?: boolean }>(
    `/agent/${userId}/reanalyze`,
    { method: 'POST', body: JSON.stringify(body) }
  );
export const reanalyzeDiet = (userId: string, body: { oldLog: unknown; newLog: unknown; model?: string }) =>
  request<{ analysis: string }>(
    `/agent/${userId}/reanalyze-diet`,
    { method: 'POST', body: JSON.stringify(body) }
  );
export const reanalyzeLifestyle = (userId: string, body: { oldRec: unknown; newRec: unknown; model?: string }) =>
  request<{ analysis: string }>(
    `/agent/${userId}/reanalyze-lifestyle`,
    { method: 'POST', body: JSON.stringify(body) }
  );
export const chatWithAgent = (userId: string, body: { message: string; history: unknown[]; model: string }) =>
  request<{ reply: string; intent?: string[]; retrievedCount?: number; model?: string }>(
    `/agent/${userId}/chat`,
    { method: 'POST', body: JSON.stringify(body) }
  );
export const chatWithFile = (userId: string, form: FormData) =>
  fetch(`${API_BASE}/agent/${userId}/chat-with-file`, { method: 'POST', body: form }).then(r => r.json());
