import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Menu, PanelLeftOpen } from 'lucide-react'
import { CabeceraGlobalContext, cn } from '../ui'
import type { CabeceraGlobal } from '../ui'
import { CampanaAlertas, MenuCuenta } from './CuentaUsuario'
import { Sidebar } from './Sidebar'
import { resolveNav } from './navigation'

export interface DashboardLayoutProps {
  active: string
  onSelect: (id: string) => void
  userName: string
  userEmail: string
  userFoto: string | null
  onPerfil: () => void
  onLogout: () => void
  children: ReactNode
}

/**
 * Estructura de la aplicacion: sider blanco fijo a la izquierda y area de
 * trabajo gris a la derecha.
 *
 * Sin barra superior: la cuenta del usuario y la campana van en la fila del
 * título de cada vista (ver cabeceraGlobal y PageHeader), y el botón del menú
 * del celular, a la izquierda de ese mismo título. Así la pantalla arranca
 * directo con lo que importa.
 *
 * El `data-sys` del contenedor lleva el color del sistema al que pertenece la
 * vista abierta, asi que cabeceras, tablas y tarjetas se tiñen solas.
 */
export function DashboardLayout({
  active,
  onSelect,
  userName,
  userEmail,
  userFoto,
  onPerfil,
  onLogout,
  children,
}: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [oculto, setOculto] = useState(false)
  // Cuántas cabeceras de vista hay en pantalla: sin ninguna, el layout pinta la cuenta por su cuenta.
  const [cabeceras, setCabeceras] = useState(0)

  const { sys } = resolveNav(active)

  const registrar = useCallback(() => {
    setCabeceras((n) => n + 1)
    return () => setCabeceras((n) => n - 1)
  }, [])

  const cabecera = useMemo<CabeceraGlobal>(
    () => ({
      izquierda: (
        <>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="-ml-1 shrink-0 cursor-pointer rounded-lg p-2 text-ink-muted transition-colors hover:bg-white lg:hidden"
          >
            <Menu size={20} />
          </button>
          {/* Solo con el sider oculto: es la unica forma de recuperarlo. */}
          {oculto && (
            <button
              type="button"
              onClick={() => setOculto(false)}
              aria-label="Mostrar menú"
              title="Mostrar menú"
              className="-ml-1 hidden shrink-0 cursor-pointer rounded-lg p-2 text-ink-muted transition-colors hover:bg-white hover:text-ink lg:block"
            >
              <PanelLeftOpen size={20} />
            </button>
          )}
        </>
      ),
      derecha: (
        <>
          <MenuCuenta nombre={userName} email={userEmail} foto={userFoto} onPerfil={onPerfil} onLogout={onLogout} />
          <CampanaAlertas onNavigate={onSelect} />
        </>
      ),
      registrar,
    }),
    [oculto, userName, userEmail, userFoto, onPerfil, onLogout, onSelect, registrar],
  )

  return (
    <div data-sys={sys} className="min-h-screen bg-surface-alt">
      <Sidebar
        active={active}
        onSelect={(id) => {
          onSelect(id)
          setMobileOpen(false)
        }}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        oculto={oculto}
        onOcultar={() => setOculto(true)}
      />

      <div
        className={cn(
          'flex min-h-screen flex-col transition-[padding] duration-200',
          oculto ? 'lg:pl-0' : collapsed ? 'lg:pl-[72px]' : 'lg:pl-56',
        )}
      >
        <main className="flex-1 p-4 sm:p-6">
          <CabeceraGlobalContext.Provider value={cabecera}>
            {/*
              Una vista sin cabecera propia (Inicio, una en construcción) no
              puede quedarse sin campana ni sin salir: se pintan aquí arriba,
              sueltas sobre el fondo, sin volver a la barra de antes.
            */}
            {cabeceras === 0 && (
              <div className="mb-4 flex items-center gap-2">
                {cabecera.izquierda}
                <div className="flex-1" />
                {cabecera.derecha}
              </div>
            )}
            {children}
          </CabeceraGlobalContext.Provider>
        </main>
      </div>

      {/*
        Ancla para los modales: Modal se pinta con createPortal (ver su
        comentario) para no heredar el space-y de ListPage, pero si el
        destino fuera document.body quedaria fuera de este data-sys y
        saldria siempre en azul, sin importar el modulo abierto. Aqui
        adentro hereda el color correcto sin que Modal necesite saber cual
        es.
      */}
      <div id="modal-root" />
    </div>
  )
}
