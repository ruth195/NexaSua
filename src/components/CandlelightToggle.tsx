import React from 'react';
import { Flame } from 'lucide-react';

export function CandlelightToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={enabled ? 'Turn off candlelight mode' : 'Turn on candlelight mode'}
      title={enabled ? 'Candlelight mode active — click to return to daylight' : 'Switch to warm candlelight reading mode'}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#148D82] ${
        enabled
          ? 'border-[#E2A83B] bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]'
          : 'border-slate-300 bg-white text-[#102846] hover:bg-[#FBF8F1]'
      }`}
    >
      <Flame className={`w-3.5 h-3.5 shrink-0 ${enabled ? 'text-[#D97706] fill-[#F59E0B]' : 'text-[#64748B]'}`} />
      <span>{enabled ? 'Candlelight On' : 'Candlelight'}</span>
    </button>
  );
}
