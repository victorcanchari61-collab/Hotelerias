import { createContext, useContext, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'

/**
 * Lo que va en la cabecera de TODAS las vistas, sin barra superior: la cuenta
 * del usuario y la campana a la derecha del título, y el botón del menú a la
 * izquierda en el celular.
 *
 * Lo arma el layout (que sabe quién entró y cómo está el menú) y lo pinta cada
 * PageHeader en su fila de título. Así el título, los botones de la vista y la
 * cuenta comparten una sola fila, como en el diseño de referencia.
 */
export interface CabeceraGlobal {
  /** A la izquierda del título: abrir el menú en el celular, o traerlo de vuelta si se ocultó. */
  izquierda?: ReactNode
  /** A la derecha de todo: la campana y la cuenta. */
  derecha?: ReactNode
  /**
   * La cabecera avisa que está en pantalla. Si ninguna lo hace (Inicio, una
   * vista en construcción), el layout pinta la cuenta por su cuenta para que no
   * se pierda la campana ni el salir.
   */
  registrar?: () => () => void
}

export const CabeceraGlobalContext = createContext<CabeceraGlobal>({})

/**
 * Lo usa PageHeader: toma los extremos de la cabecera y avisa que está.
 *
 * Antes de pintar (layout effect) y no después: si no, el layout alcanzaba a
 * mostrar su fila de reserva un instante y la pantalla saltaba.
 */
export function useCabeceraGlobal(): CabeceraGlobal {
  const cabecera = useContext(CabeceraGlobalContext)
  const { registrar } = cabecera
  useLayoutEffect(() => registrar?.(), [registrar])
  return cabecera
}
