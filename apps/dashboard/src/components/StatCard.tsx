interface Props {
  label:    string;
  value:    string;
  sub?:     string;
  positive?: boolean;
}

export default function StatCard({ label, value, sub, positive }: Props) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${positive === true ? 'text-brand-500' : positive === false ? 'text-red-400' : 'text-white'}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
