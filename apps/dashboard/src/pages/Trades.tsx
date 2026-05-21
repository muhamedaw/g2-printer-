import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface Trade {
  id:              number;
  contractAddress: string;
  tokenSymbol:     string | null;
  tradeType:       string;
  isPaperTrade:    boolean;
  source:          string | null;
  usdAmount:       string | number;
  pnlUsd:          string | number | null;
  pnlPct:          string | number | null;
  finalScore:      string | number;
  createdAt:       string;
}

interface Stats {
  totalTrades:    number;
  winningTrades:  number;
  winRate:        number;
  totalPnlUsd:    string | number;
  avgPnlUsd:      string | number;
}

export default function Trades() {
  const trades = useQuery({
    queryKey: ['trades'],
    queryFn:  () => api.get<Trade[]>('/trades?limit=100'),
  });

  const stats = useQuery({
    queryKey: ['trade-stats'],
    queryFn:  () => api.get<Stats>('/trades/stats'),
  });

  const s = stats.data;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Trade History</h2>

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Trades',  value: String(s.totalTrades) },
            { label: 'Win Rate',      value: `${(s.winRate * 100).toFixed(0)}%` },
            { label: 'Total PnL',     value: `${Number(s.totalPnlUsd) >= 0 ? '+' : ''}$${Number(s.totalPnlUsd).toFixed(2)}` },
            { label: 'Avg PnL',       value: `${Number(s.avgPnlUsd) >= 0 ? '+' : ''}$${Number(s.avgPnlUsd).toFixed(2)}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-xl font-bold mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs border-b border-gray-800">
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Token</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Strategy</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-right p-3">PnL</th>
              <th className="text-right p-3">Score</th>
              <th className="text-center p-3">Mode</th>
            </tr>
          </thead>
          <tbody>
            {(trades.data ?? []).map(t => (
              <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="p-3 text-xs text-gray-400">
                  {new Date(t.createdAt).toLocaleDateString()}
                </td>
                <td className="p-3 font-mono text-xs">
                  {t.tokenSymbol ?? `${t.contractAddress.slice(0, 6)}…`}
                </td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    t.tradeType === 'BUY'            ? 'bg-brand-700 text-white'   :
                    t.tradeType === 'SELL_STOP_LOSS' ? 'bg-red-900 text-red-300'   :
                    'bg-gray-700 text-gray-200'
                  }`}>{t.tradeType.replace('SELL_', '')}</span>
                </td>
                <td className="p-3">
                  {t.source && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      t.source === 'sniper'          ? 'bg-yellow-900 text-yellow-300' :
                      t.source === 'copy_trade'      ? 'bg-purple-900 text-purple-300' :
                      t.source === 'pump_graduation' ? 'bg-blue-900 text-blue-300'    :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {t.source === 'sniper' ? '⚡ sniper' :
                       t.source === 'copy_trade' ? '🐋 copy' :
                       t.source === 'pump_graduation' ? '🎓 grad' :
                       t.source}
                    </span>
                  )}
                </td>
                <td className="p-3 text-right">${Number(t.usdAmount).toFixed(2)}</td>
                <td className={`p-3 text-right ${t.pnlUsd === null ? 'text-gray-500' : Number(t.pnlUsd) >= 0 ? 'text-brand-500' : 'text-red-400'}`}>
                  {t.pnlUsd !== null ? `${Number(t.pnlUsd) >= 0 ? '+' : ''}$${Number(t.pnlUsd).toFixed(2)}` : '—'}
                </td>
                <td className="p-3 text-right text-xs text-gray-400">{Number(t.finalScore).toFixed(0)}</td>
                <td className="p-3 text-center text-xs">
                  {t.isPaperTrade
                    ? <span className="text-yellow-400">paper</span>
                    : <span className="text-brand-500">live</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
