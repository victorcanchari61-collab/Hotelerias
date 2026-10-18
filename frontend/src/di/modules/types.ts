import type { FileTransfer, HttpClient } from '@/core/network/HttpClient'
import type { SessionRepository } from '@/domain/repositories/SessionRepository'
import type { AuthRepository } from '@/domain/repositories/AuthRepository'
import type { PermisoRepository } from '@/domain/repositories/PermisoRepository'
import type { UsuarioRepository } from '@/domain/repositories/UsuarioRepository'
import type {
  ClienteRepository,
  ClienteSessionRepository,
} from '@/domain/repositories/ClienteRepository'
import type {
  FidelizacionRepository,
  PromocionRepository,
  ReservaAdminRepository,
} from '@/domain/repositories/GestionRepository'
import type { HabitacionRepository } from '@/domain/repositories/HabitacionRepository'
import type { ParametroRepository } from '@/domain/repositories/ParametroRepository'
import type { TipoCambioRepository } from '@/domain/repositories/FinanzasRepository'
import type { PortalRepository } from '@/domain/repositories/PortalRepository'
import type {
  AccesosRepository,
  AuditoriaRepository,
  EmpresaRepository,
  RolRepository,
  SedeAdminRepository,
} from '@/domain/repositories/ConfiguracionRepository'

/**
 * Reemplazos de repositorios. Sirven para probar la UI contra datos en
 * memoria sin tocar la red: todo lo que depende de un repositorio recibe la
 * interfaz, así que un fake es intercambiable por el real.
 */
export interface RepositoryOverrides {
  auth?: AuthRepository
  permiso?: PermisoRepository
  usuario?: UsuarioRepository
  // Portal del huésped.
  portal?: PortalRepository
  cliente?: ClienteRepository
  clienteSession?: ClienteSessionRepository
  // Lo que administra el personal del portal.
  promocion?: PromocionRepository
  fidelizacion?: FidelizacionRepository
  reservaAdmin?: ReservaAdminRepository
  // Habitaciones físicas.
  habitacion?: HabitacionRepository
  // Configuración: parámetros del sistema.
  parametro?: ParametroRepository
  // Finanzas: tipo de cambio.
  tipoCambio?: TipoCambioRepository
  // Configuración: roles, accesos, empresa, sedes y auditoría.
  rol?: RolRepository
  empresa?: EmpresaRepository
  sedeAdmin?: SedeAdminRepository
  accesos?: AccesosRepository
  auditoria?: AuditoriaRepository
}

/** Lo que el contenedor le da a cada módulo para que arme sus piezas. */
export interface ModuleContext {
  /** Con la sesión del PERSONAL. */
  http: HttpClient & FileTransfer
  /** Con la sesión del HUÉSPED: otro token, otra caducidad. */
  portalHttp: HttpClient
  session: SessionRepository
  clienteSession: ClienteSessionRepository
  /** La fecha de hoy en el hotel (AAAA-MM-DD). Inyectable para pruebas. */
  hoy: () => string
  overrides: RepositoryOverrides
}
