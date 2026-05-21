import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.js';
import Layout    from './components/Layout.js';
import Login     from './pages/Login.js';
import Dashboard from './pages/Dashboard.js';
import Positions from './pages/Positions.js';
import Trades    from './pages/Trades.js';
import Signals      from './pages/Signals.js';
import Whales       from './pages/Whales.js';
import Settings     from './pages/Settings.js';
import Subscription from './pages/Subscription.js';
import ApiKeys      from './pages/ApiKeys.js';
import SocialMedia  from './pages/SocialMedia.js';
import Health       from './pages/Health.js';
import Analytics    from './pages/Analytics.js';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }>
          <Route index element={<Dashboard />} />
          <Route path="positions" element={<Positions />} />
          <Route path="trades"    element={<Trades />} />
          <Route path="signals"      element={<Signals />} />
          <Route path="whales"       element={<Whales />} />
          <Route path="settings"     element={<Settings />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="api-keys"     element={<ApiKeys />} />
          <Route path="social"       element={<SocialMedia />} />
          <Route path="health"       element={<Health />} />
          <Route path="analytics"   element={<Analytics />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
