import type {
  DocumentoTipo,
  EstanciaRegistrada,
  Ficha,
  FaseMovimiento,
  Movimiento,
} from '@/domain/entities/Recepcion'

/** Cómo viaja lo de recepción por el cable (contrato del backend). */
export interface MovimientoDto {
  fase: FaseMovimiento
  estanciaId: number | null
  reservaId: number
  codigo: string
  huesped: string
  sedeId: number
  sedeNombre: string
  tipoHabitacionId: number
  tipoNombre: string
  habitacionId: number | null
  habitacionNumero?: string
  checkIn: string
  checkOut: string
  huespedes: number
  notas?: string
}

export interface FichaDto {
  documentoTipo: DocumentoTipo
  documentoNumero: string
  nombreCompleto: string
  nacionalidad: string
  domiciliado: boolean
  fechaIngresoPais: string | null
  telefono?: string
}

export interface EstanciaDto {
  id: number
  reservaId: number
  codigo: string
  habitacionNumero: string
  estado: 'en_casa' | 'finalizada'
}

export function movimientoFromDto(dto: MovimientoDto): Movimiento {
  return { ...dto, habitacionNumero: dto.habitacionNumero ?? '', notas: dto.notas ?? '' }
}

export function fichaFromDto(dto: FichaDto): Ficha {
  return { ...dto, telefono: dto.telefono ?? '', fechaIngresoPais: dto.fechaIngresoPais ?? null }
}

export function estanciaFromDto(dto: EstanciaDto): EstanciaRegistrada {
  return {
    id: dto.id,
    reservaId: dto.reservaId,
    codigo: dto.codigo,
    habitacionNumero: dto.habitacionNumero,
    estado: dto.estado,
  }
}
