import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface ApiKey {
  id:             string;
  name:           string;
  requestsToday:  number;
  requestLimit:   number;
  lastUsedAt:     string | null;
  createdAt:      string;
}

export default function ApiKeys() {
  const qc      = useQueryClient();
  const plan    = useAuthStore(s => s.plan);
  const canUse  = plan === 'pro' || plan === 'whale';

  const [newName,   setNewName]   = useState('');
  const [newLimit,  setNewLimit]  = useState(10_000);
  const [adding,    setAdding]    = useState(false);
  const [revealed,  setRevealed]  = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);

  const keys = useQuery({
    queryKey: ['api-keys'],
    queryFn:  () => api.get<ApiKey[]>('/keys'),
    enabled:  canUse,
  });

  const create = useMutation({
    mutationFn: () => api.post<{ key: string; name: string }>('/keys', { name: newName, limit: newLimit }),
    onSuccess: ({ key }) => {
      setRevealed(key);
      setNewName('');
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/keys/${id}`),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['api-keys'] }); },
  });

  function copyKey() {
    if (!revealed) return;
    void navigator.clipboard.writeText(revealed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!canUse) {
    return (
      <div className="space-y-4 max-w-lg">
        <h2 className="text-xl font-bold">API Keys</h2>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center space-y-3">
          <p className="text-4xl">🔑</p>
          <p className="font-medium">Pro plan required</p>
          <p className="text-sm text-gray-400">Upgrade to Pro or Whale to generate API keys and access the REST API.</p>
          <a href="/subscription" className="inline-block mt-2 px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-500 text-white transition-colors">
            View Plans
          </a>
        </div>
      </div>
    );
  }

  const rows = keys.data ?? [];

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">API Keys</h2>
        <button
          onClick={() => setAdding(v => !v)}
          disabled={rows.length >= 5}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white transition-colors"
        >
          + New Key {rows.length >= 5 && '(limit reached)'}
        </button>
      </div>

      {/* Revealed key — shown once */}
      {revealed && (
        <div className="bg-yellow-950 border border-yellow-700 rounded-xl p-4 space-y-2">
          <p className="text-xs text-yellow-400 font-medium">Copy this key now — it will not be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-gray-950 px-3 py-2 rounded-lg break-all text-white">
              {revealed}
            </code>
            <button
              onClick={copyKey}
              className="px-3 py-1.5 rounded-lg text-xs bg-yellow-700 hover:bg-yellow-600 text-white shrink-0"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setRevealed(null)}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {adding && (
        <div className="bg-gray-900 rounded-xl p-4 border border-brand-700 space-y-3">
          <p className="text-sm font-medium">New API Key</p>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Key name (e.g. my-bot)"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
          <div>
            <label className="text-xs text-gray-400">Daily request limit</label>
            <input
              type="number"
              value={newLimit}
              onChange={e => setNewLimit(parseInt(e.target.value))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              min={100}
              max={100000}
              step={1000}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => create.mutate()}
              disabled={!newName.trim() || create.isPending}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white transition-colors"
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="px-4 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Keys table */}
      {keys.isLoading && <p className="text-gray-400 text-sm">Loading…</p>}

      {!keys.isLoading && rows.length === 0 && !adding && (
        <p className="text-gray-500 text-sm">No API keys yet. Create one above.</p>
      )}

      {rows.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-800">
                <th className="text-left p-3">Name</th>
                <th className="text-right p-3">Requests today</th>
                <th className="text-right p-3">Limit</th>
                <th className="text-left p-3">Last used</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map(k => (
                <tr key={k.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 font-medium">{k.name}</td>
                  <td className="p-3 text-right">
                    <span className={k.requestsToday >= k.requestLimit * 0.9 ? 'text-red-400' : 'text-white'}>
                      {k.requestsToday}
                    </span>
                  </td>
                  <td className="p-3 text-right text-gray-400">{k.requestLimit.toLocaleString()}</td>
                  <td className="p-3 text-xs text-gray-400">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => { if (confirm(`Delete key "${k.name}"?`)) del.mutate(k.id); }}
                      disabled={del.isPending}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
