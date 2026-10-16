import { attempt, toFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type {
  Cliente,
  CredencialesCliente,
  RegistroCliente,
  SesionCliente,
} from '@/domain/entities/Cliente'
import type {
  ClienteRepository,
  ClienteSessionRepository,
} from '@/domain/repositories/ClienteRepository'
import type { PortalRemoteDataSource } from '../datasources/PortalRemoteDataSource'
import type { ClienteSessionLocalDataSource } from '../datasources/ClienteSessionLocalDataSource'
import { clienteFromDto, clienteToDto, sesionClienteFromDto } from '../models/portal.model'

export class ClienteRepositoryImpl implements ClienteRepository {
  constructor(private readonly remote: PortalRemoteDataSource) {}

  registrar(registro: RegistroCliente): Promise<Either<Failure, SesionCliente>> {
    return attempt(async () => sesionClienteFromDto(await this.remote.registrar(registro)))
  }

  login(credenciales: CredencialesCliente): Promise<Either<Failure, SesionCliente>> {
    return attempt(async () => sesionClienteFromDto(await this.remote.login(credenciales)))
  }

  me(): Promise<Either<Failure, Cliente>> {
    return attempt(async () => clienteFromDto(await this.remote.me()))
  }
}

export class ClienteSessionRepositoryImpl implements ClienteSessionRepository {
  constructor(private readonly local: ClienteSessionLocalDataSource) {}

  cargar(): SesionCliente | null {
    const guardada = this.local.read()
    if (!guardada) return null
    return { token: guardada.token, cliente: clienteFromDto(guardada.cliente) }
  }

  guardar(sesion: SesionCliente): Either<Failure, void> {
    try {
      this.local.write({ token: sesion.token, cliente: clienteToDto(sesion.cliente) })
      return right(undefined)
    } catch (error) {
      return left(toFailure(error))
    }
  }

  actualizarCliente(cliente: Cliente): void {
    this.local.writeCliente(clienteToDto(cliente))
  }

  limpiar(): void {
    this.local.clear()
  }
}
