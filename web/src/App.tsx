import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Skeleton } from './components/ui';
import { useAuth } from './lib/auth';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Workspace = lazy(() => import('./pages/Workspace'));
const Agents = lazy(() => import('./pages/Agents'));
const Explorer = lazy(() => import('./pages/Explorer'));
const History = lazy(() => import('./pages/History'));
const Settings = lazy(() => import('./pages/Settings'));

const Fallback = () => <div className="space-y-3" aria-busy="true"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>;

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center text-xs text-zinc-500" role="status">Loading…</div>;
  if (!user) return <Login />;
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="workspace/:id" element={<Workspace />} />
          <Route path="agents" element={<Agents />} />
          <Route path="explorer" element={<Explorer />} />
          <Route path="explorer/:id" element={<Explorer />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
