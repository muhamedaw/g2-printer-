import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface ActivityEntry {
  platform: 'twitter' | 'instagram' | 'tiktok';
  action: 'post' | 'like' | 'follow' | 'caption';
  content: string;
  target?: string;
  symbol?: string;
  tradeType?: string;
  tweetId?: string;
  trigger?: string;
  createdAt: string;
}

interface TikTokCaption {
  caption: string;
  trade: { symbol: string; tradeType: string; pnlPct?: number };
  createdAt: string;
}

interface SocialStats {
  twitter:   { posts: number; likes: number };
  instagram: { posts: number; likes: number; follows: number };
  tiktok:    { captions: number };
}

const PLATFORM_COLORS: Record<string, string> = {
  twitter:   'bg-sky-900/60 text-sky-300 border-sky-700',
  instagram: 'bg-pink-900/60 text-pink-300 border-pink-700',
  tiktok:    'bg-purple-900/60 text-purple-300 border-purple-700',
};

const ACTION_ICONS: Record<string, string> = {
  post:    '📢',
  like:    '❤️',
  follow:  '➕',
  caption: '📝',
};

const PLATFORM_ICONS: Record<string, string> = {
  twitter:   '🐦',
  instagram: '📸',
  tiktok:    '🎵',
};

type FilterPlatform = 'all' | 'twitter' | 'instagram' | 'tiktok';
type FilterAction   = 'all' | 'post' | 'like' | 'follow' | 'caption';

export default function SocialMedia() {
  const [platformFilter, setPlatformFilter] = useState<FilterPlatform>('all');
  const [actionFilter, setActionFilter]     = useState<FilterAction>('all');

  const stats = useQuery({
    queryKey: ['social-stats'],
    queryFn:  () => api.get<SocialStats>('/social/stats'),
    refetchInterval: 30_000,
  });

  const activity = useQuery({
    queryKey: ['social-activity'],
    queryFn:  () => api.get<ActivityEntry[]>('/social/activity'),
    refetchInterval: 15_000,
  });

  const captions = useQuery({
    queryKey: ['tiktok-captions'],
    queryFn:  () => api.get<TikTokCaption[]>('/social/tiktok-captions'),
    refetchInterval: 60_000,
  });

  const filtered = (activity.data ?? []).filter(item => {
    if (platformFilter !== 'all' && item.platform !== platformFilter) return false;
    if (actionFilter   !== 'all' && item.action   !== actionFilter)   return false;
    return true;
  });

  const s = stats.data;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Social Media Bots</h2>

      {/* Stats row */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-sky-900/30 border border-sky-800 rounded-xl p-4">
            <p className="text-xs text-sky-400">🐦 Twitter Posts</p>
            <p className="text-2xl font-bold mt-1">{s.twitter.posts}</p>
            <p className="text-xs text-gray-500 mt-1">{s.twitter.likes} likes given</p>
          </div>
          <div className="bg-pink-900/30 border border-pink-800 rounded-xl p-4">
            <p className="text-xs text-pink-400">📸 Instagram Posts</p>
            <p className="text-2xl font-bold mt-1">{s.instagram.posts}</p>
            <p className="text-xs text-gray-500 mt-1">{s.instagram.likes} likes · {s.instagram.follows} follows</p>
          </div>
          <div className="bg-purple-900/30 border border-purple-800 rounded-xl p-4">
            <p className="text-xs text-purple-400">🎵 TikTok Captions</p>
            <p className="text-2xl font-bold mt-1">{s.tiktok.captions}</p>
            <p className="text-xs text-gray-500 mt-1">pending drafts</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-400">Total Actions</p>
            <p className="text-2xl font-bold mt-1">
              {s.twitter.posts + s.twitter.likes + s.instagram.posts + s.instagram.likes + s.instagram.follows}
            </p>
            <p className="text-xs text-gray-500 mt-1">across all platforms</p>
          </div>
        </div>
      )}

      {/* TikTok pending captions */}
      {(captions.data ?? []).length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-purple-800/50 p-4">
          <h3 className="text-sm font-semibold text-purple-300 mb-3">🎵 TikTok Pending Captions ({captions.data!.length})</h3>
          <div className="space-y-2">
            {captions.data!.slice(0, 5).map((c, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <pre className="text-gray-200 whitespace-pre-wrap font-sans text-xs leading-relaxed flex-1">{c.caption}</pre>
                  <div className="text-right shrink-0">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                      c.trade.tradeType === 'BUY' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'
                    }`}>{c.trade.symbol}</span>
                    <p className="text-xs text-gray-500 mt-1">{new Date(c.createdAt).toLocaleTimeString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity feed */}
      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800 flex flex-wrap gap-3 items-center">
          <span className="text-sm font-semibold">Activity Feed</span>
          <div className="flex gap-1.5 flex-wrap ml-auto">
            {(['all', 'twitter', 'instagram', 'tiktok'] as FilterPlatform[]).map(p => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  platformFilter === p ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {p === 'all' ? 'All' : `${PLATFORM_ICONS[p]} ${p.charAt(0).toUpperCase() + p.slice(1)}`}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'post', 'like', 'follow', 'caption'] as FilterAction[]).map(a => (
              <button
                key={a}
                onClick={() => setActionFilter(a)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  actionFilter === a ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {a === 'all' ? 'All' : `${ACTION_ICONS[a]} ${a.charAt(0).toUpperCase() + a.slice(1)}s`}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm">
            {activity.isLoading ? 'Loading…' : 'No activity yet. Bots will post when trades execute.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {filtered.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 hover:bg-gray-800/30 transition-colors">
                {/* Platform badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border shrink-0 mt-0.5 ${PLATFORM_COLORS[item.platform]}`}>
                  {PLATFORM_ICONS[item.platform]} {item.platform}
                </span>

                {/* Action icon */}
                <span className="text-base shrink-0">{ACTION_ICONS[item.action]}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 break-words leading-snug">{item.content}</p>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                    {item.target && <span>→ {item.target}</span>}
                    {item.symbol && <span className="text-brand-400">${item.symbol}</span>}
                    {item.trigger && <span>via {item.trigger}</span>}
                  </div>
                </div>

                {/* Time */}
                <time className="text-xs text-gray-600 shrink-0 mt-0.5">
                  {new Date(item.createdAt).toLocaleString(undefined, {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
