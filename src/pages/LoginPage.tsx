import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api, setToken } from '../api';
import { Spinner } from '../components/ui';

export function LoginPage({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setError('Enter your username');
    if (!password) return setError('Enter your password');
    setBusy(true);
    setError('');
    try {
      const res = await api.login(username.trim(), password);
      setToken(res.token);
      onLogin(res.user.username);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit} noValidate>
        <img src="/logo-480.webp" alt="" width={112} height={112} />
        <h1>MISU Stall</h1>
        <p className="subtitle">Log in to open the stall.</p>

        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="password-input">
            <input
              id="password"
              className="input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={error ? 'login-error' : undefined}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <p id="login-error" className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? <Spinner label="Logging in" /> : 'Log in'}
        </button>
      </form>
    </main>
  );
}
