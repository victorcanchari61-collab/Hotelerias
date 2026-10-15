/**
 * Qué presentaciones de un producto se pueden elegir según para qué se usa.
 *
 * Cada presentación dice si "se compra" y si "se vende" — la unidad base también: hay productos
 * que solo salen por caja y no por unidad suelta. Antes los selectores ofrecían siempre la unidad
 * base, así que se podía armar un pedido por unidades de algo que no se vende así.
 *
 * La unidad base se representa con el valor 0 en los selectores (no tiene una presentación
 * propia en la línea del documento); las demás con su id.
 */

/** Para qué se elige la presentación. Sin uso (ajustes, transferencias...) valen todas las activas. */
export type UsoPresentacion = 'venta' | 'compra'

export interface PresentacionUsable {
  id: number
  nombre: string
  factor: number
  esBase: boolean
  activo: boolean
  esCompra?: boolean
  esVenta?: boolean
}

export interface ProductoUsable {
  unidadBase: string
  presentaciones: PresentacionUsable[]
}

export interface OpcionPresentacion {
  value: number
  label: string
  /** A cuántas unidades base equivale (la base es 1): con esto se convierte un stock a esa unidad. */
  factor: number
  nota?: string
  detalle?: string
}

/** Si esa presentación sirve para ese uso. Un dato que no viene (undefined) no la excluye. */
function habilitada(p: PresentacionUsable, uso?: UsoPresentacion): boolean {
  if (!p.activo) return false
  if (uso === 'venta') return p.esVenta !== false
  if (uso === 'compra') return p.esCompra !== false
  return true
}

/**
 * Si la unidad base se puede elegir. Es la presentación de factor 1; si el producto no la trae
 * en su lista, no hay nada que la apague y se ofrece, como siempre.
 */
export function baseHabilitada(producto: ProductoUsable, uso?: UsoPresentacion): boolean {
  const bases = producto.presentaciones.filter((p) => p.esBase)
  return bases.length === 0 || bases.some((p) => habilitada(p, uso))
}

/** Las opciones de un selector de unidad, con la base primero si corresponde. */
export function opcionesPresentacion(
  producto: ProductoUsable,
  uso?: UsoPresentacion,
  /**
   * La que ya tiene una línea guardada. Si el producto dejó de venderse así después, se sigue
   * mostrando (marcada) en vez de quedar el selector en blanco: quien edita ve qué pasó y la cambia.
   */
  actual?: number,
): OpcionPresentacion[] {
  const opciones: OpcionPresentacion[] = []

  if (baseHabilitada(producto, uso)) {
    opciones.push({ value: 0, label: producto.unidadBase, factor: 1, nota: 'unidad base' })
  }

  for (const p of producto.presentaciones) {
    if (p.esBase || !habilitada(p, uso)) continue
    opciones.push({ value: p.id, label: p.nombre, factor: p.factor, detalle: `${p.factor} ${producto.unidadBase}` })
  }

  if (actual !== undefined && !opciones.some((o) => o.value === actual)) {
    const guardada = producto.presentaciones.find((p) => p.id === actual)
    opciones.push({
      value: actual,
      label: guardada?.nombre ?? producto.unidadBase,
      factor: guardada?.factor ?? 1,
      nota: uso === 'compra' ? 'ya no se compra así' : uso === 'venta' ? 'ya no se vende así' : 'no disponible',
    })
  }

  return opciones
}

/**
 * La unidad con la que arranca una línea nueva: la MÁS GRANDE que se puede usar (el saco de 50 kg
 * antes que la bolsa o el kilo). En un mayorista casi todo sale por saco o caja, y de todos modos
 * se puede cambiar; arrancar por la unidad suelta obligaba a cambiarla en cada línea.
 * Null cuando el producto no se puede usar en ninguna presentación para ese uso.
 */
export function presentacionInicial(producto: ProductoUsable, uso?: UsoPresentacion): number | null {
  const opciones = opcionesPresentacion(producto, uso)
  if (opciones.length === 0) return null

  // A igualdad de tamaño gana la primera (la base va antes que las presentaciones).
  return opciones.reduce((mayor, o) => (o.factor > mayor.factor ? o : mayor)).value
}

/** Igual que `presentacionInicial`, para cuando se cambia el producto de una fila y solo se tiene su id. */
export function presentacionInicialDe(
  productos: (ProductoUsable & { id: number })[],
  productoId: number,
  uso?: UsoPresentacion,
): number {
  const producto = productos.find((p) => p.id === productoId)
  return producto ? (presentacionInicial(producto, uso) ?? 0) : 0
}
