import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import { esFechaISO } from '../fechas'
import type { CheckInInput, EstanciaRegistrada, Ficha, HabitacionLibre, Movimiento } from '../entities/Recepcion'
import type { EstanciaRepository } from '../repositories/EstanciaRepository'
import type { UseCase } from './UseCase'

type Res<T> = Promise<Either<Failure, T>>

// El formato de cada documento: el mismo que aplica el servidor.
const FORMATO: Record<Ficha['documentoTipo'], { re: RegExp; mensaje: string }> = {
  dni: { re: /^\d{8}$/, mensaje: 'El DNI tiene 8 dígitos.' },
  ce: { re: /^[A-Z0-9]{9,12}$/, mensaje: 'El carné de extranjería tiene de 9 a 12 letras o dígitos.' },
  pasaporte: { re: /^[A-Z0-9]{6,12}$/, mensaje: 'El pasaporte tiene de 6 a 12 letras o dígitos.' },
  otro: { re: /^[A-Z0-9.-]{4,20}$/, mensaje: 'El documento debe tener de 4 a 20 caracteres (letras, dígitos, punto o guion).' },
}

/** Deja la ficha como la espera el servidor: sin espacios sobrantes y el documento en mayúsculas. */
export function limpiarFicha(f: Ficha): Ficha {
  return {
    ...f,
    documentoNumero: f.documentoNumero.replace(/\s+/g, '').toUpperCase(),
    nombreCompleto: f.nombreCompleto.trim().replace(/\s+/g, ' '),
    nacionalidad: f.nacionalidad.trim().replace(/\s+/g, ' '),
    telefono: f.telefono.trim(),
    // Un domiciliado no lleva fecha de ingreso al país.
    fechaIngresoPais: f.domiciliado ? null : f.fechaIngresoPais,
  }
}

/**
 * Comprueba una ficha ya limpia ANTES de ir al servidor, que repite la regla.
 * `hoy` es la fecha del HOTEL. Pura.
 */
export function validarFicha(f: Ficha, hoy: string): ValidationFailure | null {
  const formato = FORMATO[f.documentoTipo]
  if (!formato) return new ValidationFailure('Elige el tipo de documento.')
  if (!formato.re.test(f.documentoNumero)) return new ValidationFailure(formato.mensaje)
  if (f.nombreCompleto === '') return new ValidationFailure('Indica el nombre completo del huésped.')
  if ([...f.nombreCompleto].length > 120) return new ValidationFailure('El nombre no puede pasar de 120 caracteres.')
  if (f.nacionalidad === '') return new ValidationFailure('Indica la nacionalidad.')
  if ([...f.nacionalidad].length > 40) return new ValidationFailure('La nacionalidad no puede pasar de 40 caracteres.')
  if ([...f.telefono].length > 30) return new ValidationFailure('El teléfono no puede pasar de 30 caracteres.')
  if (!f.domiciliado) {
    if (f.fechaIngresoPais === null || !esFechaISO(f.fechaIngresoPais)) {
      return new ValidationFailure('Un huésped no domiciliado debe indicar la fecha en que ingresó al país.')
    }
    if (f.fechaIngresoPais > hoy) return new ValidationFailure('La fecha de ingreso al país no puede ser futura.')
  }
  return null
}

export class PanelRecepcionUseCase implements UseCase<void, Movimiento[]> {
  constructor(private readonly repo: EstanciaRepository) {}
  execute(): Res<Movimiento[]> {
    return this.repo.panel()
  }
}

export class HabitacionesLibresUseCase implements UseCase<number, HabitacionLibre[]> {
  constructor(private readonly repo: EstanciaRepository) {}
  execute(reservaId: number): Res<HabitacionLibre[]> {
    return this.repo.libres(reservaId)
  }
}

export class CheckInUseCase implements UseCase<CheckInInput, EstanciaRegistrada> {
  constructor(
    private readonly repo: EstanciaRepository,
    private readonly hoy: () => string,
  ) {}

  async execute(entrada: CheckInInput): Res<EstanciaRegistrada> {
    if (!Number.isInteger(entrada.reservaId) || entrada.reservaId <= 0) {
      return left(new ValidationFailure('Elige la reserva.'))
    }
    if (!Number.isInteger(entrada.habitacionId) || entrada.habitacionId <= 0) {
      return left(new ValidationFailure('Elige la habitación.'))
    }
    const ficha = limpiarFicha(entrada.ficha)
    const invalida = validarFicha(ficha, this.hoy())
    if (invalida) return left(invalida)
    return this.repo.checkIn({ ...entrada, ficha })
  }
}

export class CheckOutUseCase implements UseCase<number, EstanciaRegistrada> {
  constructor(private readonly repo: EstanciaRepository) {}
  execute(estanciaId: number): Res<EstanciaRegistrada> {
    return this.repo.checkOut(estanciaId)
  }
}

export class VerFichaUseCase implements UseCase<number, Ficha> {
  constructor(private readonly repo: EstanciaRepository) {}
  execute(estanciaId: number): Res<Ficha> {
    return this.repo.ficha(estanciaId)
  }
}
