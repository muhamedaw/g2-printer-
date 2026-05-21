import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
const PLATFORM_ICONS = {
    twitter: '𝕏',
    reddit: '🟠',
    telegram: '✈️',
    news: '📰',
};
const PLATFORM_COLORS = {
    twitter: 'bg-sky-900 text-sky-300',
    reddit: 'bg-orange-900 text-orange-300',
    telegram: 'bg-blue-900 text-blue-300',
    news: 'bg-gray-700 text-gray-300',
};
export default function Signals() {
    const [platform, setPlatform] = useState('all');
    const signals = useQuery({
        queryKey: ['signals', platform],
        queryFn: () => api.get(`/signals?platform=${platform}&limit=100`),
        refetchInterval: 30000,
    });
    const stats = useQuery({
        queryKey: ['signals-stats'],
        queryFn: () => api.get('/signals/stats'),
        refetchInterval: 60000,
    });
    const rows = signals.data ?? [];
    const statRows = stats.data ?? [];
    const total24h = statRows.reduce((s, r) => s + r.count, 0);
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-xl font-bold", children: "AI Signals Feed" }), _jsxs("span", { className: "text-xs text-gray-500", children: [total24h, " signals in last 24h"] })] }), statRows.length > 0 && (_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: statRows.map(s => (_jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800", children: [_jsxs("p", { className: "text-xs text-gray-400", children: [PLATFORM_ICONS[s.platform] ?? '🔹', " ", s.platform] }), _jsx("p", { className: "text-2xl font-bold mt-1", children: s.count }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: "last 24h" })] }, s.platform))) })), _jsx("div", { className: "flex gap-2 flex-wrap", children: ['all', 'twitter', 'reddit', 'telegram', 'news'].map(p => (_jsxs("button", { onClick: () => setPlatform(p), className: `px-3 py-1 rounded-lg text-xs font-medium transition-colors ${platform === p
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`, children: [PLATFORM_ICONS[p] ?? '', " ", p] }, p))) }), _jsxs("div", { className: "space-y-2", children: [signals.isLoading && _jsx("p", { className: "text-gray-400 text-sm", children: "Loading\u2026" }), !signals.isLoading && rows.length === 0 && (_jsx("p", { className: "text-gray-500 text-sm", children: "No signals yet." })), rows.map(s => (_jsx("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800", children: _jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1.5 flex-wrap", children: [_jsxs("span", { className: `px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[s.platform] ?? 'bg-gray-700 text-gray-300'}`, children: [PLATFORM_ICONS[s.platform] ?? '🔹', " ", s.platform] }), s.contractAddress && (_jsxs("span", { className: "font-mono text-xs text-gray-500", children: [s.contractAddress.slice(0, 8), "\u2026", s.contractAddress.slice(-4)] })), (s.authorFollowers ?? 0) > 10000 && (_jsxs("span", { className: "text-xs text-yellow-400", children: ["\u2B50 ", ((s.authorFollowers ?? 0) / 1000).toFixed(0), "K"] }))] }), _jsx("p", { className: "text-sm text-gray-200 line-clamp-2", children: s.content })] }), _jsxs("div", { className: "text-right shrink-0", children: [_jsxs("p", { className: "text-xs font-medium text-brand-400", children: [Number(s.engagementScore ?? 0).toFixed(0), _jsx("span", { className: "text-gray-500 font-normal", children: " eng" })] }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: new Date(s.createdAt).toLocaleTimeString() })] })] }) }, s.id)))] })] }));
}
