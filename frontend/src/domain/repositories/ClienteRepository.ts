import type { Failure } from '@/core/errors/failures'
import type { Either } from '@/core/utils/either'
import type {
  Cliente,
  CredencialesCliente,
  RegistroCliente,
  SesionCliente,
} from '../entities/Cliente'

/** La cuenta del huésped en el servidor. */
export interface ClienteRepository {
  registrar(registro: RegistroCliente): Promise<Either<Failure, SesionCliente>>
  login(credenciales: CredencialesCliente): Promise<Either<Failure, SesionCliente>>
  me(): Promise<Either<Failure, Cliente>>
}

/**
 * Dónde vive la sesión del huésped en este dispositivo. Aparte de la del
 * personal (otra clave, otro token): abrir el panel no cierra la web ni al revés.
 */
export interface ClienteSessionRepository {
  cargar(): SesionCliente | null
  guardar(sesion: SesionCliente): Either<Failure, void>
  actualizarCliente(cliente: Cliente): void
  limpiar(): void
}
