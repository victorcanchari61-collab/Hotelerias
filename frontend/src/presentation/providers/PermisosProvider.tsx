import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRealtime } from '@/lib/realtime'
import { PermisoSet } from '@/domain/entities/Permiso'
import type { Accion } from '@/domain/entities/Permiso'
import { useAuth } from './AuthProvider'
import { useDependencies } from './DependencyProvider'

interface PermisosContextValue {
  permisos: PermisoSet
  /** Mientras no se sabe qué puede la persona. No es lo mismo que "nada". */
  cargando: boolean
  /** Vuelve a preguntar al backend: tras aprobarle un permiso a alguien. */
  refrescar: () => Promise<void>
}

const PermisosContext = createContext<PermisosContextValue | null>(null)

/**
 * Trae del backend lo que este usuario puede hacer.
 *
 * No sale del token a propósito: si viviera ahí, conceder un permiso
 * obligaría a la persona a volver a entrar — justo lo contrario de lo que
 * hace falta cuando un admin lo aprueba en el momento.
 */
export function PermisosProvider({ children }: { children: ReactNode }) {
  const { useCases } = useDependencies()
  const { status } = useAuth()
  const [permisos, setPermisos] = useState<PermisoSet>(PermisoSet.vacio())
  const [cargando, setCargando] = useState(true)

  const refrescar = useCallback(async () => {
    const resultado = await useCases.getMisPermisos.execute()
    resultado.fold(
      // Sin respuesta se CONSERVA lo que había: dejar al menú vacío por un
      // corte momentáneo es peor que mostrar lo último que se supo.
      () => undefined,
      (nuevos) => setPermisos(nuevos),
    )
    setCargando(false)
  }, [useCases])

  useEffect(() => {
    if (status === 'authenticated') {
      // De nuevo "no sé qué puede": si se venía de sin-sesión, cargando estaba
      // en false y por un instante se vería "acceso denegado" a todo.
      setCargando(true)
      void refrescar()
    } else if (status === 'unauthenticated') {
      // Sin sesión no hay permisos: tampoco deben sobrevivir a un cierre de
      // sesión para quien entre después en el mismo navegador.
      setPermisos(PermisoSet.vacio())
      setCargando(false)
    }
  }, [status, refrescar])

  const value = useMemo(() => ({ permisos, cargando, refrescar }), [permisos, cargando, refrescar])

  return (
    <PermisosContext.Provider value={value}>
      {status === 'authenticated' && <EscuchaCambios onCambio={refrescar} />}
      {children}
    </PermisosContext.Provider>
  )
}

/**
 * Un admin aprueba desde su PC y la persona que esperaba lo tiene al momento,
 * sin volver a entrar. Refresca cualquier cambio de permisos, no solo el
 * propio: el aviso no dice a quién le toca, y una consulta de más es más
 * barata que enterarse tarde.
 *
 * Es un componente aparte para que la conexión en tiempo real solo exista con
 * sesión: abrirla sin token solo produciría rechazos.
 */
function EscuchaCambios({ onCambio }: { onCambio: () => Promise<void> }) {
  useRealtime('permisos', () => void onCambio())
  return null
}

/**
 * `puede('fact.notaventa', 'anular')` para esconder lo que no se permite.
 *
 * Esconder es comodidad, no seguridad: el guard del backend rechaza igual a
 * quien llame al endpoint directo.
 */
export function usePermisos() {
  const ctx = useContext(PermisosContext)
  if (!ctx) throw new Error('usePermisos debe usarse dentro de <PermisosProvider>.')

  const { permisos, cargando, refrescar } = ctx

  return useMemo(
    () => ({
      permisos,
      cargando,
      refrescar,
      puede: (submodulo: string, accion: Accion) => permisos.puede(submodulo, accion),
      /** Si la pantalla se puede abrir siquiera. */
      puedeVer: (submodulo: string) => permisos.puedeVer(submodulo),
    }),
    [permisos, cargando, refrescar],
  )
}
