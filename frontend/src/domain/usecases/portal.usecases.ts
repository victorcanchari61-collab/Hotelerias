import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import { esFechaISO, noches } from '../fechas'
import type { MonedasPublicas } from '../entities/Moneda'
import type { ParametrosPublicos } from '../entities/Parametro'
import type {
  BusquedaEstadia,
  ContactoEmpresa,
  Membresia,
  Cotizacion,
  DetalleSede,
  HabitacionDisponible,
  Promocion,
  Reserva,
  Sede,
  SolicitudReserva,
} from '../entities/Portal'
import type { PortalRepository } from '../repositories/PortalRepository'
import type { UseCase } from './UseCase'

/** El largo máximo de una estadía por la web (el servidor aplica el mismo tope). */
export const MAX_NOCHES = 30
export const MAX_HUESPEDES = 10

/**
 * Comprueba unas fechas y una cantidad de huéspedes ANTES de ir al servidor:
 * no hay por qué gastar una petición (ni mostrar un error de red) por una
 * salida anterior a la entrada. `hoy` es la fecha del HOTEL.
 *
 * Es pura: el servidor repite estas reglas, esto es solo para avisar rápido.
 */
export function validarEstadia(
  { entrada, salida, huespedes }: BusquedaEstadia,
  hoy: string,
): ValidationFailure | null {
  if (!esFechaISO(entrada) || !esFechaISO(salida)) {
    return new ValidationFailure('Elige la fecha de entrada y la de salida.')
  }
  if (entrada < hoy) return new ValidationFailure('La entrada no puede ser anterior a hoy.')
  if (salida <= entrada) return new ValidationFailure('La salida debe ser después de la entrada.')
  if (noches(entrada, salida) > MAX_NOCHES) {
    return new ValidationFailure(`La estadía no puede pasar de ${MAX_NOCHES} noches.`)
  }
  if (!Number.isInteger(huespedes) || huespedes < 1) {
    return new ValidationFailure('Indica cuántos huéspedes son.')
  }
  if (huespedes > MAX_HUESPEDES) {
    return new ValidationFailure(`Para más de ${MAX_HUESPEDES} huéspedes, comunícate con el hotel.`)
  }
  return null
}

export class ListarSedesUseCase implements UseCase<void, Sede[]> {
  constructor(private readonly portal: PortalRepository) {}

  execute(): Promise<Either<Failure, Sede[]>> {
    return this.portal.sedes()
  }
}

export class ObtenerSedeUseCase implements UseCase<number, DetalleSede> {
  constructor(private readonly portal: PortalRepository) {}

  execute(id: number): Promise<Either<Failure, DetalleSede>> {
    return this.portal.sede(id)
  }
}

export interface ConsultarDisponibilidadInput {
  sedeId: number
  busqueda: BusquedaEstadia
}

export class ConsultarDisponibilidadUseCase
  implements UseCase<ConsultarDisponibilidadInput, HabitacionDisponible[]>
{
  constructor(
    private readonly portal: PortalRepository,
    private readonly hoy: () => string,
  ) {}

  async execute({ sedeId, busqueda }: ConsultarDisponibilidadInput) {
    const invalida = validarEstadia(busqueda, this.hoy())
    if (invalida) return left(invalida)
    return this.portal.disponibilidad(sedeId, busqueda)
  }
}

/** Una habitación disponible con el precio que le corresponde a ESTA persona. */
export interface OpcionEstadia {
  habitacion: HabitacionDisponible
  /** null si no hay disponibilidad (agotada) o si la cotización falló. */
  cotizacion: Cotizacion | null
}

export interface BuscarEstadiaInput {
  sedeId: number
  busqueda: BusquedaEstadia
  /** Código promocional que el huésped escribió (puede ir vacío). */
  codigo: string
  /** Moneda en que se cotiza; vacío es soles. */
  moneda?: string
}

/**
 * La pregunta completa de quien busca: "¿qué hay en este hotel esas fechas y a
 * qué precio para mí?". Junta disponibilidad y cotización para que la pantalla
 * no orqueste dos llamadas (y no se equivoque en qué hacer si una falla).
 *
 * Una cotización que falla no tumba la búsqueda: esa habitación se muestra sin
 * el precio con descuento y se vuelve a cotizar al reservar, que es donde importa.
 */
export class BuscarEstadiaUseCase implements UseCase<BuscarEstadiaInput, OpcionEstadia[]> {
  constructor(
    private readonly portal: PortalRepository,
    private readonly hoy: () => string,
  ) {}

