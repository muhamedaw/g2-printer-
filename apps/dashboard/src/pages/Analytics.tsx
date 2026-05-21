import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api } from '../lib/api.js';

interface SourceStat {
  source:   string;
  trades:   number;
  wins:     number;
  winRate:  number;
  totalPnl: number;
}

interface EquityPoint {
  date:          string;
  dailyPnl:      number;
  cumulativePnl: number;
}

interface TradeBrief {
  contractAddress: string;
  tokenSymbol:     string | null;
  source:          string | null;
  pnlUsd:          string | null;
  pnlPct:          string | null;
  tradeType:       string;
  createdAt:       string;
}

interface BestWorst {
  best:  TradeBrief[];
  worst: TradeBrief[];
}

const SOURCE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  sniper:          { label: 'Sniper',      emoji: '🎯', color: 'text-yellow-400' },
  copy_trade:      { label: 'Copy Trade',  emoji: '👤', color: 'text-purple-400' },
  pump_graduation: { label: 'Graduation',  emoji: '🎓', color: 'text-blue-400'   },
  social:          { label: 'Social',      emoji: '📡', color: 'text-gray-400'   },
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function TradeRow({ trade, isWin }: { trade: TradeBrief; isWin: boolean }) {
  const pnl  = parseFloat(trade.pnlUsd  ?? '0');
  const pct  = parseFloat(trade.pnlPct  ?? '0');
  const name = trade.tokenSymbol ?? shortAddr(trade.contractAddress);
  const src  = SOURCE_LABELS[trade.source ?? 'social'] ?? { emoji: '📊' };
  return (
    <div className="flex items-center justify-between py-2 px-4 border-b border-gray-800 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm">{src.emoji}</span>
        <span className="text-sm font-medium text-white truncate max-w-[100px]">{name}</span>
        <span className="text-xs text-gray-500">{new Date(trade.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="text-right shrink-0">
        <span className={`font-bold text-sm ${isWin ? 'text-green-400' : 'text-red-400'}`}>
          {isWin ? '+' : ''}${pnl.toFixed(2)}
        </span>
        <span className={`text-xs ml-1 ${isWin ? 'text-green-600' : 'text-red-600'}`}>
          ({isWin ? '+' : ''}{(pct * 100).toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: {value: number}[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-gray-400">{label}</p>
      <p className={`font-bold ${val >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {val >= 0 ? '+' : ''}${val.toFixed(2)}
      </p>
    </div>
  );
}

export default function Analytics() {
  const { data: sources, isLoading: srcLoading } = useQuery({
    queryKey: ['by-source'],
    queryFn:  () => api.get<SourceStat[]>('/trades/by-source'),
    refetchInterval: 60_000,
  });

  const { data: equity } = useQuery({
    queryKey: ['equity-curve'],
    queryFn:  () => api.get<EquityPoint[]>('/trades/equity-curve'),
    refetchInterval: 60_000,
  });

  const { data: bw } = useQuery({
    queryKey: ['best-worst'],
    queryFn:  () => api.get<BestWorst>('/trades/best-worst'),
    refetchInterval: 60_000,
  });

  const total = sources?.reduce((s, r) => ({ trades: s.trades + r.trades, pnl: s.pnl + r.totalPnl }), { trades: 0, pnl: 0 });
  const lastEquity = equity?.at(-1)?.cumulativePnl ?? 0;
  const equityColor = lastEquity >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Strategy Analytics</h2>

      {/* Summary cards */}
      {total && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-gray-400">Total Closed Trades</p>
            <p className="text-2xl font-bold mt-1">{total.trades}</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-gray-400">Total Realized PnL</p>
            <p className={`text-2xl font-bold mt-1 ${total.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {total.pnl >= 0 ? '+' : ''}${total.pnl.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Equity curve */}
      {equity && equity.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="font-semibold text-sm mb-4">Equity Curve (Cumulative PnL)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={equity} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={equityColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={equityColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickFormatter={d => d.slice(5)} // MM-DD
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickFormatter={v => `$${v}`}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="cumulativePnl"
                stroke={equityColor}
                strokeWidth={2}
                fill="url(#pnlGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Best / Worst trades */}
      {bw && (bw.best.length > 0 || bw.worst.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {bw.best.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="p-3 border-b border-gray-800">
                <h3 className="font-semibold text-sm text-green-400">🏆 Best Trades</h3>
              </div>
              {bw.best.map((t, i) => <TradeRow key={i} trade={t} isWin />)}
            </div>
          )}
          {bw.worst.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="p-3 border-b border-gray-800">
                <h3 className="font-semibold text-sm text-red-400">💀 Worst Trades</h3>
              </div>
              {bw.worst.map((t, i) => <TradeRow key={i} trade={t} isWin={false} />)}
            </div>
          )}
        </div>
      )}

      {/* Source breakdown */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h3 className="font-semibold text-sm">PnL by Signal Source</h3>
        </div>

        {srcLoading && (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        )}

        {!srcLoading && (!sources || sources.length === 0) && (
          <div className="p-8 text-center text-gray-500 text-sm">No closed trades yet</div>
        )}

        {(sources ?? []).map(row => {
          const meta  = SOURCE_LABELS[row.source] ?? { label: row.source, emoji: '📊', color: 'text-gray-400' };
          const bar   = Math.min(100, Math.round(row.winRate * 100));
          const pnlPos = row.totalPnl >= 0;

          return (
            <div key={row.source} className="p-4 border-b border-gray-800 last:border-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{meta.emoji}</span>
                  <span className={`font-semibold text-sm ${meta.color}`}>{meta.label}</span>
                  <span className="text-xs text-gray-500">{row.trades} trades</span>
                </div>
                <div className="text-right">
                  <span className={`font-bold text-sm ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                    {pnlPos ? '+' : ''}${row.totalPnl.toFixed(2)}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {(row.winRate * 100).toFixed(0)}% win
                  </span>
                </div>
              </div>

              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${bar >= 50 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${bar}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>{row.wins} wins</span>
                <span>{row.trades - row.wins} losses</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
