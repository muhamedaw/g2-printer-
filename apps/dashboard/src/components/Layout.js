import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
const nav = [
    { to: '/', label: 'Dashboard', icon: '📊' },
    { to: '/positions', label: 'Positions', icon: '📌' },
    { to: '/trades', label: 'Trades', icon: '📋' },
    { to: '/analytics', label: 'Analytics', icon: '📈' },
    { to: '/signals', label: 'Signals', icon: '🔔' },
    { to: '/whales', label: 'Whales', icon: '🐳' },
    { to: '/social', label: 'Social Bots', icon: '🤖' },
    { to: '/health', label: 'System Health', icon: '💚' },
    { to: '/settings', label: 'Settings', icon: '⚙️' },
    { to: '/subscription', label: 'Billing', icon: '💳' },
    { to: '/api-keys', label: 'API Keys', icon: '🔑' },
];
export default function Layout() {
    const { email, plan, logout } = useAuthStore();
    const navigate = useNavigate();
    function handleLogout() {
        logout();
        void navigate('/login');
    }
    return (_jsxs("div", { className: "flex h-screen bg-gray-950 text-gray-100", children: [_jsxs("aside", { className: "w-56 bg-gray-900 border-r border-gray-800 flex flex-col", children: [_jsxs("div", { className: "p-4 border-b border-gray-800", children: [_jsx("h1", { className: "text-lg font-bold text-brand-500", children: "\uD83D\uDCB0 MPG2" }), _jsx("p", { className: "text-xs text-gray-400 mt-1", children: email }), _jsx("span", { className: "inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-brand-700 text-white uppercase", children: plan ?? 'free' })] }), _jsx("nav", { className: "flex-1 p-3 space-y-1", children: nav.map(({ to, label, icon }) => (_jsxs(NavLink, { to: to, end: to === '/', className: ({ isActive }) => `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
                                ? 'bg-brand-600 text-white'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`, children: [_jsx("span", { children: icon }), label] }, to))) }), _jsx("div", { className: "p-3 border-t border-gray-800", children: _jsx("button", { onClick: handleLogout, className: "w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors", children: "\uD83D\uDEAA Logout" }) })] }), _jsx("main", { className: "flex-1 overflow-auto p-6", children: _jsx(Outlet, {}) })] }));
}
