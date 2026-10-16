import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../ui/cn'
import { ThemedIcon } from '../ui/ThemedIcon'
import { ACTIVE_ROW, INACTIVE_ROW, NAV_INK } from './nav-styles'
import type { NavGroup } from './types'

interface Props {
  group: NavGroup
  ancla: HTMLElement
  active: string
  onSelect: (id: string) => void
  onCerrar: () => void
}

/**
 * Submodulos de un grupo cuando el sider esta contraido.
 *
 * Se pinta en un portal con position:fixed anclado al icono, porque dentro del
 * sider quedaria recortado por su ancho de 72px. Entra con una animacion corta
 * desde la izquierda, para que se lea como que sale del propio icono.
 */
export function FloatingSubmenu({ group, ancla, active, onSelect, onCerrar }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const items = group.items.filter((item) => !item.hidden)

  useEffect(() => {
    const colocar = () => {
      const r = ancla.getBoundingClientRect()
      const alto = 52 + items.length * 34

      // Se ancla al borde del sider, no al del icono: si no, el panel se monta
      // sobre la propia barra porque el boton esta centrado dentro de ella.
      const barra = ancla.closest('aside')?.getBoundingClientRect()

      setPos({
        // Si el grupo esta al final del sider, el panel sube para no cortarse.
        top: Math.min(r.top, Math.max(8, window.innerHeight - alto - 8)),
        left: (barra?.right ?? r.right) + 8,
      })
    }

    colocar()
    const id = requestAnimationFrame(() => setVisible(true))

    const fuera = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !ancla.contains(e.target as Node)) onCerrar()
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()

    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', colocar)
    window.addEventListener('scroll', colocar, true)

    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', colocar)
      window.removeEventListener('scroll', colocar, true)
    }
  }, [ancla, items.length, onCerrar])

  if (!pos) return null

  return createPortal(
    <div
      ref={ref}
      data-sys={group.sys}
      style={{ top: pos.top, left: pos.left }}
      className={cn(
        'fixed z-50 w-56 origin-left rounded-panel border border-line bg-white p-1.5 shadow-panel',
        'transition-all duration-150',
        visible ? 'translate-x-0 scale-100 opacity-100' : '-translate-x-2 scale-95 opacity-0',
      )}
    >
      <p className={cn('px-2.5 pt-1 pb-2 text-[11px] font-semibold tracking-wider uppercase', NAV_INK)}>
        {group.label}
      </p>

      <div className="max-h-[70vh] overflow-y-auto">
        {items.map((item) => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                isActive ? cn(ACTIVE_ROW, 'font-semibold') : INACTIVE_ROW,
              )}
            >
              <ThemedIcon icon={item.icon} size={15} className="shrink-0" />
              <span className="flex-1 truncate text-left">{item.label}</span>
              {item.badge && (
                <span className="rounded-full bg-(--accent-soft) px-1.5 py-0.5 text-[10px] font-bold text-(--accent-ink)">
                  {item.badge}
                </span>
              )}
              {!item.badge && item.pending && (
                <span aria-hidden="true" className="size-1.5 rounded-full bg-line-strong" />
              )}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
