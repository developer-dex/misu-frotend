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
import { SettingsPage } from './pages/SettingsPage';

type AuthState = 'checking' | 'open' | 'needs-login' | 'signed-in' | { error: string };

export function App() {
  const [auth, setAuth] = useState<AuthState>('checking');

  const check = useCallback(async () => {
    setAuth('checking');
    try {
      const { authRequired } = await api.authStatus();
      if (!authRequired) return setAuth('open');
      if (!getToken()) return setAuth('needs-login');
      await api.me();
      setAuth('signed-in');
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        setToken(null);
        setAuth('needs-login');
      } else {
        setAuth({ error: (err as Error).message });
      }
    }
  }, []);

  useEffect(() => {
    void check();
    const onUnauthorized = () => {
      setToken(null);
      setAuth('needs-login');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [check]);

  const logout = () => {
    setToken(null);
    setAuth('needs-login');
  };

  if (auth === 'checking') {
    return (
      <div className="page-loading full">
        <Spinner />
      </div>
    );
  }
  if (typeof auth === 'object') {
    return (
      <div className="page-loading full">
        <LoadError message={auth.error} onRetry={check} />
      </div>
    );
  }
  if (auth === 'needs-login') return <LoginPage onLogin={() => setAuth('signed-in')} />;

  const onLogout = auth === 'signed-in' ? logout : undefined;

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout onLogout={onLogout} />}>
            <Route index element={<SellPage />} />
            <Route path="purchases" element={<PurchasesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage onLogout={onLogout} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
