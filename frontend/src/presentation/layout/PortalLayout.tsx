import { Suspense } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { cn } from '@/shared/ui'
import { nombreCompletoCliente } from '@/domain/entities/Cliente'
import { PantallaCargando } from '../pages/PantallaCargando'
import { useClienteAuth } from '../providers/ClienteAuthProvider'
import { MonedaProvider, useMoneda } from '../providers/MonedaProvider'
import { PATHS } from '../routes/paths'

const enlace = ({ isActive }: { isActive: boolean }) =>
  cn(
    'v-etq relative shrink-0 px-3 py-2 text-[0.95rem] transition-colors',
    isActive
      ? 'text-[var(--v-hilo)] after:absolute after:inset-x-3 after:-bottom-px after:border-b-2 after:border-dashed after:border-[var(--v-hilo)]'
      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
  )

/** La placa de latón del baúl, con sus dos remaches. */
function Placa() {
  return (
    <span
      className="v-etq relative inline-flex items-center px-5 py-1.5 text-lg text-[#2a1a0c]"
      style={{
        background: 'linear-gradient(180deg, #e3c08a, #b98f57)',
        borderRadius: 3,
        boxShadow: '0 2px 4px rgb(0 0 0 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.35)',
      }}
    >
      <i aria-hidden="true" className="absolute top-1/2 left-1.5 size-1 -translate-y-1/2 rounded-full bg-[#5a3d1c]" />
      Velothr
      <i aria-hidden="true" className="absolute top-1/2 right-1.5 size-1 -translate-y-1/2 rounded-full bg-[#5a3d1c]" />
    </span>
  )
}

/** Soles / dólares. Solo aparece si hay más de una moneda que se pueda cotizar hoy. */
function SelectorMoneda() {
  const { moneda, ofrecidas, setMoneda } = useMoneda()
  if (ofrecidas.length < 2) return null
  return (
    <div role="group" aria-label="Moneda" className="flex items-center gap-1">
      {ofrecidas.map((m) => (
        <button
          key={m.codigo}
          type="button"
          aria-pressed={m.codigo === moneda}
          title={m.nombre}
          onClick={() => setMoneda(m.codigo)}
          className={cn(
            'v-etq min-w-9 rounded-[3px] border px-2 py-1 text-sm transition-colors',
            m.codigo === moneda
              ? 'border-[var(--v-hilo)] bg-[var(--v-hilo)] text-[#1a110d]'
              : 'border-[var(--v-hilo-suave)] text-[var(--color-ink-muted)] hover:border-[var(--v-hilo)] hover:text-[var(--color-ink)]',
          )}
        >
          {m.simbolo}
        </button>
      ))}
    </div>
  )
}

/**
 * El marco de la web pública: la cabecera del baúl y el pie.
 *
 * No exige sesión: cualquiera mira hoteles y precios. Reservar es lo que la
 * exige (lo decide la ruta, no este marco).
 */
export function PortalLayout() {
  return (
    <MonedaProvider>
      <MarcoPortal />
    </MonedaProvider>
  )
}

const BOTON_CLARO =
  'v-etq inline-flex h-9 items-center rounded-[3px] border border-[var(--v-hilo)] px-3.5 text-[0.95rem] text-[var(--v-hilo)] transition-colors hover:bg-[var(--v-hilo)] hover:text-[#1a110d]'
const BOTON_LLENO =
  'v-etq inline-flex h-9 items-center rounded-[3px] bg-[var(--v-hilo)] px-3.5 text-[0.95rem] text-[#1a110d] transition-colors hover:bg-[#dcb47c]'

function MarcoPortal() {
  const { status, cliente, logout } = useClienteAuth()
  const navigate = useNavigate()
  const conSesion = status === 'authenticated' && cliente !== null

  return (
    <div className="velothr flex min-h-screen flex-col">
      <header className="z-30 border-b-2 border-dashed border-[var(--v-hilo-suave)] bg-[var(--v-cuero)] sm:sticky sm:top-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <Link to={PATHS.portal} className="shrink-0" aria-label="Hotel Velothr, inicio">
            <Placa />
          </Link>

          <nav aria-label="Principal" className="order-3 -mx-4 flex w-[calc(100%+2rem)] overflow-x-auto px-4 py-1 sm:order-none sm:mx-0 sm:w-auto sm:px-0 [scrollbar-width:none]">
            <NavLink to={PATHS.portal} end className={enlace}>
              Hoteles
            </NavLink>
            <NavLink to={PATHS.experiencias} className={enlace}>
              Experiencias
            </NavLink>
            <NavLink to={PATHS.ofertas} className={enlace}>
              Ofertas
            </NavLink>
            <NavLink to={PATHS.historias} className={enlace}>
              Historias
            </NavLink>
            <NavLink to={PATHS.membresias} className={enlace}>
              Membresías
            </NavLink>
            {conSesion && (
              <NavLink to={PATHS.misReservas} className={enlace}>
                Mis reservas
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <SelectorMoneda />
            {conSesion ? (
              <>
                <span className="hidden text-sm md:block">
                  <span className="font-semibold">{nombreCompletoCliente(cliente)}</span>
                  {cliente.tipoCliente && (
                    <span className="v-etq ml-2 rounded-[3px] border border-[var(--v-hilo-suave)] px-1.5 py-0.5 text-xs text-[var(--v-hilo)]">
                      {cliente.tipoCliente}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className={cn(BOTON_CLARO, 'gap-1.5')}
                  onClick={() => {
                    // Primero a la portada y después se cierra: al revés, la pantalla
                    // protegida en la que estaba la mandaría a /ingresar.
                    navigate(PATHS.portal)
                    void logout()
                  }}
                >
                  Salir <LogOut size={14} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <Link to={PATHS.ingresar} className={BOTON_CLARO}>
                  Ingresar
                </Link>
                <Link to={PATHS.registro} className={cn(BOTON_LLENO, 'hidden sm:inline-flex')}>
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

      <footer className="mt-16 border-t-2 border-dashed border-[var(--v-hilo-suave)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <Placa />
            <p className="v-nota mt-4 max-w-xs text-[var(--color-ink-muted)]">Una sola casa, cuatro destinos del Perú.</p>
          </div>
          <nav aria-label="Más información" className="flex flex-col gap-2 text-sm">
            <Link to={PATHS.nosotros} className="hover:text-[var(--v-hilo)]">
              Nosotros
            </Link>
            <Link to={PATHS.historias} className="hover:text-[var(--v-hilo)]">
              Historias
            </Link>
            <Link to={PATHS.contacto} className="hover:text-[var(--v-hilo)]">
              Contacto
            </Link>
            <Link to={PATHS.membresias} className="hover:text-[var(--v-hilo)]">
              Membresías
            </Link>
          </nav>
          <div className="flex flex-col gap-2 text-sm text-[var(--color-ink-muted)]">
            <p>Demostración: los datos, los precios y las imágenes son de muestra.</p>
            <Link to={PATHS.adminLogin} className="w-fit text-[var(--v-hilo)] hover:underline">
              Acceso del personal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
