import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
const SERVICE_LABELS = {
    redis: '🗄️ Redis',
    db: '🐘 PostgreSQL',
    'market-data': '📈 Market Data',
    'social-data': '📡 Social Data',
    'ai-brain': '🧠 AI Brain',
    'security-engine': '🛡️ Security Engine',
    'risk-engine': '⚖️ Risk Engine',
    'trade-engine': '⚡ Trade Engine',
    'notification-engine': '🔔 Notifications',
};
function StatusDot({ ok }) {
    return (_jsx("span", { className: `inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-400' : 'bg-red-500'} animate-pulse` }));
}
function StatusBadge({ status }) {
    const cfg = {
        ok: 'bg-green-500/20 text-green-400 border-green-700',
        degraded: 'bg-yellow-500/20 text-yellow-400 border-yellow-700',
        down: 'bg-red-500/20 text-red-400 border-red-700',
    }[status];
    return (_jsx("span", { className: `px-3 py-1 rounded-full text-xs font-semibold border ${cfg}`, children: status.toUpperCase() }));
}
export default function Health() {
    const { data, isLoading, dataUpdatedAt } = useQuery({
        queryKey: ['health-detailed'],
        queryFn: async () => {
            const res = await fetch('/health/detailed');
            return res.json();
        },
        refetchInterval: 30000,
    });
    const services = data?.services ?? [];
    const upCount = services.filter(s => s.ok).length;
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "flex items-center justify-between flex-wrap gap-3", children: [_jsx("h2", { className: "text-xl font-bold", children: "System Health" }), _jsxs("div", { className: "flex items-center gap-3", children: [data && _jsx(StatusBadge, { status: data.status }), _jsxs("span", { className: "text-xs text-gray-500", children: [upCount, "/", services.length, " services up"] })] })] }), dataUpdatedAt > 0 && (_jsxs("p", { className: "text-xs text-gray-500", children: ["Last checked: ", new Date(dataUpdatedAt).toLocaleTimeString(), " \u00B7 refreshes every 30s"] })), isLoading && (_jsx("div", { className: "space-y-3", children: Array.from({ length: 6 }).map((_, i) => (_jsx("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800 animate-pulse h-16" }, i))) })), !isLoading && (_jsxs("div", { className: "space-y-4", children: [_jsx("p", { className: "text-xs font-medium text-gray-400 uppercase tracking-wider", children: "Infrastructure" }), _jsx("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-3", children: services.filter(s => s.name === 'redis' || s.name === 'db').map(s => (_jsx(ServiceCard, { s: s }, s.name))) }), _jsx("p", { className: "text-xs font-medium text-gray-400 uppercase tracking-wider mt-4", children: "Workers" }), _jsx("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-3", children: services.filter(s => s.name !== 'redis' && s.name !== 'db').map(s => (_jsx(ServiceCard, { s: s }, s.name))) })] }))] }));
}
function ServiceCard({ s }) {
    const label = SERVICE_LABELS[s.name] ?? s.name;
    return (_jsxs("div", { className: `bg-gray-900 rounded-xl p-4 border ${s.ok ? 'border-gray-800' : 'border-red-800/60'}`, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx(StatusDot, { ok: s.ok }), _jsx("span", { className: "text-sm font-medium", children: label })] }), _jsxs("div", { className: "text-right", children: [_jsx("span", { className: `text-xs font-medium ${s.ok ? 'text-green-400' : 'text-red-400'}`, children: s.ok ? 'ONLINE' : 'OFFLINE' }), _jsxs("p", { className: "text-xs text-gray-500 mt-0.5", children: [s.latency, "ms"] })] })] }), s.detail && (_jsx("p", { className: "text-xs text-red-400 mt-2 font-mono", children: s.detail }))] }));
}
