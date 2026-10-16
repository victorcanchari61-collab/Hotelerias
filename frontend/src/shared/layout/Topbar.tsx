import type { ReactNode } from 'react'
import { Menu, PanelLeftOpen } from 'lucide-react'

export interface TopbarProps {
  /** El sider esta oculto: se muestra el boton para traerlo de vuelta. */
  siderOculto: boolean
  onMostrarSider: () => void
  onOpenMenu: () => void
  /** Todo lo que va a la derecha (menu de usuario, notificaciones...). */
  right?: ReactNode
}

// Mismo aspecto que la campana: circulo blanco con sombra suave.
const roundButton =
  'pointer-events-auto inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-ink shadow-sm transition-shadow hover:shadow-md'

/**
 * Controles flotantes sobre el area de trabajo: sin franja y SIN ocupar alto.
 *
 * Van en position:fixed, asi la pagina empieza arriba del todo y su titulo
 * queda en la misma fila que el menu de usuario. El contenedor no recibe clics
 * (pointer-events-none) para no tapar lo que hay debajo; solo los controles.
 * AppShell deja el espacio necesario: arriba en movil (donde no caben en la
 * misma fila) y a la derecha del encabezado de pagina en escritorio.
 */
export function Topbar({ siderOculto, onMostrarSider, onOpenMenu, right }: TopbarProps) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center gap-3 px-4 py-3 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menú"
        className={`${roundButton} lg:hidden`}
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      <div className="pointer-events-auto flex items-center gap-3">
        {/*
          Con el sider oculto, el boton para traerlo de vuelta va JUNTO al menu
          de usuario (a su izquierda): es la unica forma de recuperarlo y asi
          queda con el resto de controles en vez de suelto en la otra esquina.
        */}
        {siderOculto && (
          <button
            type="button"
            onClick={onMostrarSider}
            aria-label="Mostrar menú"
            title="Mostrar menú"
            className={`${roundButton} hidden lg:inline-flex`}
          >
            <PanelLeftOpen size={20} />
          </button>
        )}

        {right}
      </div>
    </header>
  )
}
