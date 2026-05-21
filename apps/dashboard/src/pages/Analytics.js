import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
const SOURCE_LABELS = {
    sniper: { label: 'Sniper', emoji: '🎯', color: 'text-yellow-400' },
    copy_trade: { label: 'Copy Trade', emoji: '👤', color: 'text-purple-400' },
    pump_graduation: { label: 'Graduation', emoji: '🎓', color: 'text-blue-400' },
    social: { label: 'Social', emoji: '📡', color: 'text-gray-400' },
};
export default function Analytics() {
    const { data: sources, isLoading } = useQuery({
        queryKey: ['by-source'],
        queryFn: () => api.get('/trades/by-source'),
        refetchInterval: 60000,
    });
    const total = sources?.reduce((s, r) => ({ trades: s.trades + r.trades, pnl: s.pnl + r.totalPnl }), { trades: 0, pnl: 0 });
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("h2", { className: "text-xl font-bold", children: "Strategy Analytics" }), total && (_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800", children: [_jsx("p", { className: "text-xs text-gray-400", children: "Total Closed Trades" }), _jsx("p", { className: "text-2xl font-bold mt-1", children: total.trades })] }), _jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800", children: [_jsx("p", { className: "text-xs text-gray-400", children: "Total Realized PnL" }), _jsxs("p", { className: `text-2xl font-bold mt-1 ${total.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`, children: [total.pnl >= 0 ? '+' : '', "$", total.pnl.toFixed(2)] })] })] })), _jsxs("div", { className: "bg-gray-900 rounded-xl border border-gray-800 overflow-hidden", children: [_jsx("div", { className: "p-4 border-b border-gray-800", children: _jsx("h3", { className: "font-semibold text-sm", children: "PnL by Signal Source" }) }), isLoading && (_jsx("div", { className: "p-8 text-center text-gray-500 text-sm", children: "Loading\u2026" })), !isLoading && (!sources || sources.length === 0) && (_jsx("div", { className: "p-8 text-center text-gray-500 text-sm", children: "No closed trades yet" })), (sources ?? []).map(row => {
                        const meta = SOURCE_LABELS[row.source] ?? { label: row.source, emoji: '📊', color: 'text-gray-400' };
                        const bar = Math.min(100, Math.round(row.winRate * 100));
                        const pnlPos = row.totalPnl >= 0;
                        return (_jsxs("div", { className: "p-4 border-b border-gray-800 last:border-0", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-lg", children: meta.emoji }), _jsx("span", { className: `font-semibold text-sm ${meta.color}`, children: meta.label }), _jsxs("span", { className: "text-xs text-gray-500", children: [row.trades, " trades"] })] }), _jsxs("div", { className: "text-right", children: [_jsxs("span", { className: `font-bold text-sm ${pnlPos ? 'text-green-400' : 'text-red-400'}`, children: [pnlPos ? '+' : '', "$", row.totalPnl.toFixed(2)] }), _jsxs("span", { className: "text-xs text-gray-400 ml-2", children: [(row.winRate * 100).toFixed(0), "% win"] })] })] }), _jsx("div", { className: "w-full bg-gray-800 rounded-full h-1.5", children: _jsx("div", { className: `h-1.5 rounded-full ${bar >= 50 ? 'bg-green-500' : 'bg-red-500'}`, style: { width: `${bar}%` } }) }), _jsxs("div", { className: "flex justify-between text-xs text-gray-600 mt-1", children: [_jsxs("span", { children: [row.wins, " wins"] }), _jsxs("span", { children: [row.trades - row.wins, " losses"] })] })] }, row.source));
                    })] })] }));
}
