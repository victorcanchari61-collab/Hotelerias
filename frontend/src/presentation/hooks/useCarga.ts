import { useCallback, useEffect, useRef, useState } from 'react'
import { describeFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'

export interface Carga<T> {
  datos: T
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
}

/**
 * Carga un dato al montar (y cuando cambian `deps`) y expone su estado.
 *
 * Descarta las respuestas viejas: si la persona cambia de fechas mientras la
 * consulta anterior sigue en vuelo, la última en llegar NO pisa a la más
 * reciente. Sin esto, la pantalla puede quedarse mostrando las habitaciones
 * de unas fechas bajo el rótulo de otras.
 */
export function useCarga<T>(
  cargar: () => Promise<Either<Failure, T>>,
  deps: readonly unknown[],
  inicial: T,
): Carga<T> {
  const [datos, setDatos] = useState<T>(inicial)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const ultima = useRef(0)
  const inicialRef = useRef(inicial)

  const ejecutar = useCallback(async () => {
    const mia = ++ultima.current
    setCargando(true)
    const resultado = await cargar()
    if (mia !== ultima.current) return
    resultado.fold(
      (failure) => {
        setError(describeFailure(failure))
        setDatos(inicialRef.current)
      },
      (valor) => {
        setError(null)
        setDatos(valor)
      },
    )
    setCargando(false)
    // `cargar` se recrea en cada render; lo que decide cuándo volver a pedir es `deps`.
  }, deps)

  useEffect(() => {
    void ejecutar()
  }, [ejecutar])

  return { datos, cargando, error, recargar: ejecutar }
}
