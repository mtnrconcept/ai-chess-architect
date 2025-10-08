export type CoachChatRole = 'coach' | 'player' | 'system';

export interface CoachChatMessage {
  id: string;
  role: CoachChatRole;
  content: string;
  createdAt: string;
  trigger: 'initial' | 'auto' | 'manual';
}

export interface CoachChatHistoryEntry {
  role: 'assistant' | 'user';
  content: string;
}

export interface CoachChatResponse {
  message: string;
}
