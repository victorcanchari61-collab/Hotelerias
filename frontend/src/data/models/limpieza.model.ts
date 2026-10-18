import type {
  EstadoLimpieza,
  LimpiezaTerminada,
  PersonaLimpieza,
  TareaLimpieza,
} from '@/domain/entities/Limpieza'

/** Cómo viaja lo de limpieza por el cable (contrato del backend). */
export interface TareaDto {
  habitacionId: number
  sedeId: number
  sedeNombre: string
  numero: string
  piso: number
  tipoNombre: string
  suciaDesde?: string
  estado: EstadoLimpieza
  asignadaA: number | null
  asignadaANombre?: string
  iniciadaEn: string | null
  urgente: boolean
}

export interface TerminadaDto {
  id: number
  sedeNombre: string
  numero: string
  tipoNombre: string
  asignadaANombre?: string
  terminadaPor?: string
  iniciadaEn: string | null
  terminadaEn?: string
  minutos: number | null
  observaciones?: string
}

function fecha(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

export function tareaFromDto(dto: TareaDto): TareaLimpieza {
  return {
    habitacionId: dto.habitacionId,
    sedeId: dto.sedeId,
    sedeNombre: dto.sedeNombre,
    numero: dto.numero,
    piso: dto.piso,
    tipoNombre: dto.tipoNombre,
    suciaDesde: fecha(dto.suciaDesde),
    estado: dto.estado,
    asignadaA: dto.asignadaA ?? null,
    asignadaANombre: dto.asignadaANombre ?? '',
    iniciadaEn: fecha(dto.iniciadaEn),
    urgente: dto.urgente,
  }
}

export function terminadaFromDto(dto: TerminadaDto): LimpiezaTerminada {
  return {
    id: dto.id,
    sedeNombre: dto.sedeNombre,
    numero: dto.numero,
    tipoNombre: dto.tipoNombre,
    asignadaANombre: dto.asignadaANombre ?? '',
    terminadaPor: dto.terminadaPor ?? '',
    iniciadaEn: fecha(dto.iniciadaEn),
    terminadaEn: fecha(dto.terminadaEn),
    minutos: dto.minutos ?? null,
    observaciones: dto.observaciones ?? '',
  }
}

export const personaFromDto = (dto: PersonaLimpieza): PersonaLimpieza => ({ id: dto.id, nombre: dto.nombre })
