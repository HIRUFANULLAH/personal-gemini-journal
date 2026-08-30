export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous?: boolean;
  isLocalVault?: boolean;
  getIdToken: () => Promise<string>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  summary: string;
  mood?: string;
  tags?: string[];
  keyTakeaways?: string[];
  actionItems?: string[];
  turnsCount: number;
  conversation?: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyInsight {
  id: string;
  userId: string;
  period: string;
  journalCount: number;
  recurringTopics: string[];
  highlights: string[];
  goals: string[];
  areasToReflect: string[];
  motivationalMessage: string;
  createdAt: string;
}

export interface SummarizeResponse {
  title: string;
  summary: string;
  mood: string;
  tags: string[];
  keyTakeaways: string[];
  actionItems: string[];
}

export interface ApiChatRequest {
  messages: Array<{ role: 'user' | 'model'; content: string }>;
  promptMode?: 'journal' | 'brainstorm' | 'reflection' | 'gratitude';
}

export interface ApiSummarizeRequest {
  messages: Array<{ role: 'user' | 'model'; content: string }>;
}

export interface ApiInsightsRequest {
  journals: Array<{ title: string; summary: string; createdAt: string; tags?: string[]; mood?: string }>;
}
