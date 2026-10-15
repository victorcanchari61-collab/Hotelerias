import type { ReactNode } from 'react'
import { cn } from './cn'

export type BadgeTone = 'sys' | 'neutral' | 'success' | 'warning' | 'danger'

const TONES: Record<BadgeTone, string> = {
  sys: 'bg-[rgb(var(--sys-rgb)/0.1)] text-[rgb(var(--sys-ink-rgb))] ring-[rgb(var(--sys-rgb)/0.25)]',
  neutral: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
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
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
