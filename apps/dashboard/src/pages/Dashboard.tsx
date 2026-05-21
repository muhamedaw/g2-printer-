import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api.js';
import StatCard from '../components/StatCard.js';
import { useTradeSocket } from '../lib/useTradeSocket.js';

interface Summary {
  openPositions:  number;
  totalInvested:  number;
  unrealizedPnl:  number;
  realizedPnl:    number;
  winRate:        number;   // already in percentage (0-100)
  totalTrades:    number;
  capitalUsd:     number;
  paperTrading:   boolean;
}

interface Trade {
  id: number;
  contractAddress: string;
  tokenSymbol: string | null;
  tradeType: string;
  source: string | null;
  usdAmount: string | number;
  pnlUsd: string | number | null;
  pnlPct: string | number | null;
  createdAt: string;
}

interface SourceStat {
  source:   string;
  trades:   number;
  wins:     number;
  winRate:  number;
  totalPnl: number;
}

function fmt(n: number) {
  return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
}

export default function Dashboard() {
  useTradeSocket(); // live trade notifications — invalidates queries on trade:executed

  const summary = useQuery({
    queryKey: ['portfolio-summary'],
    queryFn:  () => api.get<Summary>('/portfolio/summary'),
    refetchInterval: 15_000,
  });

  const trades = useQuery({
    queryKey: ['recent-trades'],
    queryFn:  () => api.get<Trade[]>('/trades?limit=20'),
  });

  const bySource = useQuery({
    queryKey: ['trades-by-source'],
    queryFn:  () => api.get<SourceStat[]>('/trades/by-source'),
    refetchInterval: 30_000,
  });

  const s = summary.data;
  const closedTrades = (trades.data ?? []).filter(t => t.pnlUsd !== null);

  // Build cumulative PnL chart data
  const chartData = closedTrades.slice().reverse().reduce<Array<{ i: number; pnl: number }>>((acc, t, i) => {
    const prev = acc[i - 1]?.pnl ?? 0;
    acc.push({ i: i + 1, pnl: prev + Number(t.pnlUsd ?? 0) });
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Dashboard</h2>
        {s && (
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${s.paperTrading ? 'bg-yellow-500/20 text-yellow-400' : 'bg-brand-700 text-white'}`}>
            {s.paperTrading ? '📄 Paper Mode' : '🟢 Live Mode'}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Positions"
          value={String(s?.openPositions ?? '—')}
        />
        <StatCard
          label="Invested"
          value={s ? `$${s.totalInvested.toFixed(2)}` : '—'}
        />
        <StatCard
          label="Unrealized PnL"
          value={s ? fmt(s.unrealizedPnl) : '—'}
          {...(s ? { positive: s.unrealizedPnl >= 0 } : {})}
        />
        <StatCard
          label="Realized PnL"
          value={s ? fmt(s.realizedPnl) : '—'}
          {...(s ? { positive: s.realizedPnl >= 0, sub: `Win rate: ${s.winRate.toFixed(0)}%` } : {})}
        />
      </div>

      {/* PnL Chart */}
      {chartData.length > 1 && (
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-sm text-gray-400 mb-3">Cumulative PnL ($)</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="i" hide />
              <YAxis tickFormatter={v => `$${v}`} width={60} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, 'PnL']}
              />
              <Area type="monotone" dataKey="pnl" stroke="#22c55e" fill="url(#pnlGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Strategy Breakdown */}
      {(bySource.data ?? []).length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-sm font-medium p-4 border-b border-gray-800">Strategy Performance</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-gray-800">
            {(bySource.data ?? []).map(s => {
              const srcLabel: Record<string, string> = {
                sniper:          '⚡ Sniper',
                copy_trade:      '🐋 Copy Trade',
                pump_graduation: '🎓 Graduation',
                social:          '📡 Social',
                manual:          '✋ Manual',
              };
              const pnlColor = s.totalPnl >= 0 ? 'text-green-400' : 'text-red-400';
              return (
                <div key={s.source} className="p-4">
                  <p className="text-xs text-gray-400 mb-1">{srcLabel[s.source] ?? s.source}</p>
                  <p className={`text-lg font-bold ${pnlColor}`}>
                    {s.totalPnl >= 0 ? '+' : ''}${s.totalPnl.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {s.trades} trades · {(s.winRate * 100).toFixed(0)}% win
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent trades */}
      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <p className="text-sm font-medium p-4 border-b border-gray-800">Recent Trades</p>
        {(trades.data ?? []).length === 0 ? (
          <p className="text-gray-500 text-sm p-4">No trades yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-800">
                <th className="text-left p-3">Token</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Src</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-right p-3">PnL</th>
              </tr>
            </thead>
            <tbody>
              {(trades.data ?? []).map(t => (
                <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 font-mono text-xs">
                    {t.tokenSymbol ?? `${t.contractAddress.slice(0, 6)}…`}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      t.tradeType === 'BUY' ? 'bg-brand-700 text-white' : 'bg-gray-700 text-gray-200'
                    }`}>{t.tradeType.replace('SELL_', '')}</span>
                  </td>
                  <td className="p-3 text-xs text-gray-400">
                    {t.source === 'sniper' ? '⚡' : t.source === 'copy_trade' ? '🐋' : t.source === 'pump_graduation' ? '🎓' : '📡'}
                  </td>
                  <td className="p-3 text-right">${Number(t.usdAmount).toFixed(2)}</td>
                  <td className={`p-3 text-right ${t.pnlUsd === null ? 'text-gray-500' : Number(t.pnlUsd) >= 0 ? 'text-brand-500' : 'text-red-400'}`}>
                    {t.pnlUsd !== null ? fmt(Number(t.pnlUsd)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
