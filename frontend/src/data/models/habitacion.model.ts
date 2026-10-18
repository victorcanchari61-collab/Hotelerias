import type {
  EstadoHabitacion,
  HabitacionFisica,
  OpcionesHabitacion,
} from '@/domain/entities/Inventario'

/** Cómo viaja una habitación por el cable (contrato del backend). */
export interface HabitacionDto {
  id: number
  sedeId: number
  sedeNombre: string
  tipoHabitacionId: number
  tipoNombre: string
  numero: string
  piso: number
  estado: EstadoHabitacion
  notas?: string
  activa: boolean
  actualizadoEn?: string
}

export interface OpcionesDto {
  sedes: OpcionesHabitacion['sedes'] | null
  tipos: OpcionesHabitacion['tipos'] | null
}

export function habitacionFromDto(dto: HabitacionDto): HabitacionFisica {
  const cuando = dto.actualizadoEn ? new Date(dto.actualizadoEn) : null
  return {
    id: dto.id,
    sedeId: dto.sedeId,
    sedeNombre: dto.sedeNombre,
    tipoHabitacionId: dto.tipoHabitacionId,
    tipoNombre: dto.tipoNombre,
    numero: dto.numero,
    piso: dto.piso,
    estado: dto.estado,
    notas: dto.notas ?? '',
    activa: dto.activa,
    actualizadoEn: cuando && !Number.isNaN(cuando.getTime()) ? cuando : null,
  }
}

export function opcionesFromDto(dto: OpcionesDto): OpcionesHabitacion {
  return { sedes: dto.sedes ?? [], tipos: dto.tipos ?? [] }
}
