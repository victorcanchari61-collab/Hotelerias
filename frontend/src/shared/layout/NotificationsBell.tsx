import { useCallback, useState } from 'react'
import { Bell } from 'lucide-react'
import { useDismiss } from '../ui/useDismiss'

export interface NotificationItem {
  id: string
  title: string
  detail?: string
}

interface Props {
  items?: NotificationItem[]
}

/**
 * Campana de notificaciones. Solo pinta lo que recibe: de donde salen las
 * alertas (API, tiempo real) lo decide quien la monta.
 */
export function NotificationsBell({ items = [] }: Props) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss<HTMLDivElement>(close)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notificaciones"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-ink shadow-sm transition-shadow hover:shadow-md"
      >
        <Bell size={19} />
        {items.length > 0 && (
          <span className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white ring-2 ring-white">
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 animate-[fadeIn_150ms_ease-out] rounded-2xl border border-line bg-white shadow-panel sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-80">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-sm font-bold text-ink">Notificaciones</h3>
            <p className="text-xs text-ink-soft">{items.length === 0 ? 'Todo en orden' : `${items.length} por revisar`}</p>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-soft">No hay nada pendiente.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="border-b border-line px-4 py-3 last:border-0">
                  <p className="truncate text-sm font-semibold text-ink">{n.title}</p>
                  {n.detail && <p className="truncate text-xs text-ink-soft">{n.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