  async execute({ sedeId, busqueda, codigo, moneda }: BuscarEstadiaInput) {
    const invalida = validarEstadia(busqueda, this.hoy())
    if (invalida) return left(invalida)

    const disponibles = await this.portal.disponibilidad(sedeId, busqueda)
    if (disponibles.isLeft()) return left(disponibles.value)

    const opciones = await Promise.all(
      disponibles.value.map(async (habitacion): Promise<OpcionEstadia> => {
        if (habitacion.disponibles < 1) return { habitacion, cotizacion: null }
        const cotizacion = await this.portal.cotizar({
          tipoHabitacionId: habitacion.id,
          checkIn: busqueda.entrada,
          checkOut: busqueda.salida,
          huespedes: busqueda.huespedes,
          codigo: codigo.trim().toUpperCase(),
          notas: '',
          moneda,
        })
        return { habitacion, cotizacion: cotizacion.isRight() ? cotizacion.value : null }
      }),
    )
    return right<OpcionEstadia[], Failure>(opciones)
  }
}

/** Las monedas que se ofrecen y el tipo de cambio de hoy. */
export class ListarMonedasUseCase implements UseCase<void, MonedasPublicas> {
  constructor(private readonly portal: PortalRepository) {}

  execute(): Promise<Either<Failure, MonedasPublicas>> {
    return this.portal.monedas()
  }
}

/** Las categorías de huésped que la web muestra. */
export class ListarMembresiasUseCase implements UseCase<void, Membresia[]> {
  constructor(private readonly portal: PortalRepository) {}

  execute(): Promise<Either<Failure, Membresia[]>> {
    return this.portal.membresias()
  }
}

/** Los datos para escribir o llamar al hotel. */
export class ObtenerContactoUseCase implements UseCase<void, ContactoEmpresa> {
  constructor(private readonly portal: PortalRepository) {}

  execute(): Promise<Either<Failure, ContactoEmpresa>> {
    return this.portal.contacto()
  }
}

/** Los horarios y demás ajustes públicos. Si no se pueden leer, la web sigue sin ellos. */
export class ListarParametrosPublicosUseCase implements UseCase<void, ParametrosPublicos> {
  constructor(private readonly portal: PortalRepository) {}

  execute(): Promise<Either<Failure, ParametrosPublicos>> {
    return this.portal.parametros()
  }
}

export class ListarPromocionesUseCase implements UseCase<void, Promocion[]> {
  constructor(private readonly portal: PortalRepository) {}

  execute(): Promise<Either<Failure, Promocion[]>> {
    return this.portal.promociones()
  }
}

/** Quita lo que no cuenta: el código se compara sin importar mayúsculas ni espacios. */
function normalizar(s: SolicitudReserva): SolicitudReserva {
  return { ...s, codigo: s.codigo.trim().toUpperCase(), notas: s.notas.trim() }
}

function validarSolicitud(s: SolicitudReserva, hoy: string): ValidationFailure | null {
  if (!Number.isInteger(s.tipoHabitacionId) || s.tipoHabitacionId <= 0) {
    return new ValidationFailure('Elige una habitación.')
  }
  return validarEstadia({ entrada: s.checkIn, salida: s.checkOut, huespedes: s.huespedes }, hoy)
}

/** Cuánto costaría. No exige sesión: el visitante puede ver el precio. */
export class CotizarEstadiaUseCase implements UseCase<SolicitudReserva, Cotizacion> {
  constructor(
    private readonly portal: PortalRepository,
    private readonly hoy: () => string,
  ) {}

  async execute(entrada: SolicitudReserva): Promise<Either<Failure, Cotizacion>> {
    const solicitud = normalizar(entrada)
    const invalida = validarSolicitud(solicitud, this.hoy())
    if (invalida) return left(invalida)
    return this.portal.cotizar(solicitud)
  }
}

/**
 * Reservar. La sesión se exige en el servidor (401 sin ella); la pantalla,
 * además, no llega aquí sin haber iniciado sesión.
 */
export class ReservarEstadiaUseCase implements UseCase<SolicitudReserva, Reserva> {
  constructor(
    private readonly portal: PortalRepository,
    private readonly hoy: () => string,
  ) {}

  async execute(entrada: SolicitudReserva): Promise<Either<Failure, Reserva>> {
    const solicitud = normalizar(entrada)
    const invalida = validarSolicitud(solicitud, this.hoy())
    if (invalida) return left(invalida)
    return this.portal.reservar(solicitud)
  }
}

export class ListarMisReservasUseCase implements UseCase<void, Reserva[]> {
  constructor(private readonly portal: PortalRepository) {}

  execute(): Promise<Either<Failure, Reserva[]>> {
    return this.portal.misReservas()
  }
}

export class CancelarReservaUseCase implements UseCase<string, Reserva> {
  constructor(private readonly portal: PortalRepository) {}

  async execute(codigo: string): Promise<Either<Failure, Reserva>> {
    if (codigo.trim() === '') return left(new ValidationFailure('Falta el código de la reserva.'))
    return this.portal.cancelar(codigo.trim())
  }
}
