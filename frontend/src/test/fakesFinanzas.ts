/** Dobles de Finanzas. Implementan la MISMA interfaz que los reales. */
import { right } from '@/core/utils/either'
import type { Failure } from '@/core/errors/failures'
import type { Moneda, TipoCambio, TipoCambioInput, TiposCambio } from '@/domain/entities/Moneda'
import type { TipoCambioRepository } from '@/domain/repositories/FinanzasRepository'
import { textoATasa } from '@/domain/moneda'

export const SOLES: Moneda = { codigo: 'PEN', nombre: 'Soles', simbolo: 'S/', decimales: 2, base: true, activa: true }
export const DOLARES: Moneda = { codigo: 'USD', nombre: 'Dólares', simbolo: 'US$', decimales: 2, base: false, activa: true }

export function tipoCambioDe(parcial: Partial<TipoCambio> = {}): TipoCambio {
  return {
    id: 1,
    fecha: '2026-11-01',
    moneda: 'USD',
    compraMicro: 3_745_000,
    ventaMicro: 3_752_000,
    fuente: 'manual',
    registradoPor: 'Ana Finanzas',
    actualizadoEn: null,
    ...parcial,
  }
}

export class FakeTipoCambioRepository implements TipoCambioRepository {
  historial: TipoCambio[] = [tipoCambioDe()]
  guardados: TipoCambioInput[] = []

  async listar() {
    const datos: TiposCambio = { monedas: [SOLES, DOLARES], historial: [...this.historial] }
    return right<TiposCambio, Failure>(datos)
  }

  async guardar(input: TipoCambioInput) {
    this.guardados.push(input)
    const nuevo = tipoCambioDe({
      id: this.historial.length + 1,
      fecha: input.fecha,
      moneda: input.moneda,
      compraMicro: textoATasa(input.compra) ?? 0,
      ventaMicro: textoATasa(input.venta) ?? 0,
    })
    this.historial = [nuevo, ...this.historial.filter((t) => !(t.fecha === nuevo.fecha && t.moneda === nuevo.moneda))]
    return right<TipoCambio, Failure>(nuevo)
  }
}
