import type { ReactNode } from 'react'
import { cn } from './cn'

type Tone = 'error' | 'warning' | 'info'

// Los avisos usan los mismos tonos que las insignias (styles/tones.css).
const TONE_CLASS: Record<Tone, string> = {
  error: 'tone-danger',
  warning: 'tone-warning',
  info: 'tone-info',
}

/**
 * `error` es un fallo (rojo), `warning` un aviso a tener en cuenta (ambar) e
 * `info` una nota que no debe llamar la atencion como las otras.
 */
export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: Tone }) {
  return (
    <div
      role="alert"
      className={cn(
        TONE_CLASS[tone],
        'flex gap-2 rounded-field border p-3 text-sm',
        'border-(--tone-line) bg-(--tone-bg) text-(--tone-fg)',
      )}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.2v.6" />
      </svg>
      <span>{children}</span>
    </div>
  )
}
