import { useState } from 'react';
import { Tv } from 'lucide-react';

interface ChannelLogoProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ChannelLogo({ src, name, size = 'md' }: ChannelLogoProps) {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-9 h-9 text-xs rounded-lg'
      : size === 'lg'
        ? 'w-14 h-14 text-base rounded-xl'
        : 'w-11 h-11 text-xs rounded-xl';

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  if (!src || failed) {
    return (
      <div
        className={`${dims} shrink-0 bg-[#181E29] border border-slate-800 flex items-center justify-center font-display font-semibold text-slate-300 select-none`}
      >
        {initials || <Tv className="w-4 h-4 text-slate-400" />}
      </div>
    );
  }

  return (
    <div
      className={`${dims} shrink-0 bg-[#181E29] border border-slate-800 overflow-hidden flex items-center justify-center p-1`}
    >
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
}
