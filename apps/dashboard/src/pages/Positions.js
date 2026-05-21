import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useTradeSocket } from '../lib/useTradeSocket.js';
const srcEmoji = {
    sniper: '⚡',
    copy_trade: '🐋',
    pump_graduation: '🎓',
    social: '📡',
    manual: '✋',
};
export default function Positions() {
    useTradeSocket(); // refresh on every trade:executed event
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['positions'],
        queryFn: () => api.get('/portfolio/positions'),
        refetchInterval: 15000,
    });
    const close = useMutation({
        mutationFn: (id) => api.post(`/portfolio/positions/${id}/close`, {}),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: ['positions'] }); },
    });
    const positions = data ?? [];
    const totalInvested = positions.reduce((s, p) => s + Number(p.usdInvested), 0);
    const totalCurrentVal = positions.reduce((s, p) => s + (p.currentUsdValue ?? Number(p.usdInvested)), 0);
    const totalUnrealizedPnl = totalCurrentVal - totalInvested;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between flex-wrap gap-2", children: [_jsx("h2", { className: "text-xl font-bold", children: "Open Positions" }), _jsxs("span", { className: "text-sm text-gray-400", children: [positions.length, " positions"] })] }), positions.length > 0 && (_jsx("div", { className: "grid grid-cols-3 gap-3", children: [
                    { label: 'Total Invested', value: `$${totalInvested.toFixed(2)}` },
                    { label: 'Current Value', value: `$${totalCurrentVal.toFixed(2)}` },
                    {
                        label: 'Unrealized PnL',
                        value: `${totalUnrealizedPnl >= 0 ? '+' : ''}$${totalUnrealizedPnl.toFixed(2)}`,
                        color: totalUnrealizedPnl >= 0 ? 'text-brand-500' : 'text-red-400',
                    },
                ].map(({ label, value, color }) => (_jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800", children: [_jsx("p", { className: "text-xs text-gray-400", children: label }), _jsx("p", { className: `text-lg font-bold mt-1 ${color ?? ''}`, children: value })] }, label))) })), isLoading && _jsx("p", { className: "text-gray-400 text-sm", children: "Loading\u2026" }), !isLoading && positions.length === 0 && (_jsx("p", { className: "text-gray-500 text-sm", children: "No open positions." })), positions.length > 0 && (_jsx("div", { className: "bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-gray-400 text-xs border-b border-gray-800", children: [_jsx("th", { className: "text-left p-3", children: "Token" }), _jsx("th", { className: "text-left p-3", children: "Src" }), _jsx("th", { className: "text-right p-3", children: "Invested" }), _jsx("th", { className: "text-right p-3", children: "Entry" }), _jsx("th", { className: "text-right p-3", children: "Current" }), _jsx("th", { className: "text-right p-3", children: "PnL $" }), _jsx("th", { className: "text-right p-3", children: "PnL %" }), _jsx("th", { className: "text-center p-3", children: "TPs" }), _jsx("th", { className: "text-left p-3", children: "Opened" }), _jsx("th", { className: "p-3" })] }) }), _jsx("tbody", { children: positions.map(p => {
                                const pnlPct = p.unrealizedPnlPct ?? 0;
                                const pnlUsd = p.unrealizedPnlUsd ?? 0;
                                const isProfit = pnlPct >= 0;
                                return (_jsxs("tr", { className: "border-b border-gray-800/50 hover:bg-gray-800/30", children: [_jsx("td", { className: "p-3 font-mono text-xs", children: p.tokenSymbol ?? `${p.contractAddress.slice(0, 6)}…` }), _jsx("td", { className: "p-3 text-xs", children: srcEmoji[p.source ?? ''] ?? '?' }), _jsxs("td", { className: "p-3 text-right text-xs", children: ["$", Number(p.usdInvested).toFixed(2)] }), _jsxs("td", { className: "p-3 text-right font-mono text-xs", children: ["$", Number(p.entryPrice).toFixed(8)] }), _jsx("td", { className: "p-3 text-right font-mono text-xs", children: p.currentPrice ? `$${p.currentPrice.toFixed(8)}` : '—' }), _jsxs("td", { className: `p-3 text-right text-xs font-medium ${isProfit ? 'text-brand-500' : 'text-red-400'}`, children: [pnlUsd >= 0 ? '+' : '', "$", pnlUsd.toFixed(2)] }), _jsxs("td", { className: `p-3 text-right text-xs font-medium ${isProfit ? 'text-brand-500' : 'text-red-400'}`, children: [pnlPct >= 0 ? '+' : '', pnlPct.toFixed(1), "%"] }), _jsxs("td", { className: "p-3 text-center text-xs", children: [_jsx("span", { className: p.tp1Executed ? 'text-brand-500' : 'text-gray-700', children: "\u25CF" }), _jsx("span", { className: p.tp2Executed ? 'text-brand-500' : 'text-gray-700', children: "\u25CF" }), _jsx("span", { className: p.tp3Executed ? 'text-brand-500' : 'text-gray-700', children: "\u25CF" }), p.trailingStopActive && _jsx("span", { className: "text-yellow-400 ml-1", children: "T" })] }), _jsx("td", { className: "p-3 text-xs text-gray-500", children: new Date(p.openedAt).toLocaleTimeString() }), _jsx("td", { className: "p-3", children: _jsx("button", { onClick: () => close.mutate(p.id), disabled: close.isPending, className: "text-xs text-red-400 hover:text-red-300 disabled:opacity-40 px-2 py-1 rounded border border-red-800 hover:border-red-400", children: "Close" }) })] }, p.id));
                            }) })] }) }))] }));
}
