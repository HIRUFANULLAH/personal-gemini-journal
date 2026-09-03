import React, { useState, useMemo } from 'react';
import { 
  loginAsGuest, 
  authenticateWithEmailPassword,
  signInWithGoogle
} from '../lib/firebase';
import { 
  Lock, 
  Mail, 
  KeyRound, 
  ShieldAlert, 
  CheckCircle2, 
  ArrowRight, 
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  Zap,
  Check,
  X,
  AlertCircle
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onSuccess
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Email Validation regex (RFC 5322 compliant simplified)
  const isEmailValid = useMemo(() => {
    const trimmed = email.trim();
    if (!trimmed) return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(trimmed);
  }, [email]);

  // Password Requirements Analysis
  const passwordChecks = useMemo(() => {
    const hasMinLength = password.length >= 6;
    const hasRecommendedLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    let score = 0;
    if (hasMinLength) score += 1;
    if (hasRecommendedLength) score += 1;
    if (hasUpper && hasLower) score += 1;
    if (hasNumber) score += 1;
    if (hasSpecial) score += 1;

    let strengthLabel = 'Very Weak';
    let strengthColor = 'bg-red-500 text-red-400';
    if (score >= 4) {
      strengthLabel = 'Strong';
      strengthColor = 'bg-emerald-500 text-emerald-400';
    } else if (score >= 3) {
      strengthLabel = 'Good';
      strengthColor = 'bg-amber-400 text-amber-400';
    } else if (score >= 2) {
      strengthLabel = 'Fair';
      strengthColor = 'bg-amber-600 text-amber-500';
    }

    return {
      hasMinLength,
      hasRecommendedLength,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
      score,
      strengthLabel,
      strengthColor,
    };
  }, [password]);

  const passwordsMatch = useMemo(() => {
    if (mode === 'signin') return true;
    if (!confirmPassword) return false;
    return password === confirmPassword;
  }, [mode, password, confirmPassword]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setEmailTouched(true);
    setPasswordTouched(true);
    setConfirmPasswordTouched(true);

    const trimmedEmail = email.trim();

    // 1. Email Format Validation Check
    if (!trimmedEmail) {
      setErrorMsg('Please provide an email address.');
      return;
    }

    if (!isEmailValid) {
      setErrorMsg('Please enter a valid email address format (e.g. name@domain.com).');
      return;
    }

    // 2. Password Length & Matching Validation Check
    if (!password) {
      setErrorMsg('Please enter a password.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters in length.');
      return;
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Please ensure both fields match exactly.');
        return;
      }
    }

    setLoading(true);
    try {
      await authenticateWithEmailPassword(trimmedEmail, password, mode);
      onSuccess();
    } catch (err: any) {
      let friendly = 'Authentication failed. Please verify your credentials.';
      if (err.code === 'auth/email-already-in-use') {
        friendly = 'An account with this email already exists. Please switch to "Sign In".';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        friendly = 'Invalid email or password. Please verify your credentials and try again.';
      } else if (err.code === 'auth/user-not-found') {
        friendly = 'No account found with this email. Please click "Create Account" to register.';
      } else if (err.code === 'auth/invalid-email') {
        friendly = 'The provided email address is invalid according to identity standards.';
      } else if (err.code === 'auth/weak-password') {
        friendly = 'Password is too weak. Please use at least 6 characters.';
      } else if (err.code === 'auth/network-request-failed') {
        friendly = 'Network error contacting Authentication service. Please check your connection or use Instant Sandbox Access.';
      }
      setErrorMsg(friendly);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInWithGoogle();
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await loginAsGuest();
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to initialize guest session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleModeSwitch = (newMode: 'signin' | 'signup') => {
    setMode(newMode);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-3 sm:px-4 py-4 sm:py-8">
      <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl shadow-xl p-5 sm:p-8 text-stone-800 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-amber-200/40 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-amber-300/30 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="text-center mb-5 sm:mb-6">
          <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-50 text-amber-700 mb-2.5 sm:mb-3 border border-amber-200 shadow-2xs">
            <Lock className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <h2 className="font-brand text-xl sm:text-2xl font-bold tracking-wide text-stone-900">
            {mode === 'signin' ? 'Welcome Back' : 'Create Private Journal'}
          </h2>
          <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto leading-relaxed">
            {mode === 'signin'
              ? 'Sign in to access your isolated, encrypted personal journal vault.'
              : 'Register for private, user-isolated journaling with Gemini & Firestore.'}
          </p>
        </div>

        {/* Primary: federated sign-in. No password is handled by this app. */}
        <button
          id="btn-google-signin"
          type="button"
          disabled={loading}
          onClick={handleGoogleLogin}
          className="w-full py-3 px-4 mb-4 bg-white hover:bg-stone-50 active:bg-stone-100 border border-stone-300 rounded-xl text-sm font-semibold text-stone-700 flex items-center justify-center space-x-2.5 transition-all shadow-xs disabled:opacity-50 cursor-pointer min-h-[46px]"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-stone-200" />
          <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">or</span>
          <div className="h-px flex-1 bg-stone-200" />
        </div>

        {/* Instant Access Banner */}
        <div className="mb-4 sm:mb-5 p-3 sm:p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 flex flex-col space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
            <span className="flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Instant Sandbox Access</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 font-bold">
              Instant
            </span>
          </div>
          <p className="text-[11px] text-stone-600 leading-relaxed">
            Test multi-turn AI journaling & weekly insights immediately in a sandboxed session:
          </p>
          <button
            id="btn-guest-access"
            type="button"
            disabled={loading}
            onClick={handleGuestLogin}
            className="w-full py-2.5 px-3 bg-white hover:bg-amber-50/80 active:bg-amber-100 border border-amber-300 rounded-lg text-xs font-bold text-amber-900 flex items-center justify-center space-x-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer min-h-[40px]"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Continue as Guest / Sandbox User</span>
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-stone-100 p-1 rounded-xl mb-4 sm:mb-6 border border-stone-200">
          <button
            type="button"
            onClick={() => handleModeSwitch('signin')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[36px] ${
              mode === 'signin'
                ? 'bg-white text-stone-900 shadow-xs border border-stone-200/60'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('signup')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[36px] ${
              mode === 'signup'
                ? 'bg-white text-stone-900 shadow-xs border border-stone-200/60'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start space-x-2.5">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email Field with Live Validation Indicator */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-medium text-stone-700" htmlFor="auth-email">
                Email Address
              </label>
              {emailTouched && email.length > 0 && (
                <span className={`text-[10px] flex items-center ${isEmailValid ? 'text-emerald-600 font-medium' : 'text-red-600'}`}>
                  {isEmailValid ? (
                    <>
                      <Check className="w-3 h-3 mr-1" /> Valid format
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3 mr-1" /> Invalid format
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="auth-email"
                type="email"
                value={email}
                onBlur={() => setEmailTouched(true)}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="your.name@example.com"
                required
                className={`w-full pl-9 pr-8 py-2.5 bg-stone-50 border rounded-xl text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 transition-colors ${
                  emailTouched && email.length > 0
                    ? isEmailValid
                      ? 'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20 bg-white'
                      : 'border-red-500 focus:border-red-500 focus:ring-red-500/20 bg-white'
                    : 'border-stone-300 focus:border-amber-500 focus:ring-amber-500/20 focus:bg-white'
                }`}
              />
              {emailTouched && email.length > 0 && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  {isEmailValid ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-600" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Password Field */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-medium text-stone-700" htmlFor="auth-password">
                Password
              </label>
              {mode === 'signup' && password.length > 0 && (
                <span className={`text-[10px] font-semibold ${passwordChecks.strengthColor}`}>
                  Strength: {passwordChecks.strengthLabel}
                </span>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onBlur={() => setPasswordTouched(true)}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="••••••••"
                required
                className={`w-full pl-9 pr-10 py-2.5 bg-stone-50 border rounded-xl text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 transition-colors ${
                  passwordTouched && password.length > 0 && password.length < 6
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20 bg-white'
                    : 'border-stone-300 focus:border-amber-500 focus:ring-amber-500/20 focus:bg-white'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Password strength meter for sign up */}
            {mode === 'signup' && password.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="grid grid-cols-4 gap-1 h-1">
                  <div className={`rounded-full ${passwordChecks.score >= 1 ? (passwordChecks.score >= 4 ? 'bg-emerald-500' : passwordChecks.score >= 3 ? 'bg-amber-500' : 'bg-red-500') : 'bg-stone-200'}`} />
                  <div className={`rounded-full ${passwordChecks.score >= 2 ? (passwordChecks.score >= 4 ? 'bg-emerald-500' : passwordChecks.score >= 3 ? 'bg-amber-500' : 'bg-amber-600') : 'bg-stone-200'}`} />
                  <div className={`rounded-full ${passwordChecks.score >= 3 ? (passwordChecks.score >= 4 ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-stone-200'}`} />
                  <div className={`rounded-full ${passwordChecks.score >= 4 ? 'bg-emerald-500' : 'bg-stone-200'}`} />
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-stone-500 pt-1">
                  <span className={`flex items-center ${passwordChecks.hasMinLength ? 'text-emerald-700 font-medium' : 'text-stone-400'}`}>
                    {passwordChecks.hasMinLength ? '✓' : '○'} Min. 6 characters
                  </span>
                  <span className={`flex items-center ${passwordChecks.hasNumber ? 'text-emerald-700 font-medium' : 'text-stone-400'}`}>
                    {passwordChecks.hasNumber ? '✓' : '○'} Contains number
                  </span>
                  <span className={`flex items-center ${passwordChecks.hasUpper && passwordChecks.hasLower ? 'text-emerald-700 font-medium' : 'text-stone-400'}`}>
                    {passwordChecks.hasUpper && passwordChecks.hasLower ? '✓' : '○'} Mixed case letters
                  </span>
                  <span className={`flex items-center ${passwordChecks.hasSpecial ? 'text-emerald-700 font-medium' : 'text-stone-400'}`}>
                    {passwordChecks.hasSpecial ? '✓' : '○'} Symbol / Special
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password Field (Sign Up mode only) */}
          {mode === 'signup' && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-medium text-stone-700" htmlFor="auth-confirm-password">
                  Confirm Password
                </label>
                {confirmPasswordTouched && confirmPassword.length > 0 && (
                  <span className={`text-[10px] flex items-center ${passwordsMatch ? 'text-emerald-700 font-medium' : 'text-red-600'}`}>
                    {passwordsMatch ? (
                      <>
                        <Check className="w-3 h-3 mr-1" /> Passwords match
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3 mr-1" /> Do not match
                      </>
                    )}
                  </span>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="auth-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onBlur={() => setConfirmPasswordTouched(true)}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="••••••••"
                  required
                  className={`w-full pl-9 pr-10 py-2.5 bg-stone-50 border rounded-xl text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 transition-colors ${
                    confirmPasswordTouched && confirmPassword.length > 0
                      ? passwordsMatch
                        ? 'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20 bg-white'
                        : 'border-red-500 focus:border-red-500 focus:ring-red-500/20 bg-white'
                      : 'border-stone-300 focus:border-amber-500 focus:ring-amber-500/20 focus:bg-white'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            id="btn-submit-auth"
            type="submit"
            disabled={loading}
            className="w-full mt-3 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer min-h-[44px]"
          >
            {loading ? (
              <span className="text-xs">Authenticating securely...</span>
            ) : (
              <>
                <span className="text-xs uppercase tracking-wider">
                  {mode === 'signin' ? 'Sign In to Journal' : 'Register Private Account'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Trust & Security Badge */}
        <div className="mt-4 sm:mt-5 p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-start space-x-2.5 text-[11px] text-stone-600">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="leading-tight">
            <strong className="text-stone-800 font-medium">Verified Data Isolation:</strong> Every record is constrained to your unique UID (<code className="text-amber-800 font-mono">users/{'{uid}'}/journals</code>).
          </div>
        </div>
      </div>
    </div>
  );
};
