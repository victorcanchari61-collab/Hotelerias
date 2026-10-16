import { useEffect, useState } from 'react'
import { Desplegable } from './Desplegable'
import type { DesplegableProps } from './Desplegable'
import { opcionesPresentacion } from '../../lib/presentaciones'
import type { ProductoUsable, UsoPresentacion } from '../../lib/presentaciones'
import type { PrecioResuelto } from './AgregarProductoPanel'

type ProductoConId = ProductoUsable

/**
 * Los precios ya pedidos, por un rato.
 *
 * Un pedido de 30 lineas repite el mismo producto y cada selector pediria los precios de todas sus
 * presentaciones: sin esto son cientos de consultas para pintar una lista. Corta vida (30 s) para
 * que cambiar un precio en la lista se note al poco tiempo.
 */
const VIGENCIA_MS = 30_000
const cache = new Map<string, { hasta: number; precio: Promise<number | null> }>()

function precioDe(
  clave: string,
  id: number,
  resolver: (presentacionId: number, cantidad: number) => Promise<PrecioResuelto | null>,
) {
  const k = `${clave}|${id}`
  const guardado = cache.get(k)
  if (guardado && guardado.hasta > Date.now()) return guardado.precio
  const precio = resolver(id, 1)
    .then((p) => p?.precio ?? null)
    .catch(() => null)
  cache.set(k, { hasta: Date.now() + VIGENCIA_MS, precio })
  return precio
}

export interface SelectorPresentacionProps
  extends Pick<DesplegableProps, 'label' | 'disabled' | 'placeholder' | 'className'> {
  producto?: ProductoConId
  uso?: UsoPresentacion
  value: number
  onChange: (presentacionId: number) => void
  /** La que ya tiene una línea guardada aunque el producto dejó de venderse así. */
  actual?: number
  /**
   * De dónde sale el precio de cada unidad: la lista elegida y, si no lo tiene, la referencia del
   * producto. Sin esto el selector muestra cuántas unidades base trae cada una.
   */
  resolverPrecio?: (presentacionId: number, cantidad: number) => Promise<PrecioResuelto | null>
  /** Cambia cuando cambia la lista de precios: obliga a pedir los precios otra vez. */
  claveLista?: string | number
}

/**
 * Selector de la unidad de una línea, con el precio de cada una a la derecha.
 *
 * Al vender, quien elige entre "Bolsa 5 kg" y "Saco 50 kg" quiere saber cuánto cobra por cada una,
 * no a cuántos kilos equivale —eso ya lo dice el nombre—. El precio es el de UNA unidad, sin
 * tramos por volumen. Lo que no tiene precio (ni en la lista ni de referencia) muestra los kilos,
 * como antes.
 */
export function SelectorPresentacion({
  producto,
  uso,
  value,
  onChange,
  actual,
  resolverPrecio,
  claveLista,
  ...resto
}: SelectorPresentacionProps) {
  const [precios, setPrecios] = useState<Record<number, number>>({})

  const opciones = producto ? opcionesPresentacion(producto, uso, actual) : []
  const baseId = producto?.presentaciones.find((p) => p.esBase)?.id ?? 0
  // La unidad base viaja como 0 en la línea, pero el precio se pide por su presentación real.
  const idReal = (valor: number) => (valor === 0 ? baseId : valor)
  const ids = opciones.map((o) => idReal(o.value)).filter((id) => id > 0)
  const clave = ids.join(',')

  useEffect(() => {
    if (!resolverPrecio || ids.length === 0) {
      setPrecios({})
      return
    }
    let vigente = true
    const k = String(claveLista ?? '')
    void Promise.all(ids.map(async (id) => [id, await precioDe(k, id, resolverPrecio)] as const)).then(
      (pares) => {
        if (!vigente) return
        const nuevos: Record<number, number> = {}
        for (const [id, precio] of pares) if (precio != null) nuevos[id] = precio
        setPrecios(nuevos)
      },
    )
    return () => {
      vigente = false
    }
    // El resolver se recrea en cada render del padre: lo que lo hace cambiar de verdad es la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, claveLista, Boolean(resolverPrecio)])

  return (
    <Desplegable
      {...resto}
      value={value}
      onChange={(v) => onChange(Number(v))}
      options={opciones.map((o) => {
        const precio = precios[idReal(o.value)]
        return precio == null ? o : { ...o, detalle: `S/ ${precio.toFixed(2)}` }
      })}
    />
  )
}
