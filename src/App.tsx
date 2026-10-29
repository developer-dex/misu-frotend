import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { UNAUTHORIZED_EVENT, api, getToken, setToken } from './api';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { LoadError, Spinner } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SellPage } from './pages/SellPage';
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StockPage } from './pages/StockPage';
import { UsagePage } from './pages/UsagePage';

type AuthState = { status: 'checking' } | { status: 'logged-out' } | { status: 'logged-in'; username: string } | { status: 'error'; message: string };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' });

  const check = useCallback(async () => {
    if (!getToken()) return setAuth({ status: 'logged-out' });
    setAuth({ status: 'checking' });
    try {
      const { user } = await api.me();
      setAuth({ status: 'logged-in', username: user.username });
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        setToken(null);
        setAuth({ status: 'logged-out' });
      } else {
        setAuth({ status: 'error', message: (err as Error).message });
      }
    }
  }, []);

  useEffect(() => {
    void check();
    const onUnauthorized = () => {
      setToken(null);
      setAuth({ status: 'logged-out' });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [check]);

  const logout = () => {
    setToken(null);
    setAuth({ status: 'logged-out' });
  };

  if (auth.status === 'checking') {
    return (
      <div className="page-loading full">
        <Spinner />
      </div>
    );
  }
  if (auth.status === 'error') {
    return (
      <div className="page-loading full">
        <LoadError message={auth.message} onRetry={check} />
      </div>
    );
  }
  if (auth.status === 'logged-out') return <LoginPage onLogin={(username) => setAuth({ status: 'logged-in', username })} />;

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout username={auth.username} onLogout={logout} />}>
            <Route index element={<SellPage />} />
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="purchases" element={<PurchasesPage />} />
            <Route path="stock" element={<StockPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage username={auth.username} onLogout={logout} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
