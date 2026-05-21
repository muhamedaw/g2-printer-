import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useTradeSocket } from '../lib/useTradeSocket.js';

interface Position {
  id: number;
  contractAddress: string;
  tokenSymbol:       string | null;
  source:            string | null;
  entryPrice:        string | number;
  currentPrice:      number | null;
  usdInvested:       string | number;
  currentUsdValue:   number;
  unrealizedPnlPct:  number;   // already in % (e.g. -30 = -30%)
  unrealizedPnlUsd:  number;
  tp1Executed:       boolean;
  tp2Executed:       boolean;
  tp3Executed:       boolean;
  trailingStopActive: boolean;
  openedAt:          string;
}

const srcEmoji: Record<string, string> = {
  sniper: '⚡',
  copy_trade: '🐋',
  pump_graduation: '🎓',
  social: '📡',
  manual: '✋',
};

export default function Positions() {
  useTradeSocket(); // refresh on every trade:executed event
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['positions'],
    queryFn:  () => api.get<Position[]>('/portfolio/positions'),
    refetchInterval: 15_000,
  });

  const close = useMutation({
    mutationFn: (id: number) => api.post<void>(`/portfolio/positions/${id}/close`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['positions'] }); },
  });

  const positions = data ?? [];

  const totalInvested = positions.reduce((s, p) => s + Number(p.usdInvested), 0);
  const totalCurrentVal = positions.reduce((s, p) => s + (p.currentUsdValue ?? Number(p.usdInvested)), 0);
  const totalUnrealizedPnl = totalCurrentVal - totalInvested;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Open Positions</h2>
        <span className="text-sm text-gray-400">{positions.length} positions</span>
      </div>

      {/* Summary bar */}
      {positions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Invested',   value: `$${totalInvested.toFixed(2)}` },
            { label: 'Current Value',    value: `$${totalCurrentVal.toFixed(2)}` },
            {
              label: 'Unrealized PnL',
              value: `${totalUnrealizedPnl >= 0 ? '+' : ''}$${totalUnrealizedPnl.toFixed(2)}`,
              color: totalUnrealizedPnl >= 0 ? 'text-brand-500' : 'text-red-400',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400">{label}</p>
              <p className={`text-lg font-bold mt-1 ${color ?? ''}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading && <p className="text-gray-400 text-sm">Loading…</p>}

      {!isLoading && positions.length === 0 && (
        <p className="text-gray-500 text-sm">No open positions.</p>
      )}

      {positions.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-800">
                <th className="text-left p-3">Token</th>
                <th className="text-left p-3">Src</th>
                <th className="text-right p-3">Invested</th>
                <th className="text-right p-3">Entry</th>
                <th className="text-right p-3">Current</th>
                <th className="text-right p-3">PnL $</th>
                <th className="text-right p-3">PnL %</th>
                <th className="text-center p-3">TPs</th>
                <th className="text-left p-3">Opened</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {positions.map(p => {
                const pnlPct = p.unrealizedPnlPct ?? 0;
                const pnlUsd = p.unrealizedPnlUsd ?? 0;
                const isProfit = pnlPct >= 0;
                return (
                  <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="p-3 font-mono text-xs">
                      {p.tokenSymbol ?? `${p.contractAddress.slice(0, 6)}…`}
                    </td>
                    <td className="p-3 text-xs">{srcEmoji[p.source ?? ''] ?? '?'}</td>
                    <td className="p-3 text-right text-xs">${Number(p.usdInvested).toFixed(2)}</td>
                    <td className="p-3 text-right font-mono text-xs">${Number(p.entryPrice).toFixed(8)}</td>
                    <td className="p-3 text-right font-mono text-xs">
                      {p.currentPrice ? `$${p.currentPrice.toFixed(8)}` : '—'}
                    </td>
                    <td className={`p-3 text-right text-xs font-medium ${isProfit ? 'text-brand-500' : 'text-red-400'}`}>
                      {pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)}
                    </td>
                    <td className={`p-3 text-right text-xs font-medium ${isProfit ? 'text-brand-500' : 'text-red-400'}`}>
                      {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                    </td>
                    <td className="p-3 text-center text-xs">
                      <span className={p.tp1Executed ? 'text-brand-500' : 'text-gray-700'}>●</span>
                      <span className={p.tp2Executed ? 'text-brand-500' : 'text-gray-700'}>●</span>
                      <span className={p.tp3Executed ? 'text-brand-500' : 'text-gray-700'}>●</span>
                      {p.trailingStopActive && <span className="text-yellow-400 ml-1">T</span>}
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {new Date(p.openedAt).toLocaleTimeString()}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => close.mutate(p.id)}
                        disabled={close.isPending}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 px-2 py-1 rounded border border-red-800 hover:border-red-400"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
