import { ACCION, clavePermiso } from '@/domain/entities/Permiso'
import type { Accion, SubmoduloCatalogo } from '@/domain/entities/Permiso'
import { NAV_GROUPS, resolveNav } from '../../layout/navigation'

/** El orden en que se muestran las columnas de la matriz. */
export const ORDEN_ACCIONES: readonly Accion[] = [
  ACCION.ver,
  ACCION.crear,
  ACCION.editar,
  ACCION.anular,
  ACCION.eliminar,
  ACCION.confirmar,
  ACCION.cobrar,
  ACCION.exportar,
  ACCION.importar,
]

export const ETIQUETA_ACCION: Record<Accion, string> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  anular: 'Anular',
  eliminar: 'Eliminar',
  exportar: 'Exportar',
  importar: 'Importar',
  confirmar: 'Confirmar',
  cobrar: 'Cobrar',
}

/** El nombre que ve la persona para un submódulo ("reservas.paquetes" → "Paquetes y promociones"). */
export function etiquetaSubmodulo(submodulo: string): string {
  return resolveNav(submodulo).item?.label ?? submodulo
}

export function etiquetaModulo(modulo: string): string {
  return NAV_GROUPS.find((g) => g.id === modulo)?.label ?? modulo
}

export interface GrupoMatriz {
  modulo: string
  etiqueta: string
  filas: SubmoduloCatalogo[]
}

/** El catálogo agrupado por módulo, en el orden del menú. */
export function agruparCatalogo(catalogo: readonly SubmoduloCatalogo[]): GrupoMatriz[] {
  const orden = new Map(NAV_GROUPS.map((g, i) => [g.id, i]))
  const porModulo = new Map<string, SubmoduloCatalogo[]>()
  for (const s of catalogo) {
    const lista = porModulo.get(s.modulo) ?? []
    lista.push(s)
    porModulo.set(s.modulo, lista)
  }
  return [...porModulo.entries()]
    .sort(([a], [b]) => (orden.get(a) ?? 999) - (orden.get(b) ?? 999))
    .map(([modulo, filas]) => ({ modulo, etiqueta: etiquetaModulo(modulo), filas }))
}

/** Las columnas que existen en el catálogo, en el orden de la matriz. */
export function columnasDe(catalogo: readonly SubmoduloCatalogo[]): Accion[] {
  const presentes = new Set<Accion>()
  for (const s of catalogo) s.acciones.forEach((a) => presentes.add(a))
  return ORDEN_ACCIONES.filter((a) => presentes.has(a))
}

/**
 * Marca o desmarca una casilla, con las dos reglas que también aplica el
 * servidor (para que la pantalla muestre lo que de verdad se va a guardar):
 *
 *  - Cualquier acción implica poder VER: marcarla marca también "ver".
 *  - Quitar "ver" quita todo lo demás de ese submódulo: sin ver, la pantalla
 *    no abre y el resto quedaría concedido pero inalcanzable.
 */
export function alternarPermiso(
  actual: ReadonlySet<string>,
  fila: SubmoduloCatalogo,
  accion: Accion,
  marcado: boolean,
): Set<string> {
  const next = new Set(actual)
  const clave = clavePermiso(fila.submodulo, accion)
  const ver = clavePermiso(fila.submodulo, ACCION.ver)

  if (marcado) {
    next.add(clave)
    if (fila.acciones.includes(ACCION.ver)) next.add(ver)
    return next
  }

  if (accion === ACCION.ver) {
    for (const a of fila.acciones) next.delete(clavePermiso(fila.submodulo, a))
    return next
  }
  next.delete(clave)
  return next
}

/** Marca o quita TODAS las acciones de un submódulo. */
export function alternarFila(
  actual: ReadonlySet<string>,
  fila: SubmoduloCatalogo,
  marcado: boolean,
): Set<string> {
  const next = new Set(actual)
  for (const a of fila.acciones) {
    const clave = clavePermiso(fila.submodulo, a)
    if (marcado) next.add(clave)
    else next.delete(clave)
  }
  return next
}

/** Si dos conjuntos tienen lo mismo (para saber si hay algo por guardar). */
export function mismosPermisos(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
