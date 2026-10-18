import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import { MAX_OBSERVACIONES } from '../entities/Limpieza'
import type { LimpiezaTerminada, PersonaLimpieza, TareaLimpieza } from '../entities/Limpieza'
import type { LimpiezaRepository } from '../repositories/LimpiezaRepository'
import type { UseCase } from './UseCase'

type Res<T> = Promise<Either<Failure, T>>

export class TableroLimpiezaUseCase implements UseCase<void, TareaLimpieza[]> {
  constructor(private readonly repo: LimpiezaRepository) {}
  execute(): Res<TareaLimpieza[]> {
    return this.repo.tablero()
  }
}

export class HistorialLimpiezaUseCase implements UseCase<void, LimpiezaTerminada[]> {
  constructor(private readonly repo: LimpiezaRepository) {}
  execute(): Res<LimpiezaTerminada[]> {
    return this.repo.historial()
  }
}

export class PersonalLimpiezaUseCase implements UseCase<void, PersonaLimpieza[]> {
  constructor(private readonly repo: LimpiezaRepository) {}
  execute(): Res<PersonaLimpieza[]> {
    return this.repo.personal()
  }
}

export interface AsignarLimpiezaInput {
  habitacionId: number
  /** null quita al responsable. */
  usuarioId: number | null
}

export class AsignarLimpiezaUseCase implements UseCase<AsignarLimpiezaInput, void> {
  constructor(private readonly repo: LimpiezaRepository) {}
  async execute({ habitacionId, usuarioId }: AsignarLimpiezaInput): Res<void> {
    if (usuarioId !== null && (!Number.isInteger(usuarioId) || usuarioId <= 0)) {
      return left(new ValidationFailure('Elige a quién asignarla.'))
    }
    return this.repo.asignar(habitacionId, usuarioId)
  }
}

export class IniciarLimpiezaUseCase implements UseCase<number, void> {
  constructor(private readonly repo: LimpiezaRepository) {}
  execute(habitacionId: number): Res<void> {
    return this.repo.iniciar(habitacionId)
  }
}

export interface TerminarLimpiezaInput {
  habitacionId: number
  observaciones: string
}

export class TerminarLimpiezaUseCase implements UseCase<TerminarLimpiezaInput, void> {
  constructor(private readonly repo: LimpiezaRepository) {}
  async execute({ habitacionId, observaciones }: TerminarLimpiezaInput): Res<void> {
    const texto = observaciones.trim()
    if ([...texto].length > MAX_OBSERVACIONES) {
      return left(new ValidationFailure(`Las observaciones no pueden pasar de ${MAX_OBSERVACIONES} caracteres.`))
    }
    return this.repo.terminar(habitacionId, texto)
  }
}
