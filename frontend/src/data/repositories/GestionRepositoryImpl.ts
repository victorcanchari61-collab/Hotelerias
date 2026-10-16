import { attempt } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type { Cliente, TipoCliente, TipoClienteInput } from '@/domain/entities/Cliente'
import type { EstadoReserva, Promocion, PromocionInput, Reserva } from '@/domain/entities/Portal'
import type {
  FidelizacionRepository,
  PromocionRepository,
  ReservaAdminRepository,
} from '@/domain/repositories/GestionRepository'
import type { GestionRemoteDataSource } from '../datasources/PortalRemoteDataSource'
import {
  clienteFromDto,
  promocionFromDto,
  promocionInputToDto,
  reservaFromDto,
  tipoClienteFromDto,
  tipoClienteInputToDto,
} from '../models/portal.model'

export class PromocionRepositoryImpl implements PromocionRepository {
  constructor(private readonly remote: GestionRemoteDataSource) {}

  listar(): Promise<Either<Failure, Promocion[]>> {
    return attempt(async () => ((await this.remote.promociones()) ?? []).map(promocionFromDto))
  }

  crear(input: PromocionInput): Promise<Either<Failure, Promocion>> {
    return attempt(async () =>
      promocionFromDto(await this.remote.crearPromocion(promocionInputToDto(input))),
    )
  }

  actualizar(id: number, input: PromocionInput): Promise<Either<Failure, Promocion>> {
    return attempt(async () =>
      promocionFromDto(await this.remote.actualizarPromocion(id, promocionInputToDto(input))),
    )
  }
}

export class FidelizacionRepositoryImpl implements FidelizacionRepository {
  constructor(private readonly remote: GestionRemoteDataSource) {}

  tipos(): Promise<Either<Failure, TipoCliente[]>> {
    return attempt(async () => ((await this.remote.tipos()) ?? []).map(tipoClienteFromDto))
  }

  crearTipo(input: TipoClienteInput): Promise<Either<Failure, TipoCliente>> {
    return attempt(async () =>
      tipoClienteFromDto(await this.remote.crearTipo(tipoClienteInputToDto(input))),
    )
  }

  actualizarTipo(id: number, input: TipoClienteInput): Promise<Either<Failure, TipoCliente>> {
    return attempt(async () =>
      tipoClienteFromDto(await this.remote.actualizarTipo(id, tipoClienteInputToDto(input))),
    )
  }

  clientes(): Promise<Either<Failure, Cliente[]>> {
    return attempt(async () => ((await this.remote.clientes()) ?? []).map(clienteFromDto))
  }

  asignarTipo(clienteId: number, tipoId: number | null): Promise<Either<Failure, Cliente>> {
    return attempt(async () => clienteFromDto(await this.remote.asignarTipo(clienteId, tipoId)))
  }
}

export class ReservaAdminRepositoryImpl implements ReservaAdminRepository {
  constructor(private readonly remote: GestionRemoteDataSource) {}

  listar(estado?: EstadoReserva): Promise<Either<Failure, Reserva[]>> {
    return attempt(async () => ((await this.remote.reservas(estado)) ?? []).map(reservaFromDto))
  }

  cancelar(id: number): Promise<Either<Failure, Reserva>> {
    return attempt(async () => reservaFromDto(await this.remote.cancelarReserva(id)))
  }
}
