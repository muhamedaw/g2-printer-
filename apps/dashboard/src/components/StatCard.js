import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function StatCard({ label, value, sub, positive }) {
    return (_jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800", children: [_jsx("p", { className: "text-xs text-gray-400 uppercase tracking-wide", children: label }), _jsx("p", { className: `mt-1 text-2xl font-bold ${positive === true ? 'text-brand-500' : positive === false ? 'text-red-400' : 'text-white'}`, children: value }), sub && _jsx("p", { className: "mt-1 text-xs text-gray-500", children: sub })] }));
}
