import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
export default function ApiKeys() {
    const qc = useQueryClient();
    const plan = useAuthStore(s => s.plan);
    const canUse = plan === 'pro' || plan === 'whale';
    const [newName, setNewName] = useState('');
    const [newLimit, setNewLimit] = useState(10000);
    const [adding, setAdding] = useState(false);
    const [revealed, setRevealed] = useState(null);
    const [copied, setCopied] = useState(false);
    const keys = useQuery({
        queryKey: ['api-keys'],
        queryFn: () => api.get('/keys'),
        enabled: canUse,
    });
    const create = useMutation({
        mutationFn: () => api.post('/keys', { name: newName, limit: newLimit }),
        onSuccess: ({ key }) => {
            setRevealed(key);
            setNewName('');
            setAdding(false);
            void qc.invalidateQueries({ queryKey: ['api-keys'] });
        },
    });
    const del = useMutation({
        mutationFn: (id) => api.delete(`/keys/${id}`),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: ['api-keys'] }); },
    });
    function copyKey() {
        if (!revealed)
            return;
        void navigator.clipboard.writeText(revealed);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
    if (!canUse) {
        return (_jsxs("div", { className: "space-y-4 max-w-lg", children: [_jsx("h2", { className: "text-xl font-bold", children: "API Keys" }), _jsxs("div", { className: "bg-gray-900 rounded-xl p-6 border border-gray-800 text-center space-y-3", children: [_jsx("p", { className: "text-4xl", children: "\uD83D\uDD11" }), _jsx("p", { className: "font-medium", children: "Pro plan required" }), _jsx("p", { className: "text-sm text-gray-400", children: "Upgrade to Pro or Whale to generate API keys and access the REST API." }), _jsx("a", { href: "/subscription", className: "inline-block mt-2 px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-500 text-white transition-colors", children: "View Plans" })] })] }));
    }
    const rows = keys.data ?? [];
    return (_jsxs("div", { className: "space-y-5 max-w-2xl", children: [_jsxs("div", { className: "flex items-center justify-between flex-wrap gap-3", children: [_jsx("h2", { className: "text-xl font-bold", children: "API Keys" }), _jsxs("button", { onClick: () => setAdding(v => !v), disabled: rows.length >= 5, className: "px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white transition-colors", children: ["+ New Key ", rows.length >= 5 && '(limit reached)'] })] }), revealed && (_jsxs("div", { className: "bg-yellow-950 border border-yellow-700 rounded-xl p-4 space-y-2", children: [_jsx("p", { className: "text-xs text-yellow-400 font-medium", children: "Copy this key now \u2014 it will not be shown again." }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("code", { className: "flex-1 text-xs font-mono bg-gray-950 px-3 py-2 rounded-lg break-all text-white", children: revealed }), _jsx("button", { onClick: copyKey, className: "px-3 py-1.5 rounded-lg text-xs bg-yellow-700 hover:bg-yellow-600 text-white shrink-0", children: copied ? 'Copied!' : 'Copy' })] }), _jsx("button", { onClick: () => setRevealed(null), className: "text-xs text-gray-500 hover:text-gray-300", children: "Dismiss" })] })), adding && (_jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-brand-700 space-y-3", children: [_jsx("p", { className: "text-sm font-medium", children: "New API Key" }), _jsx("input", { value: newName, onChange: e => setNewName(e.target.value), placeholder: "Key name (e.g. my-bot)", className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" }), _jsxs("div", { children: [_jsx("label", { className: "text-xs text-gray-400", children: "Daily request limit" }), _jsx("input", { type: "number", value: newLimit, onChange: e => setNewLimit(parseInt(e.target.value)), className: "w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500", min: 100, max: 100000, step: 1000 })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => create.mutate(), disabled: !newName.trim() || create.isPending, className: "px-4 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white transition-colors", children: create.isPending ? 'Creating…' : 'Create' }), _jsx("button", { onClick: () => setAdding(false), className: "px-4 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors", children: "Cancel" })] })] })), keys.isLoading && _jsx("p", { className: "text-gray-400 text-sm", children: "Loading\u2026" }), !keys.isLoading && rows.length === 0 && !adding && (_jsx("p", { className: "text-gray-500 text-sm", children: "No API keys yet. Create one above." })), rows.length > 0 && (_jsx("div", { className: "bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-gray-400 text-xs border-b border-gray-800", children: [_jsx("th", { className: "text-left p-3", children: "Name" }), _jsx("th", { className: "text-right p-3", children: "Requests today" }), _jsx("th", { className: "text-right p-3", children: "Limit" }), _jsx("th", { className: "text-left p-3", children: "Last used" }), _jsx("th", { className: "p-3" })] }) }), _jsx("tbody", { children: rows.map(k => (_jsxs("tr", { className: "border-b border-gray-800/50 hover:bg-gray-800/30", children: [_jsx("td", { className: "p-3 font-medium", children: k.name }), _jsx("td", { className: "p-3 text-right", children: _jsx("span", { className: k.requestsToday >= k.requestLimit * 0.9 ? 'text-red-400' : 'text-white', children: k.requestsToday }) }), _jsx("td", { className: "p-3 text-right text-gray-400", children: k.requestLimit.toLocaleString() }), _jsx("td", { className: "p-3 text-xs text-gray-400", children: k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never' }), _jsx("td", { className: "p-3 text-right", children: _jsx("button", { onClick: () => { if (confirm(`Delete key "${k.name}"?`))
                                                del.mutate(k.id); }, disabled: del.isPending, className: "text-xs text-red-400 hover:text-red-300 disabled:opacity-40", children: "Delete" }) })] }, k.id))) })] }) }))] }));
}
