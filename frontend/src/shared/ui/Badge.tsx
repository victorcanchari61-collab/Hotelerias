import type { ReactNode } from 'react'
import { cn } from './cn'

/** "sys" se conserva como alias de "accent" (sigue al color del modulo). */
export type BadgeTone = 'accent' | 'sys' | 'neutral' | 'success' | 'warning' | 'danger' | 'info'

// Cada clase fija --tone-solid/bg/fg/line (styles/tones.css); el componente solo las consume.
const TONE_CLASS: Record<BadgeTone, string> = {
  accent: 'tone-accent',
  sys: 'tone-accent',
  neutral: 'tone-neutral',
  success: 'tone-success',
  warning: 'tone-warning',
  danger: 'tone-danger',
  info: 'tone-info',
}

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        TONE_CLASS[tone],
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        'bg-(--tone-bg) text-(--tone-fg) ring-1 ring-(--tone-line)',
        className,
      )}
    >
      {children}
    </span>
  )
}
