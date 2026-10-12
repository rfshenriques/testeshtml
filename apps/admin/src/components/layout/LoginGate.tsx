import * as React from 'react';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Field, Input, Note } from '@/components/ui';

export function LoginGate() {
  const [token, setToken] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    auth.setToken(t);
    try {
      await api.ops.alerts();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('That token was rejected (401). Check ADMIN_API_TOKEN on the API.');
        auth.setToken(null);
      } else {
        // API unreachable or other error: keep the token, the console will show request errors.
        setError(err instanceof Error ? `Token stored, but the API answered: ${err.message}` : 'Token stored.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-fg" aria-hidden>
            S
          </span>
          <div>
            <h1 className="text-lg font-semibold">Sitewright</h1>
            <p className="text-sm text-muted-fg">Operator console</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Admin token" htmlFor="admin-token" hint="Stored in this browser only and sent as a bearer header on every request.">
            <Input id="admin-token" type="password" autoComplete="off" autoFocus value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_API_TOKEN" />
          </Field>
          {error && <Note tone="critical">{error}</Note>}
          <Button type="submit" className="w-full" loading={busy} disabled={!token.trim()}>
            Sign in
          </Button>
        </form>
      </Card>
    </main>
  );
}
