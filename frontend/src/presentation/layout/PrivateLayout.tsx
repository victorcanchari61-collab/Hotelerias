import { Suspense, useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Globe, Hotel, Home, UserRound } from 'lucide-react'
import { AppShell, NotificationsBell, UserMenu } from '@/shared/layout'
import type { NavGroup } from '@/shared/layout'
import { nombreCompleto } from '@/domain/entities/Usuario'
import { PantallaCargando } from '../pages/PantallaCargando'
import { useAuth } from '../providers/AuthProvider'
import { usePermisos } from '../providers/PermisosProvider'
import { PATHS } from '../routes/paths'
import { NAV_GROUPS, navIdFromPath, navPath, puedeAbrir, resolveNav } from './navigation'

interface Props {
  /** Ids del menú cuya pantalla todavía no existe: se marcan con un punto tenue. */
  pendientes: ReadonlySet<string>
}

/**
 * El marco de las pantallas con sesión: menú lateral, menú de usuario y
 * campana, con el kit de Ecommerce (`shared/layout`).
 *
 * Es el adaptador entre dos mundos que no se conocen: el kit de UI (que solo
 * sabe pintar grupos, ítems y callbacks) y la app (sesión, permisos, router).
 * El kit no sabe de React Router ni de casos de uso, y NO filtra por permisos:
 * recibe los grupos ya filtrados. Este archivo es el único que los junta.
 */
export function PrivateLayout({ pendientes }: Props) {
  const { usuario, logout } = useAuth()
  const { puedeVer, cargando } = usePermisos()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  /*
   * El menú solo muestra lo que esta persona puede abrir, y un grupo entero
   * desaparece si no le queda nada: un módulo que al desplegarse aparece
   * vacío no informa de nada, solo hace ver el sistema roto.
   *
   * Mientras los permisos cargan no se pinta nada en vez de pintarlo todo: si
   * no, el menú completo parpadearía un instante para quien no lo tiene.
   */
  const groups = useMemo<NavGroup[]>(() => {
    if (cargando) return []
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items
        .filter((i) => puedeAbrir(i.id, puedeVer))
        .map((i) => ({ ...i, pending: i.pending || pendientes.has(i.id) })),
    })).filter((g) => g.items.length > 0)
  }, [cargando, puedeVer, pendientes])

  if (!usuario) return null // el AccessGate de arriba ya mandó al login

  const activeId = navIdFromPath(pathname)
  const { group } = resolveNav(activeId)

  return (
    <AppShell
      // Un solo color: el tema no cambia por módulo, así que el sys es fijo.
      sys="brand"
      brand={{
        icon: group?.icon ?? Hotel,
        name: 'Hotel Velothr',
        subtitle: group?.label ?? 'Panel administrativo',
      }}
      groups={groups}
      active={activeId}
      onSelect={(id) => navigate(id === '' ? PATHS.admin : navPath(id))}
      topbarRight={
        <>
          <UserMenu
            name={nombreCompleto(usuario)}
            email={usuario.email}
            links={[
              { label: 'Inicio', icon: Home, onSelect: () => navigate(PATHS.admin) },
              { label: 'Ver sitio web', icon: Globe, onSelect: () => navigate(PATHS.portal) },
            ]}
            footerLinks={[{ label: 'Mi perfil', icon: UserRound, onSelect: () => navigate(PATHS.perfil) }]}
            onLogout={() => void logout()}
          />
          {/* Sin alertas todavía: el backend no las expone. Se pasan cuando existan. */}
          <NotificationsBell />
        </>
      }
    >
      {/* key = ruta: cada vista entra con una animación corta (ui-fade-up) */}
      <div key={pathname} className="ui-fade-up">
        <Suspense fallback={<PantallaCargando />}>
          <Outlet />
        </Suspense>
      </div>
    </AppShell>
  )
}
