import { toneClasses, type Tone } from '../lib/tones';

export function StatusPill({ tone, children }: { children: React.ReactNode; tone: Tone }) {
  const { bg, text } = toneClasses[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bg} ${text}`}>
      {children}
    </span>
  );
}
