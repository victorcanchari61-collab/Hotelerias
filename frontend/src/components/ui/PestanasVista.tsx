import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { PestanasContext } from './contextoPestanas'

export interface PestanasVistaProps {
  /** Las pestañas (normalmente un <Tabs>). */
  pestanas: ReactNode
  children: ReactNode
}

/**
 * Las pestañas de una vista van DEBAJO del título y la descripción, no encima:
 * así la fila de arriba es siempre la misma en todas las vistas (título,
 * botones, cuenta y campana).
 *
 * La vista envuelve su contenido con esto y las pinta la PageHeader que haya
 * adentro, aunque esté varios componentes más abajo: en Cajas, Bancos o Flota
 * cada pestaña trae su propia cabecera y no hace falta pasarles nada.
 *
 * Si ninguna cabecera las toma (una pestaña sin PageHeader), se pintan aquí
 * arriba como antes, para que nunca se pierdan.
 */
export function PestanasVista({ pestanas, children }: PestanasVistaProps) {
  const [tomadas, setTomadas] = useState(0)

  const registrar = useCallback(() => {
    setTomadas((n) => n + 1)
    return () => setTomadas((n) => n - 1)
  }, [])

  const contexto = useMemo(() => ({ pestanas, registrar }), [pestanas, registrar])

  return (
    <PestanasContext.Provider value={contexto}>
      {tomadas === 0 && pestanas ? <div className="mb-5">{pestanas}</div> : null}
      {children}
    </PestanasContext.Provider>
  )
}
