import { ACCION } from '@/domain/entities/Permiso'
import type { Accion, SubmoduloCatalogo } from '@/domain/entities/Permiso'

export interface SubmoduloCatalogoDto {
  submodulo: string
  modulo: string
  acciones: string[]
}

const ACCIONES_CONOCIDAS: ReadonlySet<string> = new Set(Object.values(ACCION))

/**
 * El catálogo, ya con el tipo del dominio.
 *
 * Una acción que este frontend no conoce se descarta: no sabría qué pintar ni
 * qué botón gobierna. Mejor que falte una casilla en la matriz a que el tipo
 * `Accion` mienta.
 */
export function catalogoFromDto(dtos: SubmoduloCatalogoDto[] | null): SubmoduloCatalogo[] {
  return (dtos ?? []).map((dto) => ({
    submodulo: dto.submodulo,
    modulo: dto.modulo,
    acciones: dto.acciones.filter((a): a is Accion => ACCIONES_CONOCIDAS.has(a)),
  }))
}
