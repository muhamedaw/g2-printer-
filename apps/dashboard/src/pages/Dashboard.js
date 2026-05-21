import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api.js';
import StatCard from '../components/StatCard.js';
import { useTradeSocket } from '../lib/useTradeSocket.js';
function fmt(n) {
    return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
}
export default function Dashboard() {
    useTradeSocket(); // live trade notifications — invalidates queries on trade:executed
    const summary = useQuery({
        queryKey: ['portfolio-summary'],
        queryFn: () => api.get('/portfolio/summary'),
        refetchInterval: 15000,
    });
    const trades = useQuery({
        queryKey: ['recent-trades'],
        queryFn: () => api.get('/trades?limit=20'),
    });
    const bySource = useQuery({
        queryKey: ['trades-by-source'],
        queryFn: () => api.get('/trades/by-source'),
        refetchInterval: 30000,
    });
    const s = summary.data;
    const closedTrades = (trades.data ?? []).filter(t => t.pnlUsd !== null);
    // Build cumulative PnL chart data
    const chartData = closedTrades.slice().reverse().reduce((acc, t, i) => {
        const prev = acc[i - 1]?.pnl ?? 0;
        acc.push({ i: i + 1, pnl: prev + Number(t.pnlUsd ?? 0) });
        return acc;
    }, []);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between flex-wrap gap-2", children: [_jsx("h2", { className: "text-xl font-bold", children: "Dashboard" }), s && (_jsx("span", { className: `px-3 py-1 rounded-full text-xs font-medium ${s.paperTrading ? 'bg-yellow-500/20 text-yellow-400' : 'bg-brand-700 text-white'}`, children: s.paperTrading ? '📄 Paper Mode' : '🟢 Live Mode' }))] }), _jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsx(StatCard, { label: "Open Positions", value: String(s?.openPositions ?? '—') }), _jsx(StatCard, { label: "Invested", value: s ? `$${s.totalInvested.toFixed(2)}` : '—' }), _jsx(StatCard, { label: "Unrealized PnL", value: s ? fmt(s.unrealizedPnl) : '—', ...(s ? { positive: s.unrealizedPnl >= 0 } : {}) }), _jsx(StatCard, { label: "Realized PnL", value: s ? fmt(s.realizedPnl) : '—', ...(s ? { positive: s.realizedPnl >= 0, sub: `Win rate: ${s.winRate.toFixed(0)}%` } : {}) })] }), chartData.length > 1 && (_jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800", children: [_jsx("p", { className: "text-sm text-gray-400 mb-3", children: "Cumulative PnL ($)" }), _jsx(ResponsiveContainer, { width: "100%", height: 180, children: _jsxs(AreaChart, { data: chartData, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "pnlGrad", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#22c55e", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "#22c55e", stopOpacity: 0 })] }) }), _jsx(XAxis, { dataKey: "i", hide: true }), _jsx(YAxis, { tickFormatter: v => `$${v}`, width: 60, tick: { fill: '#9ca3af', fontSize: 11 } }), _jsx(Tooltip, { contentStyle: { background: '#111827', border: '1px solid #374151', borderRadius: 8 }, formatter: (v) => [`$${v.toFixed(2)}`, 'PnL'] }), _jsx(Area, { type: "monotone", dataKey: "pnl", stroke: "#22c55e", fill: "url(#pnlGrad)", strokeWidth: 2 })] }) })] })), (bySource.data ?? []).length > 0 && (_jsxs("div", { className: "bg-gray-900 rounded-xl border border-gray-800", children: [_jsx("p", { className: "text-sm font-medium p-4 border-b border-gray-800", children: "Strategy Performance" }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-gray-800", children: (bySource.data ?? []).map(s => {
                            const srcLabel = {
                                sniper: '⚡ Sniper',
                                copy_trade: '🐋 Copy Trade',
                                pump_graduation: '🎓 Graduation',
                                social: '📡 Social',
                                manual: '✋ Manual',
                            };
                            const pnlColor = s.totalPnl >= 0 ? 'text-green-400' : 'text-red-400';
                            return (_jsxs("div", { className: "p-4", children: [_jsx("p", { className: "text-xs text-gray-400 mb-1", children: srcLabel[s.source] ?? s.source }), _jsxs("p", { className: `text-lg font-bold ${pnlColor}`, children: [s.totalPnl >= 0 ? '+' : '', "$", s.totalPnl.toFixed(2)] }), _jsxs("p", { className: "text-xs text-gray-500 mt-1", children: [s.trades, " trades \u00B7 ", (s.winRate * 100).toFixed(0), "% win"] })] }, s.source));
                        }) })] })), _jsxs("div", { className: "bg-gray-900 rounded-xl border border-gray-800", children: [_jsx("p", { className: "text-sm font-medium p-4 border-b border-gray-800", children: "Recent Trades" }), (trades.data ?? []).length === 0 ? (_jsx("p", { className: "text-gray-500 text-sm p-4", children: "No trades yet." })) : (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-gray-400 text-xs border-b border-gray-800", children: [_jsx("th", { className: "text-left p-3", children: "Token" }), _jsx("th", { className: "text-left p-3", children: "Type" }), _jsx("th", { className: "text-left p-3", children: "Src" }), _jsx("th", { className: "text-right p-3", children: "Amount" }), _jsx("th", { className: "text-right p-3", children: "PnL" })] }) }), _jsx("tbody", { children: (trades.data ?? []).map(t => (_jsxs("tr", { className: "border-b border-gray-800/50 hover:bg-gray-800/30", children: [_jsx("td", { className: "p-3 font-mono text-xs", children: t.tokenSymbol ?? `${t.contractAddress.slice(0, 6)}…` }), _jsx("td", { className: "p-3", children: _jsx("span", { className: `px-2 py-0.5 rounded text-xs font-medium ${t.tradeType === 'BUY' ? 'bg-brand-700 text-white' : 'bg-gray-700 text-gray-200'}`, children: t.tradeType.replace('SELL_', '') }) }), _jsx("td", { className: "p-3 text-xs text-gray-400", children: t.source === 'sniper' ? '⚡' : t.source === 'copy_trade' ? '🐋' : t.source === 'pump_graduation' ? '🎓' : '📡' }), _jsxs("td", { className: "p-3 text-right", children: ["$", Number(t.usdAmount).toFixed(2)] }), _jsx("td", { className: `p-3 text-right ${t.pnlUsd === null ? 'text-gray-500' : Number(t.pnlUsd) >= 0 ? 'text-brand-500' : 'text-red-400'}`, children: t.pnlUsd !== null ? fmt(Number(t.pnlUsd)) : '—' })] }, t.id))) })] }))] })] }));
}
