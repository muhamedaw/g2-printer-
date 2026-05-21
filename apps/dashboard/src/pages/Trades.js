import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
export default function Trades() {
    const trades = useQuery({
        queryKey: ['trades'],
        queryFn: () => api.get('/trades?limit=100'),
    });
    const stats = useQuery({
        queryKey: ['trade-stats'],
        queryFn: () => api.get('/trades/stats'),
    });
    const s = stats.data;
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("h2", { className: "text-xl font-bold", children: "Trade History" }), s && (_jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: [
                    { label: 'Total Trades', value: String(s.totalTrades) },
                    { label: 'Win Rate', value: `${(s.winRate * 100).toFixed(0)}%` },
                    { label: 'Total PnL', value: `${Number(s.totalPnlUsd) >= 0 ? '+' : ''}$${Number(s.totalPnlUsd).toFixed(2)}` },
                    { label: 'Avg PnL', value: `${Number(s.avgPnlUsd) >= 0 ? '+' : ''}$${Number(s.avgPnlUsd).toFixed(2)}` },
                ].map(({ label, value }) => (_jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800", children: [_jsx("p", { className: "text-xs text-gray-400", children: label }), _jsx("p", { className: "text-xl font-bold mt-1", children: value })] }, label))) })), _jsx("div", { className: "bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-gray-400 text-xs border-b border-gray-800", children: [_jsx("th", { className: "text-left p-3", children: "Date" }), _jsx("th", { className: "text-left p-3", children: "Token" }), _jsx("th", { className: "text-left p-3", children: "Type" }), _jsx("th", { className: "text-left p-3", children: "Strategy" }), _jsx("th", { className: "text-right p-3", children: "Amount" }), _jsx("th", { className: "text-right p-3", children: "PnL" }), _jsx("th", { className: "text-right p-3", children: "Score" }), _jsx("th", { className: "text-center p-3", children: "Mode" })] }) }), _jsx("tbody", { children: (trades.data ?? []).map(t => (_jsxs("tr", { className: "border-b border-gray-800/50 hover:bg-gray-800/30", children: [_jsx("td", { className: "p-3 text-xs text-gray-400", children: new Date(t.createdAt).toLocaleDateString() }), _jsx("td", { className: "p-3 font-mono text-xs", children: t.tokenSymbol ?? `${t.contractAddress.slice(0, 6)}…` }), _jsx("td", { className: "p-3", children: _jsx("span", { className: `px-2 py-0.5 rounded text-xs font-medium ${t.tradeType === 'BUY' ? 'bg-brand-700 text-white' :
                                                t.tradeType === 'SELL_STOP_LOSS' ? 'bg-red-900 text-red-300' :
                                                    'bg-gray-700 text-gray-200'}`, children: t.tradeType.replace('SELL_', '') }) }), _jsx("td", { className: "p-3", children: t.source && (_jsx("span", { className: `px-2 py-0.5 rounded text-xs font-medium ${t.source === 'sniper' ? 'bg-yellow-900 text-yellow-300' :
                                                t.source === 'copy_trade' ? 'bg-purple-900 text-purple-300' :
                                                    t.source === 'pump_graduation' ? 'bg-blue-900 text-blue-300' :
                                                        'bg-gray-800 text-gray-400'}`, children: t.source === 'sniper' ? '⚡ sniper' :
                                                t.source === 'copy_trade' ? '🐋 copy' :
                                                    t.source === 'pump_graduation' ? '🎓 grad' :
                                                        t.source })) }), _jsxs("td", { className: "p-3 text-right", children: ["$", Number(t.usdAmount).toFixed(2)] }), _jsx("td", { className: `p-3 text-right ${t.pnlUsd === null ? 'text-gray-500' : Number(t.pnlUsd) >= 0 ? 'text-brand-500' : 'text-red-400'}`, children: t.pnlUsd !== null ? `${Number(t.pnlUsd) >= 0 ? '+' : ''}$${Number(t.pnlUsd).toFixed(2)}` : '—' }), _jsx("td", { className: "p-3 text-right text-xs text-gray-400", children: Number(t.finalScore).toFixed(0) }), _jsx("td", { className: "p-3 text-center text-xs", children: t.isPaperTrade
                                            ? _jsx("span", { className: "text-yellow-400", children: "paper" })
                                            : _jsx("span", { className: "text-brand-500", children: "live" }) })] }, t.id))) })] }) })] }));
}
