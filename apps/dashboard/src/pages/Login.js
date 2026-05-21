import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { api } from '../lib/api.js';
export default function Login() {
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const setAuth = useAuthStore(s => s.setAuth);
    const navigate = useNavigate();
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
            const data = await api.post(endpoint, { email, password });
            setAuth(data.token, data.user.id, data.user.email, data.user.planTier);
            void navigate('/');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Request failed';
            setError(msg.includes('409') ? 'Email already registered' : msg.includes('401') ? 'Invalid credentials' : msg);
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "min-h-screen bg-gray-950 flex items-center justify-center p-4", children: _jsxs("div", { className: "w-full max-w-sm", children: [_jsx("h1", { className: "text-3xl font-bold text-center text-brand-500 mb-2", children: "\uD83D\uDCB0 Money Printer G2" }), _jsx("p", { className: "text-center text-gray-400 text-sm mb-6", children: mode === 'login' ? 'Sign in to your account' : 'Create a new account' }), _jsx("div", { className: "flex bg-gray-900 rounded-xl p-1 mb-4 border border-gray-800", children: ['login', 'register'].map(m => (_jsx("button", { onClick: () => { setMode(m); setError(''); }, className: `flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`, children: m === 'login' ? 'Sign In' : 'Register' }, m))) }), _jsxs("form", { onSubmit: e => { void handleSubmit(e); }, className: "bg-gray-900 rounded-2xl p-6 border border-gray-800 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm text-gray-400 mb-1", children: "Email" }), _jsx("input", { type: "email", value: email, onChange: e => setEmail(e.target.value), required: true, className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500", placeholder: "you@example.com" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm text-gray-400 mb-1", children: "Password" }), _jsx("input", { type: "password", value: password, onChange: e => setPassword(e.target.value), required: true, minLength: 8, className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" })] }), error && _jsx("p", { className: "text-red-400 text-xs", children: error }), _jsx("button", { type: "submit", disabled: loading, className: "w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors", children: loading ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign In' : 'Create Account') })] })] }) }));
}
