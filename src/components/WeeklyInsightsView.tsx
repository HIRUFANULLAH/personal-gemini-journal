import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  TrendingUp, 
  Target, 
  HelpCircle, 
  MessageSquareHeart, 
  Calendar, 
  Lock, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  BookOpen,
  ArrowRight
} from 'lucide-react';
import { JournalEntry, WeeklyInsight, AppUser } from '../types';
import { getAuthToken, saveWeeklyInsight, getUserWeeklyInsights } from '../lib/firebase';

interface WeeklyInsightsProps {
  user: AppUser;
  journals: JournalEntry[];
  onSelectNewSession: () => void;
}

export const WeeklyInsightsView: React.FC<WeeklyInsightsProps> = ({
  user,
  journals,
  onSelectNewSession
}) => {
  const [insight, setInsight] = useState<WeeklyInsight | null>(null);
  const [pastInsights, setPastInsights] = useState<WeeklyInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadSavedInsights();
  }, [user.uid]);

  const loadSavedInsights = async () => {
    try {
      const results = await getUserWeeklyInsights(user.uid);
      setPastInsights(results);
      if (results.length > 0 && !insight) {
        setInsight(results[0]);
      }
    } catch (err) {
      console.error('[Error loading past insights]:', err);
    }
  };

  const handleGenerateInsights = async () => {
    if (journals.length === 0) {
      setErrorMsg('You need at least one saved journal entry to generate weekly reflection insights.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSavedSuccess(false);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Authentication expired. Please sign in again.');
      }

      // Pass only safe metadata & summaries belonging to the user
      const journalPayload = journals.slice(0, 15).map(j => ({
        title: j.title,
        summary: j.summary,
        createdAt: j.createdAt,
        tags: j.tags,
        mood: j.mood,
      }));

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          journals: journalPayload,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to generate weekly insights.');
      }

      const data = await res.json();
      const generatedInsight: WeeklyInsight = {
        id: `gen-${Date.now()}`,
        userId: user.uid,
        period: data.period || 'Past 7 Days',
        journalCount: journals.length,
        recurringTopics: data.recurringTopics || [],
        highlights: data.highlights || [],
        goals: data.goals || [],
        areasToReflect: data.areasToReflect || [],
        motivationalMessage: data.motivationalMessage || '',
        createdAt: new Date().toISOString(),
      };

      setInsight(generatedInsight);
    } catch (err: any) {
      console.error('[Insights Error]:', err);
      setErrorMsg(err.message || 'Failed to generate weekly insights.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToVault = async () => {
    if (!insight) return;
    setSaving(true);
    setErrorMsg(null);

    try {
      await saveWeeklyInsight(user.uid, {
        period: insight.period,
        journalCount: insight.journalCount,
        recurringTopics: insight.recurringTopics,
        highlights: insight.highlights,
        goals: insight.goals,
        areasToReflect: insight.areasToReflect,
        motivationalMessage: insight.motivationalMessage,
      });

      setSavedSuccess(true);
      await loadSavedInsights();
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: any) {
      console.error('[Save Insight Error]:', err);
      setErrorMsg('Failed to save insight: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-6 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs shrink-0">
                <Sparkles className="w-5 h-5" />
              </span>
              <h1 className="font-brand text-xl sm:text-2xl font-bold text-stone-900">
                Weekly Reflection Insights
              </h1>
            </div>
            <p className="text-xs text-stone-600 mt-2 max-w-xl leading-relaxed">
              Synthesizes patterns, recurring topics, breakthrough highlights, and goals across your private journal history. No data is shared or aggregated across accounts.
            </p>
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <button
              id="btn-generate-weekly-insights"
              onClick={handleGenerateInsights}
              disabled={loading || journals.length === 0}
              className="w-full sm:w-auto px-4 py-2.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-2 cursor-pointer min-h-[40px]"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Patterns...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{insight ? 'Regenerate Weekly Insights' : 'Generate Weekly Insights'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Security badge */}
        <div className="mt-4 pt-3 border-t border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-stone-600 gap-1 sm:gap-0">
          <span className="flex items-center flex-wrap">
            <Lock className="w-3.5 h-3.5 mr-1 text-emerald-600 shrink-0" />
            Analyzing {journals.length} journal {journals.length === 1 ? 'entry' : 'entries'} in <code className="text-amber-800 font-mono ml-1">users/{user.uid.slice(0, 8)}...</code>
          </span>
          {pastInsights.length > 0 && (
            <span className="text-stone-500 font-mono text-[10px] sm:text-[11px]">
              {pastInsights.length} saved reports in vault
            </span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
          <strong>Notice:</strong> {errorMsg}
        </div>
      )}

      {/* Main Content Area */}
      {journals.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 sm:p-12 text-center text-stone-600 space-y-4 shadow-xs">
          <BookOpen className="w-12 h-12 text-amber-600 mx-auto opacity-80" />
          <h3 className="font-brand text-lg font-bold text-stone-900">
            No Journal Entries Available
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
            Weekly Insights analyzes your personal reflections to surface recurring patterns and progress. Write your first journal entry to unlock this feature.
          </p>
          <button
            onClick={onSelectNewSession}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all inline-flex items-center space-x-1.5 cursor-pointer min-h-[38px]"
          >
            <span>Start a Reflection Session</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : !insight && !loading ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 sm:p-12 text-center text-stone-600 space-y-4 shadow-xs">
          <Sparkles className="w-10 h-10 text-amber-600 mx-auto animate-pulse" />
          <h3 className="font-brand text-lg font-bold text-stone-900">
            Ready to Synthesize Your Week
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
            Click "Generate Weekly Insights" to examine recurring themes, milestones, and constructive prompts tailored to your recent {journals.length} reflections.
          </p>
          <button
            onClick={handleGenerateInsights}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all inline-flex items-center space-x-2 cursor-pointer min-h-[40px]"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate Now</span>
          </button>
        </div>
      ) : null}

      {/* Generated Insight Display */}
      {insight && (
        <div className="space-y-4 sm:space-y-6">
          {/* Motivational Hero Card */}
          <div className="bg-gradient-to-br from-amber-50 via-white to-stone-50 border border-amber-200 rounded-2xl p-4 sm:p-6 shadow-sm relative">
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="flex items-center space-x-2">
                <MessageSquareHeart className="w-5 h-5 text-amber-700 shrink-0" />
                <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                  Personal Weekly Affirmation & Momentum
                </span>
              </div>
              <span className="text-[11px] text-stone-500 font-mono flex items-center shrink-0">
                <Calendar className="w-3 h-3 mr-1 text-amber-600 shrink-0" />
                {insight.period}
              </span>
            </div>

            <p className="font-serif-heading text-base sm:text-xl text-stone-900 leading-relaxed italic my-2">
              "{insight.motivationalMessage}"
            </p>

            <div className="mt-4 pt-3 border-t border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-0">
              <span className="text-[11px] text-stone-500">
                Synthesized across {insight.journalCount} journal reflections
              </span>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end">
                {savedSuccess && (
                  <span className="text-xs text-emerald-700 font-medium flex items-center mr-2">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Saved to Vault
                  </span>
                )}
                <button
                  id="btn-save-insight-vault"
                  onClick={handleSaveToVault}
                  disabled={saving}
                  className="px-3.5 py-1.5 bg-white hover:bg-stone-50 active:bg-stone-100 text-amber-800 border border-amber-300 text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer min-h-[34px]"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Report to Vault'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4-Bento Grid: Topics, Highlights, Goals, Areas to Reflect */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-5">
            {/* 1. Recurring Topics */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center space-x-2 text-amber-800 font-semibold text-xs uppercase tracking-wider">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                <span>Recurring Themes & Patterns</span>
              </div>
              <ul className="space-y-2">
                {insight.recurringTopics.map((topic, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-xs text-stone-800">
                    <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{topic}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 2. Positive Highlights */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center space-x-2 text-emerald-800 font-semibold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Positive Highlights & Breakthroughs</span>
              </div>
              <ul className="space-y-2">
                {insight.highlights.map((item, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-xs text-stone-800">
                    <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      ★
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 3. Goals Tracked */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center space-x-2 text-amber-800 font-semibold text-xs uppercase tracking-wider">
                <Target className="w-4 h-4 text-amber-600" />
                <span>Aspirations & Goals Mentioned</span>
              </div>
              <ul className="space-y-2">
                {insight.goals.map((goal, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-xs text-stone-800">
                    <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      ◎
                    </span>
                    <span className="leading-relaxed">{goal}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 4. Areas to Reflect */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center space-x-2 text-stone-700 font-semibold text-xs uppercase tracking-wider">
                <HelpCircle className="w-4 h-4 text-amber-600" />
                <span>Gentle Questions for Upcoming Week</span>
              </div>
              <ul className="space-y-2">
                {insight.areasToReflect.map((area, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-xs text-stone-800">
                    <span className="w-5 h-5 rounded-md bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      ?
                    </span>
                    <span className="leading-relaxed">{area}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Past Reports List */}
          {pastInsights.length > 1 && (
            <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs">
              <h4 className="text-xs font-semibold text-stone-600 uppercase tracking-wider mb-3">
                Saved Reflection Reports Vault
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
                {pastInsights.map((pi) => (
                  <div
                    key={pi.id}
                    onClick={() => setInsight(pi)}
                    className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      insight.id === pi.id
                        ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-2xs'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:border-stone-300'
                    }`}
                  >
                    <div className="font-semibold text-stone-900 mb-1">{pi.period}</div>
                    <div className="text-[11px] text-stone-500 line-clamp-2">
                      {pi.motivationalMessage}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
