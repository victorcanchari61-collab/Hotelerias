import { useCallback, useState } from 'react'
import { Check, ChevronDown, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../ui/cn'
import { useDismiss } from '../ui/useDismiss'

export interface MenuLink {
  label: string
  icon: LucideIcon
  onSelect: () => void
}

/** Una opcion del selector de contexto (p. ej. una sucursal). */
export interface ContextOption {
  id: number | string
  label: string
  icon: LucideIcon
}

export interface UserMenuProps {
  name: string
  email: string
  /** Enlaces de la parte superior ("Inicio", "Ver tienda"...). */
  links?: MenuLink[]
  /** Selector de contexto: titulo de la seccion, opciones y la activa. */
  contextTitle?: string
  contexts?: ContextOption[]
  activeContextId?: number | string | null
  onSelectContext?: (id: number | string) => void
  /** Enlaces justo antes de "Cerrar sesion". */
  footerLinks?: MenuLink[]
  onLogout: () => void
}

const itemClasses =
  'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors'

/**
 * Menu del usuario con selector de contexto.
 *
 * En la barra muestra el avatar, el nombre y el contexto activo (la sucursal);
 * al abrirlo permite cambiar de contexto, ir a otras pantallas y cerrar sesion.
 * No sabe de sucursales: recibe opciones genericas.
 */
export function UserMenu({
  name,
  email,
  links = [],
  contextTitle,
  contexts = [],
  activeContextId,
  onSelectContext,
  footerLinks = [],
  onLogout,
}: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss<HTMLDivElement>(close)

  const active = contexts.find((c) => c.id === activeContextId)
  const ActiveIcon = active?.icon

  const run = (action: () => void) => {
    close()
    action()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menú de usuario"
        className="flex cursor-pointer items-center gap-3 rounded-full border border-line bg-white py-1.5 pr-3 pl-1.5 shadow-sm transition-shadow hover:shadow-md"
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full [background-image:var(--grad-tile)] text-sm font-bold text-[var(--accent-on)]">
          {name.charAt(0).toUpperCase()}
        </span>

        <span className="hidden text-left sm:block">
          <span className="block text-sm leading-tight font-bold text-ink">{name}</span>
          <span className="block text-[11px] leading-tight text-ink-muted">{email}</span>
        </span>

        {active && ActiveIcon && (
          <span className="hidden items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] px-3 py-1 text-xs font-bold tracking-wide text-[var(--accent-ink)] uppercase md:inline-flex">
            <ActiveIcon size={14} />
            {active.label}
          </span>
        )}

        <ChevronDown
          size={16}
          className={cn('shrink-0 text-ink-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-2 w-72 animate-[fadeIn_150ms_ease-out] rounded-2xl border border-line bg-white p-2 shadow-panel sm:w-80"
        >
          {/* quien eres y en que sucursal */}
          <div className="px-3 pt-2 pb-3">
            <p className="font-bold text-ink">{name}</p>
            <p className="text-xs text-ink-muted">{email}</p>
            {active && ActiveIcon && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] px-3 py-1 text-xs font-bold tracking-wide text-[var(--accent-ink)] uppercase">
                <ActiveIcon size={14} />
                {active.label}
              </span>
            )}
          </div>

          <div className="border-t border-line pt-1">
            {links.map((l) => (
              <button
                key={l.label}
                type="button"
                role="menuitem"
                onClick={() => run(l.onSelect)}
                className={cn(itemClasses, 'font-medium text-ink hover:bg-surface-alt')}
              >
                <l.icon size={17} className="shrink-0 text-ink-muted" />
                {l.label}
              </button>
            ))}
          </div>

          {contexts.length > 0 && (
            <div className="mt-1 border-t border-line pt-2">
              {contextTitle && (
                <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
                  {contextTitle}
                </p>
              )}

              <div className="max-h-60 overflow-y-auto">
                {contexts.map((c) => {
                  const selected = c.id === activeContextId
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => run(() => onSelectContext?.(c.id))}
                      className={cn(
                        itemClasses,
                        selected
                          ? 'bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] font-semibold text-[var(--accent-ink)]'
                          : 'font-medium text-ink hover:bg-surface-alt',
                      )}
                    >
                      <c.icon size={17} className="shrink-0" />
                      <span className="flex-1 truncate">{c.label}</span>
                      {selected && <Check size={16} className="shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-1 border-t border-line pt-1">
            {footerLinks.map((l) => (
              <button
                key={l.label}
                type="button"
                role="menuitem"
                onClick={() => run(l.onSelect)}
                className={cn(itemClasses, 'font-medium text-ink hover:bg-surface-alt')}
              >
                <l.icon size={17} className="shrink-0 text-ink-muted" />
                {l.label}
              </button>
            ))}

            <button
              type="button"
              role="menuitem"
              onClick={() => run(onLogout)}
              className={cn(itemClasses, 'font-medium text-red-600 hover:bg-red-50')}
            >
              <LogOut size={17} className="shrink-0" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
