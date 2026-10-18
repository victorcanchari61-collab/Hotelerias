import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import { ESTADOS_ASIGNABLES, MAX_LOTE } from '../entities/Inventario'
import type {
  EstadoHabitacion,
  HabitacionFisica,
  HabitacionInput,
  LoteHabitaciones,
  OpcionesHabitacion,
} from '../entities/Inventario'
import type { HabitacionRepository } from '../repositories/HabitacionRepository'
import type { UseCase } from './UseCase'

type Res<T> = Promise<Either<Failure, T>>

// Letras, dígitos, espacio, punto o guion; hasta 10 caracteres (lo mismo que el servidor).
const RE_NUMERO = /^[A-Z0-9][A-Z0-9 .-]{0,9}$/

/** Comprueba una habitación ANTES de ir al servidor, que repite la regla. Pura. */
export function validarHabitacion(i: HabitacionInput): ValidationFailure | null {
  const numero = i.numero.trim().toUpperCase()
  if (!Number.isInteger(i.tipoHabitacionId) || i.tipoHabitacionId <= 0) {
    return new ValidationFailure('Elige el tipo de habitación.')
  }
  if (numero === '') return new ValidationFailure('Indica el número de la habitación.')
  if (!RE_NUMERO.test(numero)) {
    return new ValidationFailure('El número solo puede llevar letras, dígitos, guion o punto (hasta 10 caracteres).')
  }
  if (!Number.isInteger(i.piso) || i.piso < -5 || i.piso > 100) {
    return new ValidationFailure('El piso debe estar entre -5 y 100.')
  }
  if ([...i.notas.trim()].length > 300) return new ValidationFailure('Las notas no pueden pasar de 300 caracteres.')
  return null
}

export function validarLote(l: LoteHabitaciones): ValidationFailure | null {
  if (!Number.isInteger(l.tipoHabitacionId) || l.tipoHabitacionId <= 0) {
    return new ValidationFailure('Elige el tipo de habitación.')
  }
  if (![l.desde, l.hasta].every((n) => Number.isInteger(n) && n >= 1 && n <= 9999)) {
    return new ValidationFailure('El rango de números debe estar entre 1 y 9999.')
  }
  if (l.hasta < l.desde) return new ValidationFailure('«Hasta» no puede ser menor que «Desde».')
  if (l.hasta - l.desde + 1 > MAX_LOTE) {
    return new ValidationFailure(`Se pueden crear hasta ${MAX_LOTE} habitaciones de una vez.`)
  }
  if (!Number.isInteger(l.piso) || l.piso < -5 || l.piso > 100) {
    return new ValidationFailure('El piso debe estar entre -5 y 100.')
  }
  return null
}

const limpiar = (i: HabitacionInput): HabitacionInput => ({
  ...i,
  numero: i.numero.trim().toUpperCase(),
  notas: i.notas.trim(),
})

export class ListarHabitacionesUseCase implements UseCase<void, HabitacionFisica[]> {
  constructor(private readonly repo: HabitacionRepository) {}
  execute(): Res<HabitacionFisica[]> {
    return this.repo.listar()
  }
}

export class OpcionesHabitacionUseCase implements UseCase<void, OpcionesHabitacion> {
  constructor(private readonly repo: HabitacionRepository) {}
  execute(): Res<OpcionesHabitacion> {
    return this.repo.opciones()
  }
}

export class CrearHabitacionUseCase implements UseCase<HabitacionInput, HabitacionFisica> {
  constructor(private readonly repo: HabitacionRepository) {}
  async execute(entrada: HabitacionInput): Res<HabitacionFisica> {
    const input = limpiar(entrada)
    const invalida = validarHabitacion(input)
    if (invalida) return left(invalida)
    return this.repo.crear(input)
  }
}

export class CrearLoteHabitacionesUseCase implements UseCase<LoteHabitaciones, number> {
  constructor(private readonly repo: HabitacionRepository) {}
  async execute(lote: LoteHabitaciones): Res<number> {
    const invalida = validarLote(lote)
    if (invalida) return left(invalida)
    return this.repo.crearLote(lote)
  }
}

export interface ActualizarHabitacionInput {
  id: number
  datos: HabitacionInput
}

export class ActualizarHabitacionUseCase implements UseCase<ActualizarHabitacionInput, HabitacionFisica> {
  constructor(private readonly repo: HabitacionRepository) {}
  async execute({ id, datos }: ActualizarHabitacionInput): Res<HabitacionFisica> {
    const input = limpiar(datos)
    const invalida = validarHabitacion(input)
    if (invalida) return left(invalida)
    return this.repo.actualizar(id, input)
  }
}

export interface CambiarEstadoInput {
  id: number
  estado: EstadoHabitacion
}

/** «Ocupada» no se asigna a mano: la pone el check-in. */
export class CambiarEstadoHabitacionUseCase implements UseCase<CambiarEstadoInput, HabitacionFisica> {
  constructor(private readonly repo: HabitacionRepository) {}
  async execute({ id, estado }: CambiarEstadoInput): Res<HabitacionFisica> {
    if (!ESTADOS_ASIGNABLES.includes(estado)) {
      return left(new ValidationFailure('Ese estado no se puede asignar a mano: «ocupada» la pone el check-in.'))
    }
    return this.repo.cambiarEstado(id, estado)
  }
}
