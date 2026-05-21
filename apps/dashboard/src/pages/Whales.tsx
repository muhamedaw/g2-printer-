import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';

interface Wallet {
  walletAddress: string;
  nickname:      string | null;
  pattern:       string;
  winRate:       number;
  avgProfitX:    number;
  totalTrades:   number;
  isActive:      boolean;
  score:         number;
  copyWeight:    number;
}

interface Stats {
  total:          number;
  avgScore:       number;
  highQuality:    number;
  copySignals24h: number;
}

const PATTERN_COLORS: Record<string, string> = {
  insider:       'bg-purple-900 text-purple-300',
  institutional: 'bg-blue-900 text-blue-300',
  lucky_retail:  'bg-yellow-900 text-yellow-300',
  unknown:       'bg-gray-700 text-gray-400',
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-brand-500' : score >= 65 ? 'bg-yellow-500' : score >= 50 ? 'bg-orange-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-gray-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium">{score}</span>
    </div>
  );
}

export default function Whales() {
  const qc   = useQueryClient();
  const plan = useAuthStore(s => s.plan);
  const canUse = plan === 'pro' || plan === 'whale';
  const [newAddr, setNewAddr] = useState('');
  const [newNick, setNewNick] = useState('');
  const [adding, setAdding] = useState(false);

  const wallets = useQuery({
    queryKey: ['whales'],
    queryFn:  () => api.get<Wallet[]>('/whales'),
    refetchInterval: 60_000,
    enabled: canUse,
  });

  const stats = useQuery({
    queryKey: ['whales-stats'],
    queryFn:  () => api.get<Stats>('/whales/stats'),
    refetchInterval: 60_000,
    enabled: canUse,
  });

  const add = useMutation({
    mutationFn: (body: { address: string; nickname?: string }) =>
      api.post<{ queued: boolean }>('/whales', body),
    onSuccess: () => {
      setNewAddr('');
      setNewNick('');
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ['whales'] });
    },
  });

  const s = stats.data;
  const rows = wallets.data ?? [];

  if (!canUse) {
    return (
      <div className="space-y-4 max-w-lg">
        <h2 className="text-xl font-bold">Whale Tracker</h2>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center space-y-3">
          <p className="text-4xl">🐳</p>
          <p className="font-medium">Pro plan required</p>
          <p className="text-sm text-gray-400">Upgrade to Pro or Whale to track wallets and receive copy-trade signals.</p>
          <a href="/subscription" className="inline-block mt-2 px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-500 text-white transition-colors">
            View Plans
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Whale Tracker</h2>
        <button
          onClick={() => setAdding(v => !v)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white transition-colors"
        >
          + Track Wallet
        </button>
      </div>

      {/* Add wallet form */}
      {adding && (
        <div className="bg-gray-900 rounded-xl p-4 border border-brand-700 space-y-3">
          <p className="text-sm font-medium">Add Wallet to Track</p>
          <input
            value={newAddr}
            onChange={e => setNewAddr(e.target.value)}
            placeholder="Solana wallet address (32-44 chars)"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-brand-500"
          />
          <input
            value={newNick}
            onChange={e => setNewNick(e.target.value)}
            placeholder="Nickname (optional)"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-brand-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => add.mutate({ address: newAddr, ...(newNick ? { nickname: newNick } : {}) })}
              disabled={newAddr.length < 32 || add.isPending}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 transition-colors"
            >
              {add.isPending ? 'Queuing…' : 'Add'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
          {add.isSuccess && <p className="text-xs text-brand-400">Queued — classification takes ~30s</p>}
        </div>
      )}

      {/* Stats row */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Tracked Wallets',  value: String(s.total) },
            { label: 'Avg Score',        value: String(s.avgScore) },
            { label: 'High Quality',     value: String(s.highQuality) },
            { label: 'Copy Signals 24h', value: String(s.copySignals24h) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Wallets table */}
      {wallets.isLoading && <p className="text-gray-400 text-sm">Loading…</p>}
      {!wallets.isLoading && rows.length === 0 && (
        <p className="text-gray-500 text-sm">No wallets tracked yet. Add one above or set SEED_WALLETS env var.</p>
      )}

      {rows.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-800">
                <th className="text-left p-3">Wallet</th>
                <th className="text-left p-3">Pattern</th>
                <th className="text-right p-3">Win Rate</th>
                <th className="text-right p-3">Avg Profit</th>
                <th className="text-right p-3">Trades</th>
                <th className="text-left p-3">Score</th>
                <th className="text-right p-3">Copy ×</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(w => (
                <tr key={w.walletAddress} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${!w.isActive ? 'opacity-40' : ''}`}>
                  <td className="p-3">
                    <p className="font-mono text-xs text-gray-300">
                      {w.walletAddress.slice(0, 8)}…{w.walletAddress.slice(-4)}
                    </p>
                    {w.nickname && <p className="text-xs text-gray-500 mt-0.5">{w.nickname}</p>}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PATTERN_COLORS[w.pattern] ?? 'bg-gray-700 text-gray-400'}`}>
                      {w.pattern}
                    </span>
                  </td>
                  <td className="p-3 text-right">{(w.winRate * 100).toFixed(0)}%</td>
                  <td className="p-3 text-right">{w.avgProfitX.toFixed(1)}x</td>
                  <td className="p-3 text-right text-gray-400">{w.totalTrades}</td>
                  <td className="p-3"><ScoreBar score={w.score} /></td>
                  <td className={`p-3 text-right font-medium ${w.copyWeight >= 1.5 ? 'text-brand-400' : 'text-gray-400'}`}>
                    {w.copyWeight.toFixed(1)}x
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
