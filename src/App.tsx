import React, { useState, useEffect } from 'react';
import { subscribeToAuth, logoutUser, getUserJournals } from './lib/firebase';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { JournalChat } from './components/JournalChat';
import { SummaryModal } from './components/SummaryModal';
import { JournalHistory } from './components/JournalHistory';
import { WeeklyInsightsView } from './components/WeeklyInsightsView';
import { SecurityArchitectureModal } from './components/SecurityArchitectureModal';
import { JournalEntry, ChatMessage, SummarizeResponse, AppUser } from './types';
import { 
  BookOpen, 
  ShieldCheck, 
  Sparkles, 
  Lock, 
  ArrowRight, 
  History, 
  Layers, 
  KeyRound, 
  Cpu, 
  CheckCircle2,
  TrendingUp,
  BrainCircuit
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'insights' | 'security'>('chat');
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [journalsLoading, setJournalsLoading] = useState(false);
  
  // Summarization review modal state
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [pendingConversation, setPendingConversation] = useState<ChatMessage[]>([]);
  const [pendingSummaryData, setPendingSummaryData] = useState<SummarizeResponse | null>(null);

  // Universal Auth observer
  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch journals whenever user changes or tab switches to history/insights
  useEffect(() => {
    if (user) {
      loadJournals();
    } else {
      setJournals([]);
    }
  }, [user]);

  const loadJournals = async () => {
    if (!user) return;
    setJournalsLoading(true);
    try {
      const data = await getUserJournals(user.uid);
      setJournals(data);
    } catch (err) {
      console.error('[Error loading journals]:', err);
    } finally {
      setJournalsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutUser();
      setActiveTab('chat');
      setPendingSummaryData(null);
      setSummaryModalOpen(false);
    } catch (err) {
      console.error('[Sign Out Error]:', err);
    }
  };

  const handleSummarizeComplete = (conversation: ChatMessage[], summaryData: SummarizeResponse) => {
    setPendingConversation(conversation);
    setPendingSummaryData(summaryData);
    setSummaryModalOpen(true);
  };

  const handleJournalSaved = (newEntry: JournalEntry) => {
    setJournals((prev) => [newEntry, ...prev.filter(j => j.id !== newEntry.id)]);
    setSummaryModalOpen(false);
    setActiveTab('history');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center text-stone-600">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono text-stone-500">Verifying secure authentication session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-950">
      {/* Universal Top Navigation */}
      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSignOut={handleSignOut}
        onOpenAuth={() => {}}
      />

      {/* Main Body */}
      <main className="flex-1">
        {!user ? (
          /* Unauthenticated Landing / Login Page */
          <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Product Value & Security Blueprint */}
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Zero-Knowledge Frontend Secrets • E2E User Isolated</span>
                </div>

                <h1 className="font-brand text-3xl sm:text-5xl font-bold tracking-tight text-stone-900 leading-tight">
                  A Safe, Private Haven for Your Deepest Reflections.
                </h1>

                <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl">
                  Personal Gemini Journal couples multi-turn conversational AI with zero-compromise cloud security. Reflect on decisions, brainstorm ideas, and track emotional momentum without exposing your data or API credentials.
                </p>

                {/* 3 Core Security Pillars */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1.5 shadow-xs">
                    <div className="text-amber-600">
                      <Lock className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-xs text-stone-800">Strict Data Isolation</h3>
                    <p className="text-[11px] text-stone-500 leading-relaxed">
                      Partitioned under <code>users/{'{uid}'}/journals</code> enforced by strict Firestore Security Rules.
                    </p>
                  </div>

                  <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1.5 shadow-xs">
                    <div className="text-amber-600">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-xs text-stone-800">Secret Manager</h3>
                    <p className="text-[11px] text-stone-500 leading-relaxed">
                      Gemini API credentials stay locked on trusted backend. Zero keys shipped to client.
                    </p>
                  </div>

                  <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1.5 shadow-xs">
                    <div className="text-amber-600">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-xs text-stone-800">Weekly Insights</h3>
                    <p className="text-[11px] text-stone-500 leading-relaxed">
                      Original AI analysis identifying recurring themes, milestone highlights, and personal goals.
                    </p>
                  </div>
                </div>

                {/* Architecture Highlights */}
                <div className="p-4 bg-white border border-stone-200 rounded-xl text-xs text-stone-600 flex items-center space-x-3 shadow-xs">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-100">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-stone-800 font-medium">Architecture:</strong> Browser → Firebase Auth Token → Express Backend → GCP Secret Manager → Gemini 2.5 Flash → Isolated Firestore.
                  </div>
                </div>
              </div>

              {/* Right Column: Direct Sign In / Registration Form */}
              <div className="lg:col-span-5">
                <AuthModal
                  isOpen={true}
                  onSuccess={() => {
                    setActiveTab('chat');
                    loadJournals();
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Authenticated Dashboard Tabs */
          <div className="w-full">
            {activeTab === 'chat' && (
              <div className="py-4">
                <JournalChat
                  onSummarizeComplete={handleSummarizeComplete}
                  activeEntriesCount={journals.length}
                />
              </div>
            )}

            {activeTab === 'history' && (
              <JournalHistory
                user={user}
                journals={journals}
                loading={journalsLoading}
                onRefresh={loadJournals}
                onSelectNewSession={() => setActiveTab('chat')}
              />
            )}

            {activeTab === 'insights' && (
              <WeeklyInsightsView
                user={user}
                journals={journals}
                onSelectNewSession={() => setActiveTab('chat')}
              />
            )}

            {activeTab === 'security' && (
              <SecurityArchitectureModal
                isOpen={true}
              />
            )}
          </div>
        )}
      </main>

      {/* Summary Synthesis Review Modal */}
      {user && summaryModalOpen && pendingSummaryData && (
        <SummaryModal
          user={user}
          isOpen={summaryModalOpen}
          conversation={pendingConversation}
          summaryData={pendingSummaryData}
          onClose={() => setSummaryModalOpen(false)}
          onSaved={handleJournalSaved}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-4 text-center text-xs text-stone-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-brand font-bold text-stone-700">Personal Gemini Journal</span>
            <span>•</span>
            <span className="text-emerald-700 flex items-center font-medium">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              Security-First Architecture
            </span>
          </div>
          <div className="text-[11px] text-stone-500 font-mono">
            Firestore Rule Isolated • Google Cloud Secret Manager Protected
          </div>
        </div>
      </footer>
    </div>
  );
}
