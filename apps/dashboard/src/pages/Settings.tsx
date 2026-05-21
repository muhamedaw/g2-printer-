import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface UserSettings {
  capitalUsd:      number;
  maxPositionPct:  number;
  minScoreToBuy:   number;
  stopLossPct:     number;
  paperTrading:    boolean;
  telegramChatId:  string | null;
}

interface WalletStatus {
  registered: boolean;
}

export default function Settings() {
  const qc = useQueryClient();
  const [paperConfirm, setPaperConfirm] = useState('');
  const [saved, setSaved] = useState(false);
  const [privateKey, setPrivateKey] = useState('');
  const [walletSaved, setWalletSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => api.get<UserSettings>('/settings'),
  });

  type EditableFields = Omit<UserSettings, 'paperTrading' | 'telegramChatId'>;
  const [form, setForm] = useState<Partial<EditableFields>>({});
  const current: Partial<UserSettings> = { ...data, ...form };

  const save = useMutation({
    mutationFn: () => api.put<UserSettings>('/settings', form),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      setForm({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const togglePaper = useMutation({
    mutationFn: () => api.post<void>('/settings/paper-mode', { confirm: 'CONFIRM' }),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ['settings'] }); setPaperConfirm(''); },
  });

  const saveWallet = useMutation({
    mutationFn: () => api.post<WalletStatus>('/settings/wallet', { privateKey }),
    onSuccess:  () => { setPrivateKey(''); setWalletSaved(true); setTimeout(() => setWalletSaved(false), 3000); },
  });

  function numField(key: keyof EditableFields, label: string, hint?: string) {
    return (
      <div key={key}>
        <label className="block text-xs text-gray-400 mb-1">
          {label}{hint && <span className="text-gray-600 ml-1">{hint}</span>}
        </label>
        <input
          type="number"
          value={form[key] !== undefined ? String(form[key]) : String(current[key] ?? '')}
          onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) }))}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
          step="1"
        />
      </div>
    );
  }

  if (isLoading) return <p className="text-gray-400">Loading…</p>;

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-xl font-bold">Settings</h2>

      {/* Trading Mode */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 space-y-3">
        <p className="text-sm font-medium">Trading Mode</p>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${current.paperTrading ? 'bg-yellow-500/20 text-yellow-400' : 'bg-brand-700 text-white'}`}>
            {current.paperTrading ? '📄 Paper Mode' : '🟢 Live Mode'}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            value={paperConfirm}
            onChange={e => setPaperConfirm(e.target.value)}
            placeholder="Type CONFIRM to toggle"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={() => togglePaper.mutate()}
            disabled={paperConfirm !== 'CONFIRM' || togglePaper.isPending}
            className="px-3 py-1.5 rounded-lg text-xs bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white"
          >
            Toggle
          </button>
        </div>
      </div>

      {/* Solana Wallet */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 space-y-3">
        <p className="text-sm font-medium">Solana Wallet (Live Trading)</p>
        <p className="text-xs text-gray-500">
          Paste your Solana private key (base58). It is encrypted with AES-256 before storage and never leaves the server unencrypted.
        </p>
        {current.paperTrading === false && (
          <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 rounded-lg px-3 py-2">
            <span>🟢</span> Live mode active — trades use real SOL via Jupiter DEX
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="password"
            value={privateKey}
            onChange={e => setPrivateKey(e.target.value)}
            placeholder="Base58 private key…"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={() => saveWallet.mutate()}
            disabled={privateKey.length < 80 || saveWallet.isPending}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white transition-colors"
          >
            {walletSaved ? '✅ Saved' : saveWallet.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
        {saveWallet.isError && (
          <p className="text-xs text-red-400">{String((saveWallet.error as Error).message)}</p>
        )}
      </div>

      {/* Risk Settings */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 space-y-4">
        <p className="text-sm font-medium">Risk Parameters</p>
        <div className="grid grid-cols-2 gap-3">
          {numField('capitalUsd',     'Capital (USD)',           '($)')}
          {numField('maxPositionPct', 'Max Position',            '(% of capital)')}
          {numField('minScoreToBuy',  'Min AI Score to Buy',     '(50-100)')}
          {numField('stopLossPct',    'Stop Loss',               '(% e.g. 30)')}
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={Object.keys(form).length === 0 || save.isPending}
          className="w-full py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white transition-colors"
        >
          {saved ? '✅ Saved' : save.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Telegram Chat ID */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 space-y-3">
        <p className="text-sm font-medium">Telegram Notifications</p>
        <p className="text-xs text-gray-500">
          Get your chat ID by sending <code className="bg-gray-800 px-1 rounded">/start</code> to the bot.
        </p>
        <input
          type="text"
          defaultValue={current.telegramChatId ?? ''}
          placeholder="e.g. 123456789"
          onBlur={e => {
            const v = e.target.value.trim();
            if (v) void api.put('/settings', { telegramChatId: v });
          }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
        />
      </div>
    </div>
  );
}
