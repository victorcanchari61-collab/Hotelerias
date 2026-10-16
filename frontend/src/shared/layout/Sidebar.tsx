import { useState } from 'react'
import { EyeOff, Home, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { cn } from '../ui/cn'
import { IconTile } from '../ui/IconTile'
import { NavButton } from './NavButton'
import { NAV_INK } from './nav-styles'
import { NavGroupBlock } from './NavGroupBlock'
import type { Brand, NavGroup } from './types'

export interface SidebarProps {
  brand: Brand
  /** Color de sistema del modulo abierto (un `data-sys`), para el encabezado. */
  sys: string
  groups: NavGroup[]
  /** Id de la vista activa; vacio = inicio. */
  active: string
  onSelect: (id: string) => void
  /** Colapsado a solo iconos (escritorio). */
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Abierto como panel deslizante (movil). */
  mobileOpen: boolean
  onCloseMobile: () => void
  /** Oculto por completo: la vista gana todo el ancho. */
  oculto: boolean
  onOcultar: () => void
}

function groupOf(groups: NavGroup[], itemId: string) {
  return groups.find((g) => g.items.some((i) => i.id === itemId))?.id
}

export function Sidebar({
  brand,
  sys,
  groups,
  active,
  onSelect,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  oculto,
  onOcultar,
}: SidebarProps) {
  // Empieza abierto el grupo que contiene la vista activa.
  const [open, setOpen] = useState<string[]>(() => {
    const id = groupOf(groups, active)
    return id ? [id] : []
  })
  const [prevCollapsed, setPrevCollapsed] = useState(collapsed)
  const [prevActive, setPrevActive] = useState(active)

  // Al cambiar de contraido a expandido (o al reves) se cierra lo que hubiera
  // abierto: un panel flotante no tiene sentido con el sider ya desplegado.
  if (prevCollapsed !== collapsed) {
    setPrevCollapsed(collapsed)
    setOpen([])
  }

  // Si se llega a una vista por un enlace, su grupo se despliega solo.
  if (prevActive !== active) {
    setPrevActive(active)
    const id = groupOf(groups, active)
    if (id && !collapsed && !open.includes(id)) setOpen([...open, id])
  }

  const toggleGroup = (id: string) =>
    setOpen((prev) => {
      if (prev.includes(id)) return prev.filter((g) => g !== id)

      // Expandido pueden quedar varios grupos abiertos a la vez; contraido no,
      // porque los paneles flotantes se montarian uno sobre otro.
      return collapsed ? [id] : [...prev, id]
    })

  return (
    <>
      {/* velo en movil */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-[2px] lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Menú principal"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-white',
          'transition-[width,transform] duration-200',
          collapsed ? 'w-[72px]' : 'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Oculto se sale de pantalla deslizandose; el topbar deja un boton
          // para traerlo de vuelta.
          oculto ? 'lg:-translate-x-full' : 'lg:translate-x-0',
        )}
      >
        {/* cabecera */}
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b border-line px-3',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {/* el cuadro y su degradado toman los colores del modulo abierto */}
          <div data-sys={sys} className="flex min-w-0 items-center gap-3">
            <IconTile icon={brand.icon} size="lg" />
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <p className={cn('truncate text-lg font-bold tracking-tight', NAV_INK)}>{brand.name}</p>
                {brand.subtitle && (
                  <p className={cn('truncate text-sm opacity-70', NAV_INK)}>{brand.subtitle}</p>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar menú"
            className="cursor-pointer rounded-md p-1 text-ink-muted hover:bg-surface-alt lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* navegacion */}
        <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto p-2">
          <div data-sys="brand">
            <NavButton
              icon={<Home size={18} />}
              label="Inicio"
              active={active === ''}
              collapsed={collapsed}
              onClick={() => onSelect('')}
            />
          </div>

          {groups.map((group) => (
            <NavGroupBlock
              key={group.id}
              group={group}
              active={active}
              collapsed={collapsed}
              open={open.includes(group.id)}
              onToggle={() => toggleGroup(group.id)}
              onSelect={onSelect}
            />
          ))}
        </nav>

        {/* pie: contraer y ocultar */}
        <div className={cn('hidden shrink-0 gap-1 border-t border-line p-2 lg:flex', collapsed && 'flex-col')}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
            title={collapsed ? 'Expandir' : 'Contraer'}
            className={cn(
              'flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm',
              cn(NAV_INK, 'transition-colors hover:bg-(--accent-soft)'),
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!collapsed && <span>Contraer</span>}
          </button>

          <button
            type="button"
            onClick={onOcultar}
            aria-label="Ocultar menú"
            title="Ocultar menú"
            className={cn(
              'flex cursor-pointer items-center justify-center rounded-lg px-3 py-2 transition-colors',
              NAV_INK,
              'hover:bg-(--accent-soft)',
            )}
          >
            <EyeOff size={18} />
          </button>
        </div>
      </aside>
    </>
  )
}
