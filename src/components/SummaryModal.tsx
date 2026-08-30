import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { 
  Sparkles, 
  Check, 
  X, 
  Tag, 
  Smile, 
  Lightbulb, 
  CheckSquare, 
  Save, 
  AlertCircle,
  Lock,
  Edit3
} from 'lucide-react';
import { ChatMessage, SummarizeResponse, JournalEntry, AppUser } from '../types';
import { saveJournalEntry } from '../lib/firebase';

interface SummaryModalProps {
  user: AppUser;
  isOpen: boolean;
  conversation: ChatMessage[];
  summaryData: SummarizeResponse;
  onClose: () => void;
  onSaved: (newEntry: JournalEntry) => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({
  user,
  isOpen,
  conversation,
  summaryData,
  onClose,
  onSaved
}) => {
  const [title, setTitle] = useState(summaryData.title || 'Personal Reflection');
  const [summary, setSummary] = useState(summaryData.summary || '');
  const [mood, setMood] = useState(summaryData.mood || 'Reflective');
  const [tags, setTags] = useState<string[]>(summaryData.tags || ['journal', 'reflection']);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!title.trim() || !summary.trim()) {
      setErrorMsg('Title and summary cannot be empty.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const userTurns = conversation.filter(m => m.role === 'user').length;
      const entryPayload = {
        title: title.trim(),
        summary: summary.trim(),
        mood: mood.trim(),
        tags: tags,
        keyTakeaways: summaryData.keyTakeaways || [],
        actionItems: summaryData.actionItems || [],
        turnsCount: userTurns,
        conversation: conversation.filter(m => m.id !== 'welcome-msg'),
      };

      const journalId = await saveJournalEntry(user.uid, entryPayload);

      const createdEntry: JournalEntry = {
        id: journalId,
        userId: user.uid,
        ...entryPayload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      onSaved(createdEntry);
    } catch (err: any) {
      console.error('[Save Journal Error]:', err);
      setErrorMsg(err.message || 'Failed to save to Firestore. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-stone-200 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-4 sm:my-8 text-stone-800 flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-amber-50/80 border-b border-amber-200/80 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shadow-2xs shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-brand text-base sm:text-lg font-bold text-stone-900 truncate">
                Journal Reflection Synthesized
              </h3>
              <p className="text-[10px] sm:text-[11px] text-stone-600 flex items-center truncate">
                <Lock className="w-3 h-3 mr-1 text-emerald-600 shrink-0" />
                <span className="truncate">Path: <code className="text-amber-800 font-mono">users/{user.uid.slice(0, 6)}.../journals</code></span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Title & Metadata */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-stone-500">Journal Title</label>
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="text-[11px] text-amber-700 hover:text-amber-800 font-medium flex items-center space-x-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" />
                <span>{isEditing ? 'Preview Mode' : 'Edit Text'}</span>
              </button>
            </div>

            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 py-2 text-stone-900 font-serif-heading text-base sm:text-lg font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
              />
            ) : (
              <h2 className="font-serif-heading text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
                {title}
              </h2>
            )}
          </div>

          {/* Mood & Tags Badges */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
              <Smile className="w-3.5 h-3.5 mr-1 text-amber-600" />
              <span>Mood: {mood}</span>
            </div>

            {tags.map((t, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-700 border border-stone-200"
              >
                <Tag className="w-3 h-3 mr-1 text-stone-400" />
                #{t}
              </span>
            ))}
          </div>

          {/* Synthesized Summary */}
          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1.5">
              Executive Summary & Insights
            </label>
            {isEditing ? (
              <textarea
                rows={5}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl p-3.5 text-stone-900 text-xs sm:text-sm focus:outline-none focus:border-amber-500 focus:bg-white leading-relaxed font-mono"
              />
            ) : (
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 sm:p-4 text-stone-800 text-xs sm:text-sm leading-relaxed prose prose-stone max-w-none shadow-2xs space-y-2">
                <Markdown>{summary}</Markdown>
              </div>
            )}
          </div>

          {/* Key Takeaways & Action Items */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {summaryData.keyTakeaways && summaryData.keyTakeaways.length > 0 && (
              <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-3.5 sm:p-4">
                <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2 flex items-center">
                  <Lightbulb className="w-3.5 h-3.5 mr-1.5 text-amber-600 shrink-0" />
                  Key Discovered Insights
                </div>
                <ul className="space-y-1.5 text-xs text-stone-700">
                  {summaryData.keyTakeaways.map((item, idx) => (
                    <li key={idx} className="flex items-start space-x-1.5">
                      <span className="text-amber-600 font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summaryData.actionItems && summaryData.actionItems.length > 0 && (
              <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-3.5 sm:p-4">
                <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-2 flex items-center">
                  <CheckSquare className="w-3.5 h-3.5 mr-1.5 text-emerald-600 shrink-0" />
                  Gentle Next Steps
                </div>
                <ul className="space-y-1.5 text-xs text-stone-700">
                  {summaryData.actionItems.map((item, idx) => (
                    <li key={idx} className="flex items-start space-x-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-stone-50 border-t border-stone-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/70 rounded-xl transition-colors cursor-pointer text-center min-h-[40px] flex items-center justify-center"
          >
            Cancel
          </button>

          <button
            id="btn-confirm-save-journal"
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-2 cursor-pointer min-h-[40px]"
          >
            {saving ? (
              <span>Persisting to Firestore...</span>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save to My Private Journal</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
