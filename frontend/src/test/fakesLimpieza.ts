/** Doble del tablero de limpieza. Implementa la MISMA interfaz que el real. */
import { NotFoundFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type { LimpiezaTerminada, PersonaLimpieza, TareaLimpieza } from '@/domain/entities/Limpieza'
import type { LimpiezaRepository } from '@/domain/repositories/LimpiezaRepository'

export function tareaDe(parcial: Partial<TareaLimpieza> = {}): TareaLimpieza {
  return {
    habitacionId: 1,
    sedeId: 1,
    sedeNombre: 'Velothr Miraflores',
    numero: '101',
    piso: 1,
    tipoNombre: 'Habitación Deluxe',
    suciaDesde: new Date(Date.now() - 2 * 3_600_000),
    estado: 'pendiente',
    asignadaA: null,
    asignadaANombre: '',
    iniciadaEn: null,
    urgente: false,
    ...parcial,
  }
}

export class FakeLimpiezaRepository implements LimpiezaRepository {
  tareas: TareaLimpieza[] = [
    tareaDe({ habitacionId: 1, numero: '101', urgente: true }),
    tareaDe({ habitacionId: 2, numero: '102', estado: 'asignada', asignadaA: 4, asignadaANombre: 'Rosa Camarera' }),
    tareaDe({ habitacionId: 3, numero: '103', estado: 'en_curso', asignadaA: 4, asignadaANombre: 'Rosa Camarera', iniciadaEn: new Date() }),
  ]
  terminadas: LimpiezaTerminada[] = [
    {
      id: 1, sedeNombre: 'Velothr Miraflores', numero: '110', tipoNombre: 'Habitación Deluxe', asignadaANombre: 'Rosa Camarera',
      terminadaPor: 'Rosa Camarera', iniciadaEn: new Date(Date.now() - 40 * 60_000), terminadaEn: new Date(), minutos: 25, observaciones: 'Cambié sábanas',
    },
  ]
  gente: PersonaLimpieza[] = [
    { id: 4, nombre: 'Rosa Camarera' },
    { id: 5, nombre: 'Pedro Limpieza' },
  ]
  /** Lo que responde a la siguiente operación que escribe (null = bien). */
  falla: Failure | null = null

  asignaciones: Array<{ habitacionId: number; usuarioId: number | null }> = []
  iniciadas: number[] = []
  terminadasLlamadas: Array<{ habitacionId: number; observaciones: string }> = []

  async tablero() {
    return right<TareaLimpieza[], Failure>(this.tareas.map((t) => ({ ...t })))
  }

  async historial() {
    return right<LimpiezaTerminada[], Failure>(this.terminadas.map((t) => ({ ...t })))
  }

  async personal() {
    return right<PersonaLimpieza[], Failure>(this.gente.map((p) => ({ ...p })))
  }

  async asignar(habitacionId: number, usuarioId: number | null): Promise<Either<Failure, void>> {
    if (this.falla) return left(this.falla)
    this.asignaciones.push({ habitacionId, usuarioId })
    return right(undefined)
  }

  async iniciar(habitacionId: number): Promise<Either<Failure, void>> {
    if (this.falla) return left(this.falla)
    this.iniciadas.push(habitacionId)
    return right(undefined)
  }

  async terminar(habitacionId: number, observaciones: string): Promise<Either<Failure, void>> {
    if (this.falla) return left(this.falla)
    this.terminadasLlamadas.push({ habitacionId, observaciones })
    const t = this.tareas.find((x) => x.habitacionId === habitacionId)
    if (!t) return left(new NotFoundFailure('La habitación no existe'))
    this.tareas = this.tareas.filter((x) => x.habitacionId !== habitacionId)
    return right(undefined)
  }
}
