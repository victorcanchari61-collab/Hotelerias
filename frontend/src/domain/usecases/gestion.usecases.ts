import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type { Cliente, TipoCliente, TipoClienteInput } from '../entities/Cliente'
import type { EstadoReserva, Promocion, PromocionInput, Reserva } from '../entities/Portal'
import { esFechaISO } from '../fechas'
import type {
  FidelizacionRepository,
  PromocionRepository,
  ReservaAdminRepository,
} from '../repositories/GestionRepository'
import type { UseCase } from './UseCase'

// --- Promociones ---

/** Las reglas de una oferta, para avisar antes de ir al servidor (que repite las mismas). */
export function validarPromocion(p: PromocionInput): ValidationFailure | null {
  if (p.nombre.trim() === '') return new ValidationFailure('Ponle un nombre a la oferta.')
  if (!esFechaISO(p.desde) || !esFechaISO(p.hasta)) {
    return new ValidationFailure('Indica desde y hasta qué fechas de estadía vale.')
  }
  if (p.hasta < p.desde) {
    return new ValidationFailure('La fecha final no puede ser anterior a la inicial.')
  }
  if (!Number.isInteger(p.minNoches) || p.minNoches < 1) {
    return new ValidationFailure('El mínimo de noches es 1.')
  }
  if (p.tipo === 'porcentaje') {
    if (!Number.isInteger(p.porcentaje) || p.porcentaje === null || p.porcentaje < 1 || p.porcentaje > 100) {
      return new ValidationFailure('El porcentaje debe estar entre 1 y 100.')
    }
  } else if (!Number.isInteger(p.montoNocheCent) || p.montoNocheCent === null || p.montoNocheCent <= 0) {
    return new ValidationFailure('El monto por noche debe ser mayor que cero.')
  }
  return null
}

/** Deja solo el valor que corresponde al tipo, y el código sin espacios ni minúsculas. */
function normalizarPromocion(p: PromocionInput): PromocionInput {
  const codigo = p.codigo?.trim().toUpperCase() ?? ''
  return {
    ...p,
    nombre: p.nombre.trim(),
    descripcion: p.descripcion.trim(),
    codigo: codigo === '' ? null : codigo,
    porcentaje: p.tipo === 'porcentaje' ? p.porcentaje : null,
    montoNocheCent: p.tipo === 'monto_noche' ? p.montoNocheCent : null,
  }
}

export class ListarPromocionesAdminUseCase implements UseCase<void, Promocion[]> {
  constructor(private readonly promociones: PromocionRepository) {}

  execute(): Promise<Either<Failure, Promocion[]>> {
    return this.promociones.listar()
  }
}

export class CrearPromocionUseCase implements UseCase<PromocionInput, Promocion> {
  constructor(private readonly promociones: PromocionRepository) {}

  async execute(entrada: PromocionInput): Promise<Either<Failure, Promocion>> {
    const input = normalizarPromocion(entrada)
    const invalida = validarPromocion(input)
    if (invalida) return left(invalida)
    return this.promociones.crear(input)
  }
}

export interface ActualizarPromocionInput {
  id: number
  datos: PromocionInput
}

export class ActualizarPromocionUseCase implements UseCase<ActualizarPromocionInput, Promocion> {
  constructor(private readonly promociones: PromocionRepository) {}

  async execute({ id, datos }: ActualizarPromocionInput): Promise<Either<Failure, Promocion>> {
    const input = normalizarPromocion(datos)
    const invalida = validarPromocion(input)
    if (invalida) return left(invalida)
    return this.promociones.actualizar(id, input)
  }
}

// --- Tipos de cliente y huéspedes ---

export function validarTipoCliente(t: TipoClienteInput): ValidationFailure | null {
  if (t.nombre.trim() === '') return new ValidationFailure('Ponle un nombre al tipo de cliente.')
  if (!Number.isInteger(t.descuentoPct) || t.descuentoPct < 0 || t.descuentoPct > 100) {
    return new ValidationFailure('El descuento debe estar entre 0 y 100.')
  }
  if (t.reservasMinimas !== null && (!Number.isInteger(t.reservasMinimas) || t.reservasMinimas < 1)) {
    return new ValidationFailure(
      'Las reservas mínimas deben ser 1 o más (o déjalo vacío para asignarlo a mano).',
    )
  }
  return null
}

export class ListarTiposClienteUseCase implements UseCase<void, TipoCliente[]> {
  constructor(private readonly fidelizacion: FidelizacionRepository) {}

  execute(): Promise<Either<Failure, TipoCliente[]>> {
    return this.fidelizacion.tipos()
  }
}

export class CrearTipoClienteUseCase implements UseCase<TipoClienteInput, TipoCliente> {
  constructor(private readonly fidelizacion: FidelizacionRepository) {}

  async execute(entrada: TipoClienteInput): Promise<Either<Failure, TipoCliente>> {
    const input = { ...entrada, nombre: entrada.nombre.trim(), descripcion: entrada.descripcion.trim() }
    const invalido = validarTipoCliente(input)
    if (invalido) return left(invalido)
    return this.fidelizacion.crearTipo(input)
  }
}

export interface ActualizarTipoClienteInput {
  id: number
  datos: TipoClienteInput
}

export class ActualizarTipoClienteUseCase implements UseCase<ActualizarTipoClienteInput, TipoCliente> {
  constructor(private readonly fidelizacion: FidelizacionRepository) {}

  async execute({ id, datos }: ActualizarTipoClienteInput): Promise<Either<Failure, TipoCliente>> {
    const input = { ...datos, nombre: datos.nombre.trim(), descripcion: datos.descripcion.trim() }
    const invalido = validarTipoCliente(input)
    if (invalido) return left(invalido)
    return this.fidelizacion.actualizarTipo(id, input)
  }
}

export class ListarClientesUseCase implements UseCase<void, Cliente[]> {
  constructor(private readonly fidelizacion: FidelizacionRepository) {}

  execute(): Promise<Either<Failure, Cliente[]>> {
    return this.fidelizacion.clientes()
  }
}

export interface AsignarTipoInput {
  clienteId: number
  /** null = volver a la clasificación automática. */
  tipoId: number | null
}

export class AsignarTipoClienteUseCase implements UseCase<AsignarTipoInput, Cliente> {
  constructor(private readonly fidelizacion: FidelizacionRepository) {}

  execute({ clienteId, tipoId }: AsignarTipoInput): Promise<Either<Failure, Cliente>> {
    return this.fidelizacion.asignarTipo(clienteId, tipoId)
  }
}

// --- Reservas (vista del personal) ---

export class ListarReservasAdminUseCase implements UseCase<EstadoReserva | undefined, Reserva[]> {
  constructor(private readonly reservas: ReservaAdminRepository) {}

  execute(estado?: EstadoReserva): Promise<Either<Failure, Reserva[]>> {
    return this.reservas.listar(estado)
  }
}

export class CancelarReservaAdminUseCase implements UseCase<number, Reserva> {
  constructor(private readonly reservas: ReservaAdminRepository) {}

  execute(id: number): Promise<Either<Failure, Reserva>> {
    return this.reservas.cancelar(id)
  }
}
