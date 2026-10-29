import { useState, type FormEvent } from 'react';
import { api, setToken } from '../api';
import { Spinner } from '../components/ui';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passcode) return setError('Enter your passcode');
    setBusy(true);
    setError('');
    try {
      const { token } = await api.login(passcode);
      setToken(token);
      onLogin();
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
        <p className="subtitle">Enter your passcode to open the stall.</p>
        <label htmlFor="passcode" className="visually-hidden">
          Passcode
        </label>
        <input
          id="passcode"
          className="input input-lg"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="Passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoFocus
          aria-describedby={error ? 'login-error' : undefined}
        />
        {error && (
          <p id="login-error" className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? <Spinner label="Checking" /> : 'Open'}
        </button>
      </form>
    </main>
  );
}
