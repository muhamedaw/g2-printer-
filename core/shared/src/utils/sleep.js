export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export function formatDuration(ms) {
    if (ms < 60000)
        return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000)
        return `${Math.round(ms / 60000)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
}
export function parseDuration(input) {
    const match = input.match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/i);
    if (!match)
        return null;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * (multipliers[unit] ?? 0);
}
export function formatUsd(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}
export function formatPercent(value) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
}
