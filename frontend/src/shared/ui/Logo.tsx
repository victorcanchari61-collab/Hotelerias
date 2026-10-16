import { cn } from './cn'

/**
 * Identidad de Titanic D, redibujada como SVG a partir de los dos conceptos
 * originales para que se vea nitida en cualquier tamaño y pantalla.
 *
 *  - `emblem`   sello circular con la espiga (concepto 1)
 *  - `wordmark` la T en su caja + "Titanic D" + bajada (concepto 2)
 *  - `mark`     solo la caja de la T, para espacios estrechos
 */
export type LogoVariant = 'emblem' | 'wordmark' | 'mark'

export interface LogoProps {
  variant?: LogoVariant
  /** Alto en px del grafico (el ancho se ajusta solo). */
  size?: number
  /** Muestra "DISTRIBUIDORA DE ABARROTES" bajo el nombre. */
  tagline?: boolean
  /** Pinta el texto en claro, para fondos oscuros. */
  inverted?: boolean
  className?: string
}

export function Logo({
  variant = 'wordmark',
  size,
  tagline = false,
  inverted = false,
  className,
}: LogoProps) {
  if (variant === 'emblem') return <Emblem size={size ?? 96} tagline={tagline} className={className} />
  if (variant === 'mark') return <Mark size={size ?? 36} className={className} />
  return <Wordmark size={size ?? 32} tagline={tagline} inverted={inverted} className={className} />
}

/* --------------------------------- sello --------------------------------- */

function Emblem({
  size,
  tagline,
  className,
}: {
  size: number
  tagline: boolean
  className?: string
}) {
  return (
    <span className={cn('inline-flex flex-col items-center gap-2', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        role="img"
        aria-label="Titanic D"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="td-disc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-navy)" />
            <stop offset="100%" stopColor="var(--color-navy-deep)" />
          </linearGradient>
        </defs>

        <circle cx="60" cy="60" r="58" fill="url(#td-disc)" />
        <circle
          cx="60"
          cy="60"
          r="49"
          fill="none"
          stroke="var(--color-bronze)"
          strokeWidth="1.75"
          opacity="0.9"
        />

        {/* espiga */}
        <g fill="var(--color-gold)">
          <ellipse cx="60" cy="30.5" rx="6" ry="9" />
          {[43, 54, 65].map((y) => (
            <g key={y}>
              <ellipse cx="49.5" cy={y} rx="6" ry="9" transform={`rotate(-26 49.5 ${y})`} />
              <ellipse cx="70.5" cy={y} rx="6" ry="9" transform={`rotate(26 70.5 ${y})`} />
            </g>
          ))}
        </g>

        {/* tallo y base */}
        <path
          d="M60 36 V 82"
          stroke="var(--color-gold)"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <circle cx="60" cy="88" r="7.5" fill="none" stroke="var(--color-gold)" strokeWidth="2.25" />
        <path
          d="M52.5 88h15M60 80.5v15"
          stroke="var(--color-gold)"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>

      {tagline && (
        <span className="flex flex-col items-center">
          <span className="text-lg font-extrabold tracking-[0.18em] text-[var(--color-navy)]">
            TITANIC D
          </span>
          <span className="mt-0.5 text-[9px] font-semibold tracking-[0.28em] text-[var(--color-bronze)]">
            DISTRIBUIDORA DE ABARROTES
          </span>
        </span>
      )}
    </span>
  )
}

/* ------------------------------- caja de la T ----------------------------- */

function Mark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size * 0.78}
      height={size}
      viewBox="0 0 32 41"
      role="img"
      aria-label="Titanic D"
      className={cn('shrink-0', className)}
    >
      <rect x="0" y="0" width="32" height="41" rx="7" fill="var(--color-navy)" />
      <path
        d="M8 12.5h16M16 12.5v17"
        stroke="var(--color-gold)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ------------------------------- lockup ----------------------------------- */

function Wordmark({
  size,
  tagline,
  inverted,
  className,
}: {
  size: number
  tagline: boolean
  inverted: boolean
  className?: string
}) {
  return (
    <span className={cn('inline-flex flex-col', className)}>
      <span className="inline-flex items-center gap-2">
        <Mark size={size} />
        <span
          className={cn(
            'font-semibold tracking-tight',
            inverted ? 'text-white' : 'text-[var(--color-navy)]',
          )}
          style={{ fontSize: size * 0.66, lineHeight: 1 }}
        >
          itanic D
        </span>
      </span>

      {tagline && (
        <>
          <span
            aria-hidden="true"
            className="mt-1.5 block h-px w-full bg-[var(--color-bronze)] opacity-80"
          />
          <span
            className="mt-1 block truncate font-semibold text-[var(--color-bronze)]"
            style={{ fontSize: Math.max(7, size * 0.26), letterSpacing: size < 30 ? '0.14em' : '0.24em' }}
          >
            DISTRIBUIDORA DE ABARROTES
          </span>
        </>
      )}
    </span>
  )
}
