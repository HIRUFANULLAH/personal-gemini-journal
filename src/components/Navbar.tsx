import React from 'react';
import { 
  BookOpen, 
  Sparkles, 
  History, 
  ShieldCheck, 
  LogOut, 
  Lock, 
  PenTool,
  BrainCircuit,
  ShieldAlert,
  HardDrive
} from 'lucide-react';
import { AppUser } from '../types';

interface NavbarProps {
  user: AppUser | null;
  activeTab: 'chat' | 'history' | 'insights' | 'security';
  setActiveTab: (tab: 'chat' | 'history' | 'insights' | 'security') => void;
  onSignOut: () => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  setActiveTab,
  onSignOut,
  onOpenAuth
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 border-b border-stone-200 text-stone-900 backdrop-blur-md shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Brand */}
          <div 
            className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer select-none shrink-0" 
            onClick={() => setActiveTab('chat')}
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs font-bold shrink-0">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="font-brand text-sm sm:text-base md:text-lg font-bold tracking-tight sm:tracking-wider text-stone-900">
                  PERSONAL GEMINI JOURNAL
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Lock className="w-2.5 h-2.5 mr-1" />
                  E2E Isolated
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-stone-500 font-normal truncate max-w-[190px] sm:max-w-none">
                Private AI Reflection & Brainstorming
              </p>
            </div>
          </div>

          {/* Navigation Links - Desktop & Tablet */}
          {user && (
            <nav className="hidden lg:flex items-center space-x-1 bg-stone-100 p-1 rounded-xl border border-stone-200">
              <button
                id="nav-tab-chat"
                onClick={() => setActiveTab('chat')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'chat'
                    ? 'bg-white text-stone-900 font-semibold shadow-xs border border-stone-200/60'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <PenTool className="w-3.5 h-3.5 text-amber-700" />
                <span>New Session</span>
              </button>

              <button
                id="nav-tab-history"
                onClick={() => setActiveTab('history')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-white text-stone-900 font-semibold shadow-xs border border-stone-200/60'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <History className="w-3.5 h-3.5 text-amber-700" />
                <span>My Journals</span>
              </button>

              <button
                id="nav-tab-insights"
                onClick={() => setActiveTab('insights')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'insights'
                    ? 'bg-white text-stone-900 font-semibold shadow-xs border border-stone-200/60'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                <span>Weekly Insights</span>
              </button>

              <button
                id="nav-tab-security"
                onClick={() => setActiveTab('security')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'security'
                    ? 'bg-white text-stone-900 font-semibold shadow-xs border border-stone-200/60'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>Security Architecture</span>
              </button>
            </nav>
          )}

          {/* User Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            {user ? (
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="hidden md:flex flex-col text-right">
                  <span className="text-xs font-medium text-stone-800 truncate max-w-[140px] sm:max-w-[180px]">
                    {user.email || 'Authenticated User'}
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">
                    UID: {user.uid.slice(0, 8)}...
                  </span>
                </div>

                <button
                  id="btn-sign-out"
                  onClick={onSignOut}
                  title="Sign Out"
                  className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg border border-stone-200 transition-colors min-h-[38px] sm:min-h-[40px] cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-stone-600" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                id="btn-open-auth-header"
                onClick={onOpenAuth}
                className="px-3.5 sm:px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow-xs transition-colors cursor-pointer min-h-[40px] flex items-center"
              >
                <span>Sign In / Register</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile & Tablet Tab Bar (visible below lg) */}
        {user && (
          <div className="lg:hidden flex items-center justify-around py-1.5 border-t border-stone-200 bg-white">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[11px] font-medium min-h-[44px] transition-colors cursor-pointer ${
                activeTab === 'chat' ? 'text-amber-800 font-bold' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <PenTool className={`w-4 h-4 mb-0.5 ${activeTab === 'chat' ? 'text-amber-700' : 'text-stone-400'}`} />
              <span>Session</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[11px] font-medium min-h-[44px] transition-colors cursor-pointer ${
                activeTab === 'history' ? 'text-amber-800 font-bold' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <History className={`w-4 h-4 mb-0.5 ${activeTab === 'history' ? 'text-amber-700' : 'text-stone-400'}`} />
              <span>Journals</span>
            </button>
            <button
              onClick={() => setActiveTab('insights')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[11px] font-medium min-h-[44px] transition-colors cursor-pointer ${
                activeTab === 'insights' ? 'text-amber-800 font-bold' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Sparkles className={`w-4 h-4 mb-0.5 ${activeTab === 'insights' ? 'text-amber-700' : 'text-stone-400'}`} />
              <span>Insights</span>
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[11px] font-medium min-h-[44px] transition-colors cursor-pointer ${
                activeTab === 'security' ? 'text-amber-800 font-bold' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <ShieldCheck className={`w-4 h-4 mb-0.5 ${activeTab === 'security' ? 'text-emerald-700' : 'text-stone-400'}`} />
              <span>Security</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
