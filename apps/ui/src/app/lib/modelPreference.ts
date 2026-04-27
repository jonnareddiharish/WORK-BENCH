import type { ChatModelId } from '../types';

const KEY = 'healthai_default_model';

export function getDefaultModel(): ChatModelId {
  return (localStorage.getItem(KEY) as ChatModelId) ?? 'claude-sonnet-4-6';
}

export function saveDefaultModel(model: ChatModelId): void {
  localStorage.setItem(KEY, model);
}
