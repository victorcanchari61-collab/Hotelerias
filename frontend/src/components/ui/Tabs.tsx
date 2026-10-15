import type { ReactNode } from 'react'
import { cn } from './cn'

export interface TabItem {
  id: string
  label: string
  icon?: ReactNode
  /** Numero al costado: cuantos registros tiene la pestaña. */
  badge?: number
}

export interface TabsProps {
  items: TabItem[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/**
 * Pestañas de una vista.
 *
 * Se usan cuando varias tablas pequeñas pertenecen al mismo tema y no merecen
 * entrada propia en el menu: categorias, marcas y unidades viven dentro de
 * Productos porque solo se tocan al dar de alta uno.
 */
export function Tabs({ items, active, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        // Se desliza en movil: cuatro pestañas no entran en 390px.
        '-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {items.map((item) => {
        const activa = item.id === active
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={activa}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm whitespace-nowrap',
              'transition-colors duration-150',
              activa
                ? 'font-semibold text-[rgb(var(--sys-ink-rgb))]'
                : 'text-ink-soft hover:text-ink',
            )}
          >
            {item.icon}
            {item.label}
            {item.badge !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                  activa
                    ? 'bg-[rgb(var(--sys-rgb)/0.12)] text-[rgb(var(--sys-ink-rgb))]'
                    : 'bg-slate-100 text-slate-500',
                )}
              >
                {item.badge}
              </span>
            )}

            {/* La linea inferior marca la activa sin mover el texto. */}
            {activa && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-[rgb(var(--sys-rgb))]"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
