import { cn } from '@/lib/utils';

/**
 * Ever Spark infinity mark — recreated as a vector lemniscate so it stays
 * razor-sharp at any size and inherits the brand teal gradient.
 */
export function EverSparkMark({ className, size = 40 }: { className?: string; size?: number }) {
  const gid = 'es-mark-grad';
  return (
    <svg
      width={size}
      height={size * 0.52}
      viewBox="0 0 120 62"
      fill="none"
      className={className}
      role="img"
      aria-label="Ever Spark"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="120" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1fb9ab" />
          <stop offset="0.55" stopColor="#11978f" />
          <stop offset="1" stopColor="#0d8e87" />
        </linearGradient>
      </defs>
      <path
        d="M18 31
           C18 12, 49 12, 60 31
           C71 50, 102 50, 102 31
           C102 12, 71 12, 60 31
           C49 50, 18 50, 18 31 Z"
        stroke={`url(#${gid})`}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full lockup: mark + "everspark" wordmark, with an optional product tagline.
 */
export function EverSparkLogo({
  className,
  markSize = 34,
  showWordmark = true,
  tagline = 'MONITORING',
  invert = false,
}: {
  className?: string;
  markSize?: number;
  showWordmark?: boolean;
  tagline?: string | null;
  invert?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <EverSparkMark size={markSize} />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'font-extrabold tracking-tight text-[1.18rem]',
              invert ? 'text-white' : 'text-ink'
            )}
          >
            ever<span className="text-brand-600">spark</span>
          </span>
          {tagline && (
            <span
              className={cn(
                'text-[0.6rem] font-semibold tracking-[0.22em] mt-0.5',
                invert ? 'text-white/60' : 'text-slate-400'
              )}
            >
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
