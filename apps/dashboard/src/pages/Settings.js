import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
export default function Settings() {
    const qc = useQueryClient();
    const [paperConfirm, setPaperConfirm] = useState('');
    const [saved, setSaved] = useState(false);
    const [privateKey, setPrivateKey] = useState('');
    const [walletSaved, setWalletSaved] = useState(false);
    const { data, isLoading } = useQuery({
        queryKey: ['settings'],
        queryFn: () => api.get('/settings'),
    });
    const [form, setForm] = useState({});
    const current = { ...data, ...form };
    const save = useMutation({
        mutationFn: () => api.put('/settings', form),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['settings'] });
            setForm({});
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        },
    });
    const togglePaper = useMutation({
        mutationFn: () => api.post('/settings/paper-mode', { confirm: 'CONFIRM' }),
        onSuccess: () => { void qc.invalidateQueries({ queryKey: ['settings'] }); setPaperConfirm(''); },
    });
    const saveWallet = useMutation({
        mutationFn: () => api.post('/settings/wallet', { privateKey }),
        onSuccess: () => { setPrivateKey(''); setWalletSaved(true); setTimeout(() => setWalletSaved(false), 3000); },
    });
    function numField(key, label, hint) {
        return (_jsxs("div", { children: [_jsxs("label", { className: "block text-xs text-gray-400 mb-1", children: [label, hint && _jsx("span", { className: "text-gray-600 ml-1", children: hint })] }), _jsx("input", { type: "number", value: form[key] !== undefined ? String(form[key]) : String(current[key] ?? ''), onChange: e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) })), className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500", step: "1" })] }, key));
    }
    if (isLoading)
        return _jsx("p", { className: "text-gray-400", children: "Loading\u2026" });
    return (_jsxs("div", { className: "space-y-6 max-w-lg", children: [_jsx("h2", { className: "text-xl font-bold", children: "Settings" }), _jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800 space-y-3", children: [_jsx("p", { className: "text-sm font-medium", children: "Trading Mode" }), _jsx("div", { className: "flex items-center gap-3", children: _jsx("span", { className: `px-3 py-1 rounded-full text-xs font-medium ${current.paperTrading ? 'bg-yellow-500/20 text-yellow-400' : 'bg-brand-700 text-white'}`, children: current.paperTrading ? '📄 Paper Mode' : '🟢 Live Mode' }) }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { value: paperConfirm, onChange: e => setPaperConfirm(e.target.value), placeholder: "Type CONFIRM to toggle", className: "flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500" }), _jsx("button", { onClick: () => togglePaper.mutate(), disabled: paperConfirm !== 'CONFIRM' || togglePaper.isPending, className: "px-3 py-1.5 rounded-lg text-xs bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white", children: "Toggle" })] })] }), _jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800 space-y-3", children: [_jsx("p", { className: "text-sm font-medium", children: "Solana Wallet (Live Trading)" }), _jsx("p", { className: "text-xs text-gray-500", children: "Paste your Solana private key (base58). It is encrypted with AES-256 before storage and never leaves the server unencrypted." }), current.paperTrading === false && (_jsxs("div", { className: "flex items-center gap-2 text-xs text-green-400 bg-green-900/20 rounded-lg px-3 py-2", children: [_jsx("span", { children: "\uD83D\uDFE2" }), " Live mode active \u2014 trades use real SOL via Jupiter DEX"] })), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "password", value: privateKey, onChange: e => setPrivateKey(e.target.value), placeholder: "Base58 private key\u2026", className: "flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500" }), _jsx("button", { onClick: () => saveWallet.mutate(), disabled: privateKey.length < 80 || saveWallet.isPending, className: "px-4 py-2 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white transition-colors", children: walletSaved ? '✅ Saved' : saveWallet.isPending ? 'Saving…' : 'Save' })] }), saveWallet.isError && (_jsx("p", { className: "text-xs text-red-400", children: String(saveWallet.error.message) }))] }), _jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800 space-y-4", children: [_jsx("p", { className: "text-sm font-medium", children: "Risk Parameters" }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [numField('capitalUsd', 'Capital (USD)', '($)'), numField('maxPositionPct', 'Max Position', '(% of capital)'), numField('minScoreToBuy', 'Min AI Score to Buy', '(50-100)'), numField('stopLossPct', 'Stop Loss', '(% e.g. 30)')] }), _jsx("button", { onClick: () => save.mutate(), disabled: Object.keys(form).length === 0 || save.isPending, className: "w-full py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white transition-colors", children: saved ? '✅ Saved' : save.isPending ? 'Saving…' : 'Save Changes' })] }), _jsxs("div", { className: "bg-gray-900 rounded-xl p-4 border border-gray-800 space-y-3", children: [_jsx("p", { className: "text-sm font-medium", children: "Telegram Notifications" }), _jsxs("p", { className: "text-xs text-gray-500", children: ["Get your chat ID by sending ", _jsx("code", { className: "bg-gray-800 px-1 rounded", children: "/start" }), " to the bot."] }), _jsx("input", { type: "text", defaultValue: current.telegramChatId ?? '', placeholder: "e.g. 123456789", onBlur: e => {
                            const v = e.target.value.trim();
                            if (v)
                                void api.put('/settings', { telegramChatId: v });
                        }, className: "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" })] })] }));
}
