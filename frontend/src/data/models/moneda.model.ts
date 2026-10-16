import type {
  CambioPublico,
  Moneda,
  MonedasPublicas,
  TipoCambio,
  TiposCambio,
} from '@/domain/entities/Moneda'

/** Cómo viaja lo de las monedas por el cable (contrato del backend). */

export interface MonedaDto {
  codigo: string
  nombre: string
  simbolo: string
  decimales: number
  base: boolean
  activa: boolean
}

export interface MonedasPublicasDto {
  monedas: MonedaDto[] | null
  tipoCambio: Record<string, CambioPublico> | null
}

export interface TipoCambioDto {
  id: number
  fecha: string
  moneda: string
  compraMicro: number
  ventaMicro: number
  fuente?: string
  registradoPor?: string
  actualizadoEn?: string
}

export interface TiposCambioDto {
  monedas: MonedaDto[] | null
  historial: TipoCambioDto[] | null
}

export const monedaFromDto = (dto: MonedaDto): Moneda => ({ ...dto })

export function monedasPublicasFromDto(dto: MonedasPublicasDto): MonedasPublicas {
  return {
    monedas: (dto.monedas ?? []).map(monedaFromDto),
    cambios: { ...(dto.tipoCambio ?? {}) },
  }
}

export function tipoCambioFromDto(dto: TipoCambioDto): TipoCambio {
  const cuando = dto.actualizadoEn ? new Date(dto.actualizadoEn) : null
  return {
    id: dto.id,
    fecha: dto.fecha,
    moneda: dto.moneda,
    compraMicro: dto.compraMicro,
    ventaMicro: dto.ventaMicro,
    fuente: dto.fuente ?? 'manual',
    registradoPor: dto.registradoPor ?? '',
    actualizadoEn: cuando && !Number.isNaN(cuando.getTime()) ? cuando : null,
  }
}

export function tiposCambioFromDto(dto: TiposCambioDto): TiposCambio {
  return {
    monedas: (dto.monedas ?? []).map(monedaFromDto),
    historial: (dto.historial ?? []).map(tipoCambioFromDto),
  }
}
