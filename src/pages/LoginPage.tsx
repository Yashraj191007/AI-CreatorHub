import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Sparkles, Mail, Lock, ArrowRight, AlertCircle, Shield } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('creator@aicreatorhub.com');
  const [password, setPassword] = useState('creatorpassword123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get('oauth_code');
    const returnTo = params.get('return_to') || '/dashboard';
    const oauthError = params.get('error');

    if (oauthError) {
      setError(decodeURIComponent(oauthError));
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthCode) {
      // Immediately scrub the exchange code from the browser URL bar and history
      window.history.replaceState({}, document.title, window.location.pathname);

      setLoading(true);
      api
        .post('/auth/oauth/exchange-code', { code: oauthCode })
        .then((res) => {
          if (res.data.success && res.data.token && res.data.user) {
            login(res.data.token, res.data.user);
            const safeReturnTo =
              returnTo.startsWith('/') &&
              !returnTo.startsWith('//') &&
              !returnTo.includes(':') &&
              !returnTo.includes('\\')
                ? returnTo
                : '/dashboard';
            navigate(safeReturnTo, { replace: true });
          } else {
            setError('OAuth login failed: Invalid token response received.');
          }
        })
        .catch((err: any) => {
          setError(
            err.response?.data?.error ||
              'OAuth exchange failed. The login code may have expired or already been used. Please try again.'
          );
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [login, navigate]);

  const handleGoogleLogin = () => {
    setError(null);
    window.location.href = '/api/auth/google';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.success) {
        login(res.data.token, res.data.user);
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid credentials or server error.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDemo = (type: 'USER' | 'ADMIN') => {
    if (type === 'USER') {
      setEmail('creator@aicreatorhub.com');
      setPassword('creatorpassword123');
    } else {
      setEmail('admin@aicreatorhub.com');
      setPassword('adminpassword123');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">AI CreatorHub</span>
          </Link>
          <h2 className="text-2xl font-bold text-white pt-2">Welcome Back</h2>
          <p className="text-xs text-slate-400">Sign in to access your creator dashboard and AI tools</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full py-2.5 px-4 rounded-xl font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 hover:border-slate-600 flex items-center justify-center gap-3 transition-all shadow-sm group"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.88c2.27-2.09 3.66-5.17 3.66-9.09z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.1C3.27 21.43 7.37 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.32c-.25-.72-.38-1.49-.38-2.32s.13-1.6.38-2.32V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.1z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.27 2.57 1.25 6.58l4.03 3.1c.95-2.83 3.6-4.93 6.72-4.93z"
            />
          </svg>
          <span className="text-sm font-semibold text-slate-100 group-hover:text-white">Continue with Google</span>
        </button>

        <div className="relative flex items-center justify-center my-2">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold absolute">
            or continue with email
          </span>
        </div>

        {/* Quick Demo Credentials Switcher */}
        <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 text-xs">
          <div className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            Quick Demo Accounts (Pre-seeded):
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleSetDemo('USER')}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-medium text-center text-[11px] transition-colors"
            >
              Demo Creator User
            </button>
            <button
              type="button"
              onClick={() => handleSetDemo('ADMIN')}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-medium text-center text-[11px] transition-colors"
            >
              Admin Console User
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="creator@aicreatorhub.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In to CreatorHub'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800">
          Don't have an account?{' '}
          <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-semibold">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
};
