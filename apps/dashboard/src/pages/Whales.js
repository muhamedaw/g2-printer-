import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
const PATTERN_COLORS = {
    insider: 'bg-purple-900 text-purple-300',
    institutional: 'bg-blue-900 text-blue-300',
    lucky_retail: 'bg-yellow-900 text-yellow-300',
    unknown: 'bg-gray-700 text-gray-400',
};
function ScoreBar({ score }) {
    const color = score >= 80 ? 'bg-brand-500' : score >= 65 ? 'bg-yellow-500' : score >= 50 ? 'bg-orange-500' : 'bg-gray-600';
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-20 bg-gray-800 rounded-full h-1.5", children: _jsx("div", { className: `${color} h-1.5 rounded-full`, style: { width: `${score}%` } }) }), _jsx("span", { className: "text-xs font-medium", children: score })] }));
}
export default function Whales() {
    const qc = useQueryClient();
    const plan = useAuthStore(s => s.plan);
    const canUse = plan === 'pro' || plan === 'whale';
    const [newAddr, setNewAddr] = useState('');
    const [newNick, setNewNick] = useState('');
    const [adding, setAdding] = useState(false);
    const wallets = useQuery({
        queryKey: ['whales'],
        queryFn: () => api.get('/whales'),
        refetchInterval: 60000,
        enabled: canUse,
    });
    const stats = useQuery({
        queryKey: ['whales-stats'],
        queryFn: () => api.get('/whales/stats'),
        refetchInterval: 60000,
        enabled: canUse,
    });
    const add = useMutation({
        mutationFn: (body) => api.post('/whales', body),
        onSuccess: () => {
            setNewAddr('');
            setNewNick('');
            setAdding(false);
            void qc.invalidateQueries({ queryKey: ['whales'] });
        },
    });
    const s = stats.data;
    const rows = wallets.data ?? [];
    if (!canUse) {
        return (_jsxs("div", { className: "space-y-4 max-w-lg", children: [_jsx("h2", { className: "text-xl font-bold", children: "Whale Tracker" }), _jsxs("div", { className: "bg-gray-900 rounded-xl p-6 border border-gray-800 text-center space-y-3", children: [_jsx("p", { className: "text-4xl", children: "\uD83D\uDC33" }), _jsx("p", { className: "font-medium", children: "Pro plan required" }), _jsx("p", { className: "text-sm text-gray-400", children: "Upgrade to Pro or Whale to track wallets and receive copy-trade signals." }), _jsx("a", { href: "/subscription", className: "inline-block mt-2 px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-500 text-white transition-colors", children: "View Plans" })] })] }));
    }
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "flex items-center justify-between flex-wrap gap-3", children: [_jsx("h2", { className: "text-xl font-bold", children: "Whale Tracker" }), _jsx("button", { onClick: () => setAdding(v => !v), className: "px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white transition-colors", children: "+ Track Wallet" })] }), adding && (_jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-brand-700 space-y-3", children: [_jsx("p", { className: "text-sm font-medium", children: "Add Wallet to Track" }), _jsx("input", { value: newAddr, onChange: e => setNewAddr(e.target.value), placeholder: "Solana wallet address (32-44 chars)", className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-brand-500" }), _jsx("input", { value: newNick, onChange: e => setNewNick(e.target.value), placeholder: "Nickname (optional)", className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-brand-500" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => add.mutate({ address: newAddr, ...(newNick ? { nickname: newNick } : {}) }), disabled: newAddr.length < 32 || add.isPending, className: "px-4 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 transition-colors", children: add.isPending ? 'Queuing…' : 'Add' }), _jsx("button", { onClick: () => setAdding(false), className: "px-4 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors", children: "Cancel" })] }), add.isSuccess && _jsx("p", { className: "text-xs text-brand-400", children: "Queued \u2014 classification takes ~30s" })] })), s && (_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: [
                    { label: 'Tracked Wallets', value: String(s.total) },
                    { label: 'Avg Score', value: String(s.avgScore) },
                    { label: 'High Quality', value: String(s.highQuality) },
                    { label: 'Copy Signals 24h', value: String(s.copySignals24h) },
                ].map(({ label, value }) => (_jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800", children: [_jsx("p", { className: "text-xs text-gray-400", children: label }), _jsx("p", { className: "text-2xl font-bold mt-1", children: value })] }, label))) })), wallets.isLoading && _jsx("p", { className: "text-gray-400 text-sm", children: "Loading\u2026" }), !wallets.isLoading && rows.length === 0 && (_jsx("p", { className: "text-gray-500 text-sm", children: "No wallets tracked yet. Add one above or set SEED_WALLETS env var." })), rows.length > 0 && (_jsx("div", { className: "bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-gray-400 text-xs border-b border-gray-800", children: [_jsx("th", { className: "text-left p-3", children: "Wallet" }), _jsx("th", { className: "text-left p-3", children: "Pattern" }), _jsx("th", { className: "text-right p-3", children: "Win Rate" }), _jsx("th", { className: "text-right p-3", children: "Avg Profit" }), _jsx("th", { className: "text-right p-3", children: "Trades" }), _jsx("th", { className: "text-left p-3", children: "Score" }), _jsx("th", { className: "text-right p-3", children: "Copy \u00D7" })] }) }), _jsx("tbody", { children: rows.map(w => (_jsxs("tr", { className: `border-b border-gray-800/50 hover:bg-gray-800/30 ${!w.isActive ? 'opacity-40' : ''}`, children: [_jsxs("td", { className: "p-3", children: [_jsxs("p", { className: "font-mono text-xs text-gray-300", children: [w.walletAddress.slice(0, 8), "\u2026", w.walletAddress.slice(-4)] }), w.nickname && _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: w.nickname })] }), _jsx("td", { className: "p-3", children: _jsx("span", { className: `px-2 py-0.5 rounded text-xs font-medium ${PATTERN_COLORS[w.pattern] ?? 'bg-gray-700 text-gray-400'}`, children: w.pattern }) }), _jsxs("td", { className: "p-3 text-right", children: [(w.winRate * 100).toFixed(0), "%"] }), _jsxs("td", { className: "p-3 text-right", children: [w.avgProfitX.toFixed(1), "x"] }), _jsx("td", { className: "p-3 text-right text-gray-400", children: w.totalTrades }), _jsx("td", { className: "p-3", children: _jsx(ScoreBar, { score: w.score }) }), _jsxs("td", { className: `p-3 text-right font-medium ${w.copyWeight >= 1.5 ? 'text-brand-400' : 'text-gray-400'}`, children: [w.copyWeight.toFixed(1), "x"] })] }, w.walletAddress))) })] }) }))] }));
}
