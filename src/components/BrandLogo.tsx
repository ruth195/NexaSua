import React from 'react';

export const APPROVED_LOGO_SRC = '/assets/aistudio/NexaSua_Education_Emblem_9038771b.png';

export function BrandLogo({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const heights = {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-14',
  };

  return (
    <span className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <img
        src={APPROVED_LOGO_SRC}
        alt="NexaSua"
        referrerPolicy="no-referrer"
        className={`${heights[size]} w-auto object-contain select-none`}
      />
    </span>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="border border-slate-200 bg-white rounded-xl px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-[#102846]">{title}</h3>
      <p className="mt-1.5 text-sm text-[#64748B] max-w-md mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white hover:bg-[#10766c] transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function formatGhanaDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatGhs(amount?: number | null): string {
  if (amount === null || amount === undefined) return 'Custom';
  return `GH₵${amount.toLocaleString('en-GH', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
