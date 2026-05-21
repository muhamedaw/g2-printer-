import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api.js';
const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        price: '$49/mo',
        features: ['5 open positions', 'Live trading', 'Copy trading', 'No signal delay'],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '$149/mo',
        features: ['10 open positions', 'Live trading', 'Copy trading', 'API access', 'No signal delay'],
    },
    {
        id: 'whale',
        name: 'Whale',
        price: '$499/mo',
        features: ['Unlimited positions', 'Live trading', 'Copy trading', 'API access', 'Priority support'],
    },
];
const TIER_ORDER = ['free', 'starter', 'pro', 'whale'];
export default function Subscription() {
    const { data, isLoading } = useQuery({
        queryKey: ['subscription'],
        queryFn: () => api.get('/subscription'),
    });
    const checkout = useMutation({
        mutationFn: (plan) => api.post('/subscription/checkout', { plan }),
        onSuccess: ({ url }) => { if (url)
            window.location.href = url; },
    });
    if (isLoading)
        return _jsx("p", { className: "text-gray-400", children: "Loading\u2026" });
    const current = data?.planTier ?? 'free';
    const sub = data?.subscription;
    const currentIdx = TIER_ORDER.indexOf(current);
    return (_jsxs("div", { className: "space-y-6 max-w-3xl", children: [_jsx("h2", { className: "text-xl font-bold", children: "Subscription" }), _jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800 flex items-center justify-between flex-wrap gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-400", children: "Current plan" }), _jsx("p", { className: "text-lg font-bold capitalize", children: current }), sub && (_jsxs("p", { className: "text-xs text-gray-500 mt-0.5", children: [sub.status === 'active' ? 'Renews' : sub.status, " ", new Date(sub.currentPeriodEnd).toLocaleDateString()] }))] }), _jsxs("div", { className: "text-right text-xs text-gray-400 space-y-1", children: [_jsxs("p", { children: ["Max positions: ", _jsx("span", { className: "text-white", children: data?.limits.maxPositions === 999 ? '∞' : data?.limits.maxPositions ?? 3 })] }), _jsxs("p", { children: ["Live trading:  ", _jsx("span", { className: data?.limits.liveTrading ? 'text-brand-400' : 'text-gray-500', children: data?.limits.liveTrading ? 'Yes' : 'No' })] }), _jsxs("p", { children: ["API access:    ", _jsx("span", { className: data?.limits.apiAccess ? 'text-brand-400' : 'text-gray-500', children: data?.limits.apiAccess ? 'Yes' : 'No' })] })] })] }), current === 'whale' ? (_jsx("p", { className: "text-gray-400 text-sm", children: "You are on the highest plan." })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: PLANS.map(plan => {
                    const planIdx = TIER_ORDER.indexOf(plan.id);
                    const isCurrent = plan.id === current;
                    const isUpgrade = planIdx > currentIdx;
                    return (_jsxs("div", { className: `bg-gray-900 rounded-xl p-5 border flex flex-col gap-3 ${isCurrent ? 'border-brand-600' : 'border-gray-800'}`, children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: plan.name }), _jsx("p", { className: "text-brand-400 text-lg font-bold", children: plan.price })] }), _jsx("ul", { className: "space-y-1 flex-1", children: plan.features.map(f => (_jsxs("li", { className: "text-xs text-gray-300 flex items-center gap-1.5", children: [_jsx("span", { className: "text-brand-500", children: "\u2713" }), f] }, f))) }), isCurrent ? (_jsx("span", { className: "text-center text-xs text-gray-500 py-1.5", children: "Current plan" })) : isUpgrade ? (_jsx("button", { onClick: () => checkout.mutate(plan.id), disabled: checkout.isPending, className: "py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white transition-colors", children: checkout.isPending ? 'Redirecting…' : `Upgrade to ${plan.name}` })) : (_jsx("span", { className: "text-center text-xs text-gray-600 py-1.5", children: "Downgrade via billing portal" }))] }, plan.id));
                }) }))] }));
}
