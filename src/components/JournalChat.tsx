import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { 
  Send, 
  Sparkles, 
  RotateCcw, 
  Lightbulb, 
  Compass, 
  Heart, 
  MessageSquare, 
  CheckCircle,
  AlertCircle,
  Clock,
  Layers,
  ArrowRight
} from 'lucide-react';
import { ChatMessage, SummarizeResponse } from '../types';
import { getAuthToken } from '../lib/firebase';

interface JournalChatProps {
  onSummarizeComplete: (conversation: ChatMessage[], summaryData: SummarizeResponse) => void;
  activeEntriesCount: number;
}

export const JournalChat: React.FC<JournalChatProps> = ({
  onSummarizeComplete,
  activeEntriesCount
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'model',
      content: "Hello. I am your personal, private reflection companion. \n\nWhether you'd like to untangle a complex decision, reflect on today's events, or brainstorm a creative project, I'm here to listen and help you explore your thoughts. What's on your mind today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [promptMode, setPromptMode] = useState<'journal' | 'brainstorm' | 'reflection' | 'gratitude'>('journal');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputValue.trim();
    if (!text || loading) return;

    setErrorMessage(null);
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputValue('');
    setLoading(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Authentication expired. Please sign in again.');
      }

      // Send sanitized history to server-side endpoint
      const payloadMessages = newHistory
        .filter(m => m.id !== 'welcome-msg')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: payloadMessages,
          promptMode,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned status ${res.status}`);
      }

      const data = await res.json();
      const modelMsg: ChatMessage = {
        id: `mod-${Date.now()}`,
        role: 'model',
        content: data.reply || 'I am listening and thinking through this with you.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, modelMsg]);
    } catch (err: any) {
      console.error('[Chat Error]:', err);
      setErrorMessage(err.message || 'Unable to connect to Gemini. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinishAndSummarize = async () => {
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) {
      setErrorMessage('Please write at least one journal thought before generating a summary.');
      return;
    }

    setSummarizing(true);
    setErrorMessage(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Authentication expired. Please sign in again.');
      }

      const payloadMessages = messages
        .filter(m => m.id !== 'welcome-msg')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: payloadMessages,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Summarization failed.');
      }

      const summaryResult: SummarizeResponse = await res.json();
      onSummarizeComplete(messages, summaryResult);
    } catch (err: any) {
      console.error('[Summarize Error]:', err);
      setErrorMessage(err.message || 'Failed to generate summary.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleResetSession = () => {
    if (messages.length > 2) {
      const confirmed = window.confirm('Start a fresh conversation? Any unsaved thoughts in this active thread will be reset.');
      if (!confirmed) return;
    }
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'model',
        content: "Fresh canvas ready. Take a breath and write whatever is currently on your mind.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    ]);
    setInputValue('');
    setErrorMessage(null);
  };

  const handlePromptStarter = (mode: 'journal' | 'brainstorm' | 'reflection' | 'gratitude', prompt: string) => {
    setPromptMode(mode);
    setInputValue(prompt);
    textareaRef.current?.focus();
  };

  const userTurnsCount = messages.filter(m => m.role === 'user').length;

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100dvh-8rem)] sm:h-[calc(100dvh-6.5rem)] lg:h-[calc(100vh-6rem)] min-h-[440px] pb-2 sm:pb-4 px-2 sm:px-4">
      {/* Session Controls & Mode Bar */}
      <div className="bg-white border border-stone-200 rounded-t-2xl px-3.5 sm:px-5 py-3 flex flex-col gap-2.5 text-stone-800 shadow-xs">
        {/* Top row: Status, clear, and finish CTA */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-800">
              Active Reflection Canvas
            </span>
            <span className="text-[11px] text-stone-500 font-mono hidden xs:inline">
              ({userTurnsCount} {userTurnsCount === 1 ? 'turn' : 'turns'})
            </span>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <button
              type="button"
              onClick={handleResetSession}
              title="Reset Session"
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors text-xs flex items-center space-x-1 cursor-pointer min-h-[36px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>

            <button
              id="btn-finish-summarize-top"
              type="button"
              onClick={handleFinishAndSummarize}
              disabled={summarizing || userTurnsCount === 0}
              className="px-3 sm:px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer min-h-[36px]"
            >
              {summarizing ? (
                <span>Synthesizing...</span>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Finish & Summarize</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Bottom row: Mode Selector */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <span className="text-[11px] text-stone-500 font-medium whitespace-nowrap hidden sm:inline mr-1">
            Focus Mode:
          </span>
          <div className="flex items-center space-x-1 bg-stone-100 p-0.5 rounded-xl border border-stone-200 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setPromptMode('journal')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap min-h-[30px] ${
                promptMode === 'journal' ? 'bg-white text-stone-900 font-bold shadow-xs border border-stone-200/60' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>Journal</span>
            </button>
            <button
              type="button"
              onClick={() => setPromptMode('brainstorm')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap min-h-[30px] ${
                promptMode === 'brainstorm' ? 'bg-white text-stone-900 font-bold shadow-xs border border-stone-200/60' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>Brainstorm</span>
            </button>
            <button
              type="button"
              onClick={() => setPromptMode('reflection')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap min-h-[30px] ${
                promptMode === 'reflection' ? 'bg-white text-stone-900 font-bold shadow-xs border border-stone-200/60' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>Deep Reflect</span>
            </button>
            <button
              type="button"
              onClick={() => setPromptMode('gratitude')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap min-h-[30px] ${
                promptMode === 'gratitude' ? 'bg-white text-stone-900 font-bold shadow-xs border border-stone-200/60' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>Gratitude</span>
            </button>
          </div>
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="flex-1 bg-stone-50/70 border-x border-stone-200 p-3 sm:p-5 md:p-6 overflow-y-auto space-y-4 sm:space-y-5">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center space-x-2 mb-1 px-1">
                <span className="text-[11px] font-semibold text-stone-600">
                  {isUser ? 'You' : 'Gemini Companion'}
                </span>
                <span className="text-[10px] text-stone-400 font-mono">
                  {msg.timestamp}
                </span>
              </div>

              <div
                className={`max-w-[92%] sm:max-w-[85%] md:max-w-[80%] rounded-2xl p-3.5 sm:p-4 md:p-5 shadow-xs leading-relaxed text-xs sm:text-sm ${
                  isUser
                    ? 'bg-amber-600 text-white rounded-tr-xs'
                    : 'bg-white border border-stone-200 text-stone-800 rounded-tl-xs shadow-xs'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                ) : (
                  <div className="prose prose-stone max-w-none text-stone-800 leading-relaxed text-xs sm:text-sm space-y-2">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-start space-x-2">
            <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-xs p-3.5 sm:p-4 flex items-center space-x-3 text-stone-600 text-xs shadow-xs">
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-stone-700 font-medium">Gemini is reflecting on your thoughts...</span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start space-x-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong>Notice:</strong> {errorMessage}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Starters (shown when conversation is short) */}
      {userTurnsCount === 0 && (
        <div className="bg-stone-100/90 border-x border-stone-200 px-3 sm:px-4 py-2 flex items-center space-x-2 overflow-x-auto text-[11px] scrollbar-none">
          <span className="text-stone-500 font-medium whitespace-nowrap flex items-center shrink-0">
            <Lightbulb className="w-3 h-3 mr-1 text-amber-600 shrink-0" /> Prompts:
          </span>
          <button
            onClick={() => handlePromptStarter('journal', "Today I noticed a recurring tension around my work priorities...")}
            className="px-2.5 py-1 bg-white hover:bg-stone-50 active:bg-stone-100 text-stone-700 rounded-lg border border-stone-200 whitespace-nowrap transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            Work Priorities & Energy
          </button>
          <button
            onClick={() => handlePromptStarter('brainstorm', "I want to brainstorm a creative system for tracking my weekly learning...")}
            className="px-2.5 py-1 bg-white hover:bg-stone-50 active:bg-stone-100 text-stone-700 rounded-lg border border-stone-200 whitespace-nowrap transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            Brainstorm a Learning System
          </button>
          <button
            onClick={() => handlePromptStarter('gratitude', "Three moments today that made me feel grounded and thankful...")}
            className="px-2.5 py-1 bg-white hover:bg-stone-50 active:bg-stone-100 text-stone-700 rounded-lg border border-stone-200 whitespace-nowrap transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            3 Moments of Gratitude
          </button>
        </div>
      )}

      {/* Message Input Form */}
      <div className="bg-white border border-stone-200 rounded-b-2xl p-2.5 sm:p-4 shadow-xs">
        <form onSubmit={handleSendMessage} className="flex items-end space-x-2 sm:space-x-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              id="journal-input-textarea"
              rows={2}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                promptMode === 'brainstorm'
                  ? "Describe your ideas, project goals, or questions..."
                  : promptMode === 'reflection'
                  ? "What thoughts or feelings are surfacing for you right now?"
                  : "Write your thoughts freely (Shift+Enter for new line)..."
              }
              className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 py-2.5 text-stone-900 placeholder-stone-400 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:bg-white transition-colors resize-none leading-relaxed min-h-[50px] sm:min-h-[56px]"
            />
          </div>

          <div className="flex flex-col space-y-2 shrink-0">
            <button
              id="btn-send-journal-message"
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="w-11 h-11 sm:w-12 sm:h-12 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-40 text-white rounded-xl font-bold shadow-xs transition-all flex items-center justify-center cursor-pointer shrink-0"
              title="Send thought"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </form>

        {/* Footer Summary Shortcut info */}
        <div className="mt-2 flex items-center justify-between text-[10px] sm:text-[11px] text-stone-500 px-1">
          <span className="truncate pr-2">
            {userTurnsCount > 0 ? (
              <span className="text-amber-800 font-medium">
                Click "Finish & Summarize" to analyze and save to your private Firestore.
              </span>
            ) : (
              <span>Your entries remain strictly private in your isolated Firebase subcollection.</span>
            )}
          </span>
          <span className="font-mono text-stone-400 hidden md:inline shrink-0">Enter to Send • Shift+Enter for newline</span>
        </div>
      </div>
    </div>
  );
};
