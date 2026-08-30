import React, { useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import { 
  History, 
  Search, 
  Trash2, 
  Calendar, 
  Smile, 
  Tag, 
  ChevronRight, 
  MessageSquare, 
  Lock, 
  Sparkles, 
  X,
  FileText,
  AlertTriangle,
  Lightbulb,
  CheckSquare,
  Download,
  Copy,
  Check
} from 'lucide-react';
import { JournalEntry, AppUser } from '../types';
import { deleteUserJournal } from '../lib/firebase';

interface JournalHistoryProps {
  user: AppUser;
  journals: JournalEntry[];
  loading: boolean;
  onRefresh: () => void;
  onSelectNewSession: () => void;
}

export const JournalHistory: React.FC<JournalHistoryProps> = ({
  user,
  journals,
  loading,
  onRefresh,
  onSelectNewSession
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMood, setSelectedMood] = useState<string>('all');
  const [activeEntry, setActiveEntry] = useState<JournalEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<JournalEntry | null>(null);
  const [copied, setCopied] = useState(false);

  // Extract all unique moods from existing journals
  const availableMoods = useMemo(() => {
    const moods = new Set<string>();
    journals.forEach(j => {
      if (j.mood) moods.add(j.mood);
    });
    return Array.from(moods);
  }, [journals]);

  // Real-time calculation of metrics from actual user records
  const statistics = useMemo(() => {
    const totalEntries = journals.length;
    let totalWords = 0;
    let totalTurns = 0;
    const tagCounts: Record<string, number> = {};

    journals.forEach(j => {
      const wordsInSummary = (j.summary || '').trim().split(/\s+/).filter(Boolean).length;
      totalWords += wordsInSummary;
      totalTurns += j.turnsCount || (j.conversation ? j.conversation.length : 1);
      
      (j.tags || []).forEach(t => {
        const clean = t.toLowerCase().trim();
        tagCounts[clean] = (tagCounts[clean] || 0) + 1;
      });
    });

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    return {
      totalEntries,
      totalWords,
      totalTurns,
      topTags,
    };
  }, [journals]);

  // Filter journals based on search term & mood
  const filteredJournals = useMemo(() => {
    return journals.filter(entry => {
      const matchesSearch = 
        entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (entry.tags && entry.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())));
      
      const matchesMood = selectedMood === 'all' || entry.mood === selectedMood;
      return matchesSearch && matchesMood;
    });
  }, [journals, searchTerm, selectedMood]);

  const handleDelete = async (entry: JournalEntry) => {
    try {
      setDeletingId(entry.id);
      await deleteUserJournal(user.uid, entry.id);
      if (activeEntry?.id === entry.id) {
        setActiveEntry(null);
      }
      setConfirmDeleteEntry(null);
      onRefresh();
    } catch (err: any) {
      console.error('[Delete Error]:', err);
      alert('Failed to delete entry: ' + (err.message || 'Unknown error'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopySummary = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportMarkdown = (entry: JournalEntry) => {
    const mdContent = `# ${entry.title}
Date: ${new Date(entry.createdAt).toLocaleString()}
Mood: ${entry.mood || 'N/A'}
Tags: ${(entry.tags || []).join(', ')}

## Summary
${entry.summary}

## Key Takeaways
${(entry.keyTakeaways || []).map(t => `- ${t}`).join('\n')}

## Action Items
${(entry.actionItems || []).map(a => `- [ ] ${a}`).join('\n')}

---
*Exported from Personal Gemini Journal (Firestore-backed)*
`;
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${entry.createdAt.slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Real Stats Overview Bar */}
      {journals.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
          <div className="bg-white border border-stone-200 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col">
            <span className="text-[11px] text-stone-500 font-medium">Total Reflections</span>
            <span className="text-xl sm:text-2xl font-bold text-stone-900 mt-1">{statistics.totalEntries}</span>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col">
            <span className="text-[11px] text-stone-500 font-medium">Words Synthesized</span>
            <span className="text-xl sm:text-2xl font-bold text-stone-900 mt-1">{statistics.totalWords.toLocaleString()}</span>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col">
            <span className="text-[11px] text-stone-500 font-medium">AI Dialogue Turns</span>
            <span className="text-xl sm:text-2xl font-bold text-stone-900 mt-1">{statistics.totalTurns}</span>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col">
            <span className="text-[11px] text-stone-500 font-medium">Distinct Moods</span>
            <span className="text-xl sm:text-2xl font-bold text-stone-900 mt-1">{availableMoods.length || 1}</span>
          </div>
        </div>
      )}

      {/* Top Header & Search Bar */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
          <div>
            <h1 className="font-brand text-xl sm:text-2xl font-bold text-stone-900 flex items-center">
              <History className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-amber-600 shrink-0" />
              <span>My Journal Archive</span>
            </h1>
            <p className="text-xs text-stone-500 mt-0.5 flex items-center flex-wrap gap-1">
              <span className="inline-flex items-center text-emerald-700 font-medium">
                <Lock className="w-3 h-3 mr-1 shrink-0" />
                Isolated Storage:
              </span>
              <code className="text-amber-800 font-mono text-[11px]">users/{user.uid.slice(0, 8)}.../journals</code>
              <span className="text-stone-400">({journals.length} {journals.length === 1 ? 'entry' : 'entries'})</span>
            </p>
          </div>

          <button
            id="btn-new-journal-from-history"
            onClick={onSelectNewSession}
            className="px-3.5 sm:px-4 py-2 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 self-start sm:self-auto cursor-pointer min-h-[38px]"
          >
            <Sparkles className="w-4 h-4" />
            <span>New Reflection Session</span>
          </button>
        </div>

        {/* Search & Mood Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search across titles, summaries, tags..."
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 placeholder-stone-400 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:bg-white transition-colors"
            />
          </div>

          {availableMoods.length > 0 && (
            <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedMood('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer min-h-[32px] ${
                  selectedMood === 'all'
                    ? 'bg-amber-600 text-white font-semibold shadow-2xs'
                    : 'bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200'
                }`}
              >
                All Moods
              </button>
              {availableMoods.map(m => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setSelectedMood(m)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer min-h-[32px] ${
                    selectedMood === m
                      ? 'bg-amber-600 text-white font-semibold shadow-2xs'
                      : 'bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid of Journal Entries */}
      {loading ? (
        <div className="p-12 text-center text-stone-500 text-sm bg-white rounded-2xl border border-stone-200 shadow-xs">
          <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading your isolated journal vault...
        </div>
      ) : filteredJournals.length === 0 ? (
        <div className="p-8 sm:p-12 text-center bg-white border border-stone-200 rounded-2xl text-stone-600 space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 mx-auto flex items-center justify-center border border-amber-200">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-brand text-lg font-bold text-stone-900">
            {searchTerm ? 'No Matching Journals Found' : 'Your Journal Is Fresh and Ready'}
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
            {searchTerm
              ? 'Try modifying your search keywords or resetting your mood filter.'
              : 'Begin a reflection session with Gemini to generate your first synthesis and insights.'}
          </p>
          {!searchTerm && (
            <button
              type="button"
              onClick={onSelectNewSession}
              className="mt-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all inline-flex items-center space-x-1.5 cursor-pointer min-h-[38px]"
            >
              <Sparkles className="w-4 h-4" />
              <span>Start Your First Reflection</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredJournals.map((entry) => (
            <div
              key={entry.id}
              onClick={() => setActiveEntry(entry)}
              className="bg-white hover:bg-stone-50/60 border border-stone-200 hover:border-amber-400/80 rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group relative"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] text-stone-500 mb-2.5">
                  <span className="flex items-center">
                    <Calendar className="w-3 h-3 mr-1 text-amber-600" />
                    {new Date(entry.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>

                  {entry.mood && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                      {entry.mood}
                    </span>
                  )}
                </div>

                <h3 className="font-serif-heading text-base sm:text-lg font-bold text-stone-900 group-hover:text-amber-800 transition-colors line-clamp-2 mb-2">
                  {entry.title}
                </h3>

                <p className="text-xs text-stone-600 line-clamp-3 leading-relaxed mb-4">
                  {entry.summary.replace(/[#*`_]/g, '')}
                </p>
              </div>

              <div>
                {/* Tags */}
                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {entry.tags.slice(0, 3).map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md border border-stone-200"
                      >
                        #{tag}
                      </span>
                    ))}
                    {entry.tags.length > 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 text-stone-400">
                        +{entry.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <div className="pt-3 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
                  <span className="flex items-center text-stone-500">
                    <MessageSquare className="w-3 h-3 mr-1 text-stone-400" />
                    {entry.turnsCount || entry.conversation?.length || 1} turns
                  </span>

                  <span className="text-amber-700 font-semibold flex items-center group-hover:translate-x-0.5 transition-transform">
                    Read Summary <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Entry Detail Modal */}
      {activeEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-6 text-stone-800 flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-amber-50/80 border-b border-amber-200/80 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] text-stone-600 flex items-center mb-1">
                  <Calendar className="w-3 h-3 mr-1 text-amber-600 shrink-0" />
                  {new Date(activeEntry.createdAt).toLocaleString(undefined, {
                    dateStyle: 'full',
                    timeStyle: 'short',
                  })}
                </span>
                <h2 className="font-serif-heading text-lg sm:text-xl font-bold text-stone-900 truncate">
                  {activeEntry.title}
                </h2>
              </div>

              <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopySummary(activeEntry.summary)}
                  title="Copy Summary"
                  className="p-2 text-stone-600 hover:text-amber-800 hover:bg-stone-100 rounded-lg transition-colors flex items-center text-xs cursor-pointer min-h-[36px]"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleExportMarkdown(activeEntry)}
                  title="Download as Markdown"
                  className="p-2 text-stone-600 hover:text-amber-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer min-h-[36px]"
                >
                  <Download className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmDeleteEntry(activeEntry)}
                  title="Delete Entry"
                  className="p-2 text-stone-600 hover:text-red-600 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer min-h-[36px]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveEntry(null)}
                  className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer min-h-[36px]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1">
              {/* Mood & Tags */}
              <div className="flex flex-wrap items-center gap-2">
                {activeEntry.mood && (
                  <div className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    <Smile className="w-3.5 h-3.5 mr-1 text-amber-600" />
                    Mood: {activeEntry.mood}
                  </div>
                )}
                {activeEntry.tags?.map((t, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-stone-100 text-stone-700 border border-stone-200"
                  >
                    <Tag className="w-3 h-3 mr-1 text-stone-400" />
                    #{t}
                  </span>
                ))}
              </div>

              {/* Main Summary */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 sm:p-5">
                <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">
                  Session Summary
                </h4>
                <div className="prose prose-stone max-w-none text-xs sm:text-sm text-stone-800 leading-relaxed space-y-2">
                  <Markdown>{activeEntry.summary}</Markdown>
                </div>
              </div>

              {/* Key Takeaways & Action Items */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {activeEntry.keyTakeaways && activeEntry.keyTakeaways.length > 0 && (
                  <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-4">
                    <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2 flex items-center">
                      <Lightbulb className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                      Key Insights
                    </div>
                    <ul className="space-y-1.5 text-xs text-stone-700">
                      {activeEntry.keyTakeaways.map((item, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5">
                          <span className="text-amber-600 font-bold">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeEntry.actionItems && activeEntry.actionItems.length > 0 && (
                  <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-4">
                    <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-2 flex items-center">
                      <CheckSquare className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                      Action Items & Next Steps
                    </div>
                    <ul className="space-y-1.5 text-xs text-stone-700">
                      {activeEntry.actionItems.map((item, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5">
                          <span className="text-emerald-600 font-bold">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Conversation Replay (if available) */}
              {activeEntry.conversation && activeEntry.conversation.length > 0 && (
                <div className="pt-4 border-t border-stone-200">
                  <h4 className="text-xs font-semibold text-stone-600 uppercase tracking-wider mb-3 flex items-center">
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                    Complete Conversation Transcript ({activeEntry.conversation.length} messages)
                  </h4>
                  <div className="space-y-3 bg-stone-50 rounded-xl p-3.5 sm:p-4 border border-stone-200 max-h-60 overflow-y-auto">
                    {activeEntry.conversation.map((msg, idx) => (
                      <div key={idx} className={`text-xs ${msg.role === 'user' ? 'text-amber-900' : 'text-stone-800'}`}>
                        <span className="font-semibold text-stone-600">
                          {msg.role === 'user' ? 'You' : 'Gemini'}:
                        </span>{' '}
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 sm:px-6 py-3 bg-stone-50 border-t border-stone-200 flex justify-between items-center text-xs text-stone-500">
              <span className="font-mono text-[11px] truncate pr-2">ID: {activeEntry.id}</span>
              <button
                type="button"
                onClick={() => setActiveEntry(null)}
                className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg transition-colors cursor-pointer min-h-[34px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl text-stone-800 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-brand font-bold text-lg text-stone-900">
                  Delete Journal Entry?
                </h3>
                <p className="text-xs text-stone-500">This action permanently deletes this record from your vault.</p>
              </div>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-700">
              <strong className="text-stone-900 font-serif-heading block mb-1">
                "{confirmDeleteEntry.title}"
              </strong>
              <span className="text-stone-500">
                Created on {new Date(confirmDeleteEntry.createdAt).toLocaleDateString()}
              </span>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteEntry(null)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[38px]"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-entry"
                type="button"
                onClick={() => handleDelete(confirmDeleteEntry)}
                disabled={deletingId === confirmDeleteEntry.id}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer min-h-[38px]"
              >
                {deletingId === confirmDeleteEntry.id ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
