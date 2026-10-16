import { Suspense } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Crown, Hotel, LogOut } from 'lucide-react'
import { Badge, Button, buttonClasses, cn } from '@/shared/ui'
import { nombreCompletoCliente } from '@/domain/entities/Cliente'
import { PantallaCargando } from '../pages/PantallaCargando'
import { useClienteAuth } from '../providers/ClienteAuthProvider'
import { PATHS } from '../routes/paths'

const enlace = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-field px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'text-accent-ink' : 'text-ink-muted hover:text-ink',
  )

/**
 * El marco de la web pública: cabecera con la sesión del huésped y pie.
 *
 * No exige sesión: cualquiera mira hoteles y precios. Reservar es lo que la
 * exige (lo decide la ruta, no este marco).
 */
export function PortalLayout() {
  const { status, cliente, logout } = useClienteAuth()
  const navigate = useNavigate()
  const conSesion = status === 'authenticated' && cliente !== null

  return (
    <div data-sys="brand" className="flex min-h-screen flex-col bg-surface-alt text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-4">
          <Link to={PATHS.portal} className="flex items-center gap-2.5 font-bold tracking-tight">
            <span className="sys-gradient inline-flex size-9 items-center justify-center rounded-xl">
              <Hotel size={18} />
            </span>
            <span className="hidden sm:inline">Hotel Velothr</span>
          </Link>

          <nav className="ml-2 flex items-center">
            <NavLink to={PATHS.portal} end className={enlace}>
              Hoteles
            </NavLink>
            <NavLink to={PATHS.ofertas} className={enlace}>
              Ofertas
            </NavLink>
            {conSesion && (
              <NavLink to={PATHS.misReservas} className={enlace}>
                Mis reservas
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {conSesion ? (
              <>
                <span className="hidden items-center gap-2 text-sm md:flex">
                  <span className="font-medium">{nombreCompletoCliente(cliente)}</span>
                  {cliente.tipoCliente && (
                    <Badge tone={cliente.descuentoPct > 0 ? 'accent' : 'neutral'}>
                      {cliente.descuentoPct > 0 && <Crown size={11} className="mr-1" />}
                      {cliente.tipoCliente}
                    </Badge>
                  )}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  iconRight={<LogOut size={14} />}
                  onClick={() => {
                    // Primero a la portada y después se cierra: al revés, la pantalla
                    // protegida en la que estaba la mandaría a /ingresar.
                    navigate(PATHS.portal)
                    void logout()
                  }}
                >
                  Salir
                </Button>
              </>
            ) : (
              <>
                <Link to={PATHS.ingresar} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                  Ingresar
                </Link>
                <Link
                  to={PATHS.registro}
                  className={buttonClasses({ size: 'sm', className: 'hidden sm:inline-flex' })}
                >
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Suspense fallback={<PantallaCargando />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© Hotel Velothr. Una cadena, cuatro destinos.</p>
          <p className="flex gap-4">
            <span>Demo: los datos y precios son de muestra.</span>
            <Link to={PATHS.adminLogin} className="font-medium text-accent-ink hover:underline">
              Acceso del personal
            </Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
