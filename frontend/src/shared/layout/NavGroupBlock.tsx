import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../ui/cn'
import { ThemedIcon } from '../ui/ThemedIcon'
import { FloatingSubmenu } from './FloatingSubmenu'
import { NavButton } from './NavButton'
import { INACTIVE_ROW, NAV_INK } from './nav-styles'
import type { NavGroup } from './types'

interface Props {
  group: NavGroup
  active: string
  collapsed: boolean
  open: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}

export function NavGroupBlock({ group, active, collapsed, open, onToggle, onSelect }: Props) {
  const hasActive = group.items.some((i) => i.id === active)

  // Boton desde el que se abre el panel flotante cuando el sider esta contraido.
  const [ancla, setAncla] = useState<HTMLElement | null>(null)

  // Colapsado: el icono abre un panel flotante con los submodulos, en vez de
  // saltar a ciegas a la primera vista del grupo.
  if (collapsed) {
    return (
      <div data-sys={group.sys}>
        <NavButton
          icon={<ThemedIcon icon={group.icon} size={18} />}
          label={group.label}
          active={hasActive}
          collapsed
          onClick={(e) => {
            setAncla(e.currentTarget)
            onToggle()
          }}
        />

        {open && ancla && (
          <FloatingSubmenu
            group={group}
            ancla={ancla}
            active={active}
            onSelect={(id) => {
              onSelect(id)
              onToggle()
            }}
            onCerrar={onToggle}
          />
        )}
      </div>
    )
  }

  return (
    <div data-sys={group.sys}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
          // Un solo color: el grupo con la vista activa solo se distingue por
          // el fondo suave, no por cambiar de color.
          hasActive ? cn(NAV_INK, 'bg-(--accent-soft)') : INACTIVE_ROW,
        )}
      >
        <ThemedIcon icon={group.icon} size={18} className="shrink-0" />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronDown size={15} className={cn('shrink-0 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {/* acordeon: la fila pasa de 0fr a 1fr, asi el alto se anima sin medirlo */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-1 ml-4 space-y-0.5 border-l border-line pl-2">
            {group.items
              .filter((item) => !item.hidden)
              .map((item) => (
                <NavButton
                  key={item.id}
                  icon={<ThemedIcon icon={item.icon} size={16} />}
                  label={item.label}
                  badge={item.badge}
                  pending={item.pending}
                  active={active === item.id}
                  collapsed={false}
                  onClick={() => onSelect(item.id)}
                  small
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
