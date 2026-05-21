import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface RawSignal {
  id:              number;
  platform:        string;
  contractAddress: string | null;
  content:         string;
  engagementScore: string | number | null;
  authorFollowers: number | null;
  createdAt:       string;
}

interface PlatformStat {
  platform: string;
  count:    number;
}

const PLATFORM_ICONS: Record<string, string> = {
  twitter:  '𝕏',
  reddit:   '🟠',
  telegram: '✈️',
  news:     '📰',
};

const PLATFORM_COLORS: Record<string, string> = {
  twitter:  'bg-sky-900 text-sky-300',
  reddit:   'bg-orange-900 text-orange-300',
  telegram: 'bg-blue-900 text-blue-300',
  news:     'bg-gray-700 text-gray-300',
};

export default function Signals() {
  const [platform, setPlatform] = useState<string>('all');

  const signals = useQuery({
    queryKey: ['signals', platform],
    queryFn:  () => api.get<RawSignal[]>(`/signals?platform=${platform}&limit=100`),
    refetchInterval: 30_000,
  });

  const stats = useQuery({
    queryKey: ['signals-stats'],
    queryFn:  () => api.get<PlatformStat[]>('/signals/stats'),
    refetchInterval: 60_000,
  });

  const rows = signals.data ?? [];
  const statRows = stats.data ?? [];
  const total24h = statRows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">AI Signals Feed</h2>
        <span className="text-xs text-gray-500">{total24h} signals in last 24h</span>
      </div>

      {/* Platform stats */}
      {statRows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statRows.map(s => (
            <div key={s.platform} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400">
                {PLATFORM_ICONS[s.platform] ?? '🔹'} {s.platform}
              </p>
              <p className="text-2xl font-bold mt-1">{s.count}</p>
              <p className="text-xs text-gray-500 mt-0.5">last 24h</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'twitter', 'reddit', 'telegram', 'news'].map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              platform === p
                ? 'bg-brand-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {PLATFORM_ICONS[p] ?? ''} {p}
          </button>
        ))}
      </div>

      {/* Signals list */}
      <div className="space-y-2">
        {signals.isLoading && <p className="text-gray-400 text-sm">Loading…</p>}
        {!signals.isLoading && rows.length === 0 && (
          <p className="text-gray-500 text-sm">No signals yet.</p>
        )}
        {rows.map(s => (
          <div key={s.id} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[s.platform] ?? 'bg-gray-700 text-gray-300'}`}>
                    {PLATFORM_ICONS[s.platform] ?? '🔹'} {s.platform}
                  </span>
                  {s.contractAddress && (
                    <span className="font-mono text-xs text-gray-500">
                      {s.contractAddress.slice(0, 8)}…{s.contractAddress.slice(-4)}
                    </span>
                  )}
                  {(s.authorFollowers ?? 0) > 10_000 && (
                    <span className="text-xs text-yellow-400">⭐ {((s.authorFollowers ?? 0) / 1000).toFixed(0)}K</span>
                  )}
                </div>
                <p className="text-sm text-gray-200 line-clamp-2">{s.content}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-medium text-brand-400">
                  {Number(s.engagementScore ?? 0).toFixed(0)}
                  <span className="text-gray-500 font-normal"> eng</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(s.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
