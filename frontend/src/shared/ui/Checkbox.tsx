import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label
      className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted', className)}
    >
      <input type="checkbox" className="peer sr-only" {...rest} />
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-[18px] shrink-0 items-center justify-center rounded-[6px]',
          'border border-line-strong text-transparent transition-colors',
          'peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand',
          'peer-focus-visible:ring-4 peer-focus-visible:ring-brand-ring',
        )}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </span>
      <span>{label}</span>
    </label>
  )
}
