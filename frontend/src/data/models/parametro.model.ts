import type { Parametro, TipoParametro } from '@/domain/entities/Parametro'

/** Cómo viaja un parámetro por el cable (contrato del backend). */
export interface ParametroDto {
  clave: string
  grupo: string
  etiqueta: string
  descripcion?: string
  tipo: TipoParametro
  defecto: string
  min?: number
  max?: number
  unidad?: string
  publico?: boolean
  valor: string
  modificado?: boolean
  actualizadoEn?: string
  actualizadoPor?: string
}

/** Un parámetro sin modificar llega con la fecha cero de Go (año 1): eso es "nunca". */
function fecha(valor: string | undefined): Date | null {
  if (!valor) return null
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? null : d
}

export function parametroFromDto(dto: ParametroDto): Parametro {
  return {
    clave: dto.clave,
    grupo: dto.grupo,
    etiqueta: dto.etiqueta,
    descripcion: dto.descripcion ?? '',
    tipo: dto.tipo,
    defecto: dto.defecto,
    min: dto.min ?? 0,
    max: dto.max ?? 0,
    unidad: dto.unidad ?? '',
    publico: dto.publico ?? false,
    valor: dto.valor,
    modificado: dto.modificado ?? false,
    actualizadoEn: fecha(dto.actualizadoEn),
    actualizadoPor: dto.actualizadoPor ?? '',
  }
}
