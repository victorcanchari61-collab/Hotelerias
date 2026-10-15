import { createContext, useContext, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'

/**
 * Las pestañas que una vista le entrega a su cabecera (ver PestanasVista).
 *
 * `registrar` avisa que una cabecera las tomó: si ninguna lo hace, PestanasVista
 * las pinta por su cuenta para que no se pierdan.
 */
export interface ContextoPestanas {
  pestanas: ReactNode
  registrar: () => () => void
}

export const PestanasContext = createContext<ContextoPestanas | null>(null)

/**
 * Lo usa PageHeader: las pestañas de la vista, si las hay, para pintarlas bajo
 * el título y la descripción.
 *
 * Antes de pintar (layout effect) y no después: si no, PestanasVista alcanzaba a
 * mostrarlas arriba un instante y la pantalla saltaba.
 */
export function usePestanasVista(): ReactNode {
  const contexto = useContext(PestanasContext)
  const registrar = contexto?.registrar
  useLayoutEffect(() => registrar?.(), [registrar])
  return contexto?.pestanas
}
