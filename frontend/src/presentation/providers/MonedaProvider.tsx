import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { MONEDA_BASE } from '@/domain/entities/Moneda'
import type { Moneda, MonedasPublicas } from '@/domain/entities/Moneda'
import { convertirPenA } from '@/domain/moneda'
import { useDependencies } from './DependencyProvider'

const CLAVE = 'hotel.moneda'

const BASE: Moneda = { codigo: MONEDA_BASE, nombre: 'Soles', simbolo: 'S/', decimales: 2, base: true, activa: true }

export interface MonedaContext {
  /** La moneda en que el visitante ve los precios. */
  moneda: string
  /** Solo las que se pueden cotizar hoy: la base y las que tienen tipo de cambio vigente. */
  ofrecidas: Moneda[]
  setMoneda: (codigo: string) => void
  /**
   * Un precio de lista (soles) en la moneda elegida. SOLO para mostrar un
   * "desde": lo que se cobra lo calcula el servidor con este mismo redondeo.
   */
  convertir: (penCent: number) => number
}

/** Sin proveedor (pruebas de una pantalla suelta) todo es en soles. */
const SOLO_SOLES: MonedaContext = {
  moneda: MONEDA_BASE,
  ofrecidas: [BASE],
  setMoneda: () => {},
  convertir: (c) => c,
}

const Ctx = createContext<MonedaContext>(SOLO_SOLES)

// El almacenamiento puede faltar o lanzar (ventana privada, datos bloqueados):
// la preferencia es una comodidad, la pantalla funciona sin ella.
function leerPreferencia(): string | null {
  try {
    return window.localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

function guardarPreferencia(codigo: string) {
  try {
    window.localStorage.setItem(CLAVE, codigo)
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}

/**
 * La moneda de la web pública. Pide al servidor qué monedas hay y cuáles tienen
 * tipo de cambio hoy; recuerda la elección del visitante en este navegador.
 */
export function MonedaProvider({ children }: { children: ReactNode }) {
  const { useCases } = useDependencies()
  const [publico, setPublico] = useState<MonedasPublicas | null>(null)
  const [elegida, setElegida] = useState<string>(() => leerPreferencia() ?? MONEDA_BASE)

  useEffect(() => {
    let vigente = true
    void useCases.listarMonedas.execute().then((r) => {
      // Si falla, se queda en soles: es la moneda en que siempre se puede cotizar.
      if (vigente && r.isRight()) setPublico(r.value)
    })
    return () => {
      vigente = false
    }
  }, [useCases])

  const ofrecidas = useMemo(() => {
    if (!publico) return [BASE]
    const lista = publico.monedas.filter((m) => m.activa && (m.base || publico.cambios[m.codigo]))
    return lista.length > 0 ? lista : [BASE]
  }, [publico])

  // Una preferencia guardada de una moneda que hoy no se ofrece vuelve a soles.
  const moneda = ofrecidas.some((m) => m.codigo === elegida) ? elegida : MONEDA_BASE

  const setMoneda = useCallback((codigo: string) => {
    setElegida(codigo)
    guardarPreferencia(codigo)
  }, [])

  const venta = publico?.cambios[moneda]?.ventaMicro ?? 0
  const convertir = useCallback(
    (penCent: number) => (moneda === MONEDA_BASE || venta <= 0 ? penCent : convertirPenA(penCent, venta)),
    [moneda, venta],
  )

  const valor = useMemo(() => ({ moneda, ofrecidas, setMoneda, convertir }), [moneda, ofrecidas, setMoneda, convertir])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useMoneda(): MonedaContext {
  return useContext(Ctx)
}
