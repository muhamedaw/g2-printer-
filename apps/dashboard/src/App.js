import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.js';
import Layout from './components/Layout.js';
import Login from './pages/Login.js';
import Dashboard from './pages/Dashboard.js';
import Positions from './pages/Positions.js';
import Trades from './pages/Trades.js';
import Signals from './pages/Signals.js';
import Whales from './pages/Whales.js';
import Settings from './pages/Settings.js';
import Subscription from './pages/Subscription.js';
import ApiKeys from './pages/ApiKeys.js';
import SocialMedia from './pages/SocialMedia.js';
import Health from './pages/Health.js';
import Analytics from './pages/Analytics.js';
function RequireAuth({ children }) {
    const token = useAuthStore(s => s.token);
    if (!token)
        return _jsx(Navigate, { to: "/login", replace: true });
    return _jsx(_Fragment, { children: children });
}
export default function App() {
    return (_jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(Login, {}) }), _jsxs(Route, { path: "/", element: _jsx(RequireAuth, { children: _jsx(Layout, {}) }), children: [_jsx(Route, { index: true, element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "positions", element: _jsx(Positions, {}) }), _jsx(Route, { path: "trades", element: _jsx(Trades, {}) }), _jsx(Route, { path: "signals", element: _jsx(Signals, {}) }), _jsx(Route, { path: "whales", element: _jsx(Whales, {}) }), _jsx(Route, { path: "settings", element: _jsx(Settings, {}) }), _jsx(Route, { path: "subscription", element: _jsx(Subscription, {}) }), _jsx(Route, { path: "api-keys", element: _jsx(ApiKeys, {}) }), _jsx(Route, { path: "social", element: _jsx(SocialMedia, {}) }), _jsx(Route, { path: "health", element: _jsx(Health, {}) }), _jsx(Route, { path: "analytics", element: _jsx(Analytics, {}) })] })] }) }));
}
