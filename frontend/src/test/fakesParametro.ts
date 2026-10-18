/** Doble de los parámetros del sistema. Implementa la MISMA interfaz que el real. */
import { right } from '@/core/utils/either'
import type { Failure } from '@/core/errors/failures'
import type { Parametro } from '@/domain/entities/Parametro'
import type { ParametroRepository } from '@/domain/repositories/ParametroRepository'

export function parametroDe(parcial: Partial<Parametro> = {}): Parametro {
  return {
    clave: 'reservas.max_noches',
    grupo: 'Reservas',
    etiqueta: 'Máximo de noches por reserva',
    descripcion: 'Largo máximo de una estadía reservada por la web.',
    tipo: 'entero',
    defecto: '30',
    min: 1,
    max: 365,
    unidad: 'noches',
    publico: false,
    valor: '30',
    modificado: false,
    actualizadoEn: null,
    actualizadoPor: '',
    ...parcial,
  }
}

export const PARAMETROS_BASE = (): Parametro[] => [
  parametroDe(),
  parametroDe({
    clave: 'reservas.cancelacion_dias', etiqueta: 'Cancelación por la web', descripcion: 'Días de anticipación.',
    defecto: '1', valor: '1', min: 0, max: 30, unidad: 'días antes',
  }),
  parametroDe({
    clave: 'hotel.checkin_hora', grupo: 'Horarios', etiqueta: 'Hora de check-in', descripcion: 'Desde cuándo se ingresa.',
    tipo: 'hora', defecto: '14:00', valor: '14:00', min: 0, max: 0, unidad: '', publico: true,
  }),
]

export class FakeParametroRepository implements ParametroRepository {
  lista: Parametro[] = PARAMETROS_BASE()
  /** Cada llamada a guardar, tal como llegó. */
  guardados: Array<Record<string, string>> = []

  async listar() {
    return right<Parametro[], Failure>(this.lista.map((p) => ({ ...p })))
  }

  async guardar(valores: Record<string, string>) {
    this.guardados.push(valores)
    this.lista = this.lista.map((p) =>
      p.clave in valores
        ? { ...p, valor: valores[p.clave], modificado: valores[p.clave] !== p.defecto, actualizadoPor: 'Ana Admin', actualizadoEn: new Date() }
        : p,
    )
    return right<Parametro[], Failure>(this.lista.map((p) => ({ ...p })))
  }
}
