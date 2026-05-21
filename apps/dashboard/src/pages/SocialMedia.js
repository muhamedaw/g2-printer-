import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
const PLATFORM_COLORS = {
    twitter: 'bg-sky-900/60 text-sky-300 border-sky-700',
    instagram: 'bg-pink-900/60 text-pink-300 border-pink-700',
    tiktok: 'bg-purple-900/60 text-purple-300 border-purple-700',
};
const ACTION_ICONS = {
    post: '📢',
    like: '❤️',
    follow: '➕',
    caption: '📝',
};
const PLATFORM_ICONS = {
    twitter: '🐦',
    instagram: '📸',
    tiktok: '🎵',
};
export default function SocialMedia() {
    const [platformFilter, setPlatformFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('all');
    const stats = useQuery({
        queryKey: ['social-stats'],
        queryFn: () => api.get('/social/stats'),
        refetchInterval: 30000,
    });
    const activity = useQuery({
        queryKey: ['social-activity'],
        queryFn: () => api.get('/social/activity'),
        refetchInterval: 15000,
    });
    const captions = useQuery({
        queryKey: ['tiktok-captions'],
        queryFn: () => api.get('/social/tiktok-captions'),
        refetchInterval: 60000,
    });
    const filtered = (activity.data ?? []).filter(item => {
        if (platformFilter !== 'all' && item.platform !== platformFilter)
            return false;
        if (actionFilter !== 'all' && item.action !== actionFilter)
            return false;
        return true;
    });
    const s = stats.data;
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("h2", { className: "text-xl font-bold", children: "Social Media Bots" }), s && (_jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: [_jsxs("div", { className: "bg-sky-900/30 border border-sky-800 rounded-xl p-4", children: [_jsx("p", { className: "text-xs text-sky-400", children: "\uD83D\uDC26 Twitter Posts" }), _jsx("p", { className: "text-2xl font-bold mt-1", children: s.twitter.posts }), _jsxs("p", { className: "text-xs text-gray-500 mt-1", children: [s.twitter.likes, " likes given"] })] }), _jsxs("div", { className: "bg-pink-900/30 border border-pink-800 rounded-xl p-4", children: [_jsx("p", { className: "text-xs text-pink-400", children: "\uD83D\uDCF8 Instagram Posts" }), _jsx("p", { className: "text-2xl font-bold mt-1", children: s.instagram.posts }), _jsxs("p", { className: "text-xs text-gray-500 mt-1", children: [s.instagram.likes, " likes \u00B7 ", s.instagram.follows, " follows"] })] }), _jsxs("div", { className: "bg-purple-900/30 border border-purple-800 rounded-xl p-4", children: [_jsx("p", { className: "text-xs text-purple-400", children: "\uD83C\uDFB5 TikTok Captions" }), _jsx("p", { className: "text-2xl font-bold mt-1", children: s.tiktok.captions }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: "pending drafts" })] }), _jsxs("div", { className: "bg-gray-800 border border-gray-700 rounded-xl p-4", children: [_jsx("p", { className: "text-xs text-gray-400", children: "Total Actions" }), _jsx("p", { className: "text-2xl font-bold mt-1", children: s.twitter.posts + s.twitter.likes + s.instagram.posts + s.instagram.likes + s.instagram.follows }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: "across all platforms" })] })] })), (captions.data ?? []).length > 0 && (_jsxs("div", { className: "bg-gray-900 rounded-xl border border-purple-800/50 p-4", children: [_jsxs("h3", { className: "text-sm font-semibold text-purple-300 mb-3", children: ["\uD83C\uDFB5 TikTok Pending Captions (", captions.data.length, ")"] }), _jsx("div", { className: "space-y-2", children: captions.data.slice(0, 5).map((c, i) => (_jsx("div", { className: "bg-gray-800 rounded-lg p-3 text-sm", children: _jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsx("pre", { className: "text-gray-200 whitespace-pre-wrap font-sans text-xs leading-relaxed flex-1", children: c.caption }), _jsxs("div", { className: "text-right shrink-0", children: [_jsx("span", { className: `inline-block px-1.5 py-0.5 rounded text-xs font-medium ${c.trade.tradeType === 'BUY' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'}`, children: c.trade.symbol }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: new Date(c.createdAt).toLocaleTimeString() })] })] }) }, i))) })] })), _jsxs("div", { className: "bg-gray-900 rounded-xl border border-gray-800", children: [_jsxs("div", { className: "p-4 border-b border-gray-800 flex flex-wrap gap-3 items-center", children: [_jsx("span", { className: "text-sm font-semibold", children: "Activity Feed" }), _jsx("div", { className: "flex gap-1.5 flex-wrap ml-auto", children: ['all', 'twitter', 'instagram', 'tiktok'].map(p => (_jsx("button", { onClick: () => setPlatformFilter(p), className: `px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${platformFilter === p ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`, children: p === 'all' ? 'All' : `${PLATFORM_ICONS[p]} ${p.charAt(0).toUpperCase() + p.slice(1)}` }, p))) }), _jsx("div", { className: "flex gap-1.5 flex-wrap", children: ['all', 'post', 'like', 'follow', 'caption'].map(a => (_jsx("button", { onClick: () => setActionFilter(a), className: `px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${actionFilter === a ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`, children: a === 'all' ? 'All' : `${ACTION_ICONS[a]} ${a.charAt(0).toUpperCase() + a.slice(1)}s` }, a))) })] }), filtered.length === 0 ? (_jsx("div", { className: "p-12 text-center text-gray-500 text-sm", children: activity.isLoading ? 'Loading…' : 'No activity yet. Bots will post when trades execute.' })) : (_jsx("div", { className: "divide-y divide-gray-800/60", children: filtered.map((item, i) => (_jsxs("div", { className: "flex items-start gap-3 p-3 hover:bg-gray-800/30 transition-colors", children: [_jsxs("span", { className: `inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border shrink-0 mt-0.5 ${PLATFORM_COLORS[item.platform]}`, children: [PLATFORM_ICONS[item.platform], " ", item.platform] }), _jsx("span", { className: "text-base shrink-0", children: ACTION_ICONS[item.action] }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm text-gray-200 break-words leading-snug", children: item.content }), _jsxs("div", { className: "flex flex-wrap gap-2 mt-1 text-xs text-gray-500", children: [item.target && _jsxs("span", { children: ["\u2192 ", item.target] }), item.symbol && _jsxs("span", { className: "text-brand-400", children: ["$", item.symbol] }), item.trigger && _jsxs("span", { children: ["via ", item.trigger] })] })] }), _jsx("time", { className: "text-xs text-gray-600 shrink-0 mt-0.5", children: new Date(item.createdAt).toLocaleString(undefined, {
                                        month: 'short', day: 'numeric',
                                        hour: '2-digit', minute: '2-digit',
                                    }) })] }, i))) }))] })] }));
}
