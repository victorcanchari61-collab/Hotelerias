import { ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type {
  Alcances,
  AprobarInput,
  CatalogoAlcances,
  ConcederInput,
  DetalleAuditoria,
  Empresa,
  EmpresaInput,
  Excepcion,
  FiltroAuditoria,
  PaginaAuditoria,
  ResumenAuditoria,
  Rol,
  RolInput,
  SedeAdmin,
  SedeInput,
  SolicitarInput,
  SolicitudPermiso,
} from '../entities/Configuracion'
import type {
  AccesosRepository,
  AuditoriaRepository,
  EmpresaRepository,
  RolRepository,
  SedeAdminRepository,
} from '../repositories/ConfiguracionRepository'
import { esEmail } from '../validation'
import type { UseCase } from './UseCase'

type Res<T> = Promise<Either<Failure, T>>

// --- Roles ---

export function validarRol(i: RolInput): ValidationFailure | null {
  if (i.nombre.trim() === '') return new ValidationFailure('Ponle un nombre al rol.')
  if (i.nombre.trim().length > 60) return new ValidationFailure('El nombre no puede pasar de 60 caracteres.')
  return null
}

const limpiarRol = (i: RolInput): RolInput => ({
  ...i,
  nombre: i.nombre.trim(),
  descripcion: i.descripcion.trim(),
})

export class ListarRolesUseCase implements UseCase<void, Rol[]> {
  constructor(private readonly roles: RolRepository) {}
  execute(): Res<Rol[]> {
    return this.roles.listar()
  }
}

export class CrearRolUseCase implements UseCase<RolInput, Rol> {
  constructor(private readonly roles: RolRepository) {}
  async execute(entrada: RolInput): Res<Rol> {
    const input = limpiarRol(entrada)
    const invalido = validarRol(input)
    if (invalido) return left(invalido)
    return this.roles.crear(input)
  }
}

export class ActualizarRolUseCase implements UseCase<{ id: number; datos: RolInput }, Rol> {
  constructor(private readonly roles: RolRepository) {}
  async execute({ id, datos }: { id: number; datos: RolInput }): Res<Rol> {
    const input = limpiarRol(datos)
    const invalido = validarRol(input)
    if (invalido) return left(invalido)
    return this.roles.actualizar(id, input)
  }
}

export class GuardarPermisosRolUseCase implements UseCase<{ id: number; permisos: string[] }, Rol> {
  constructor(private readonly roles: RolRepository) {}
  execute({ id, permisos }: { id: number; permisos: string[] }): Res<Rol> {
    return this.roles.guardarPermisos(id, permisos)
  }
}

export class EliminarRolUseCase implements UseCase<number, void> {
  constructor(private readonly roles: RolRepository) {}
  execute(id: number): Res<void> {
    return this.roles.eliminar(id)
  }
}

// --- Empresa ---

const RUC = /^\d{11}$/

export function validarEmpresa(e: EmpresaInput): ValidationFailure | null {
  if (e.nombreComercial.trim() === '') return new ValidationFailure('El nombre comercial es obligatorio.')
  if (e.ruc.trim() !== '' && !RUC.test(e.ruc.trim())) {
    return new ValidationFailure('El RUC debe tener 11 dígitos.')
  }
  if (e.email.trim() !== '' && !esEmail(e.email)) {
    return new ValidationFailure('El correo de la empresa no es válido.')
  }
  return null
}

export class ObtenerEmpresaUseCase implements UseCase<void, Empresa> {
  constructor(private readonly empresa: EmpresaRepository) {}
  execute(): Res<Empresa> {
    return this.empresa.obtener()
  }
}

export class GuardarEmpresaUseCase implements UseCase<EmpresaInput, Empresa> {
  constructor(private readonly empresa: EmpresaRepository) {}
  async execute(entrada: EmpresaInput): Res<Empresa> {
    const input = Object.fromEntries(
      Object.entries(entrada).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]),
    ) as EmpresaInput
    const invalido = validarEmpresa(input)
    if (invalido) return left(invalido)
    return this.empresa.guardar(input)
  }
}

// --- Sedes ---

export function validarSede(s: SedeInput): ValidationFailure | null {
  if (s.nombre.trim() === '') return new ValidationFailure('Ponle un nombre a la sede.')
  if (s.ciudad.trim() === '') return new ValidationFailure('Indica la ciudad.')
  if (!Number.isInteger(s.estrellas) || s.estrellas < 1 || s.estrellas > 5) {
    return new ValidationFailure('Las estrellas van de 1 a 5.')
  }
  return null
}

const limpiarSede = (s: SedeInput): SedeInput => ({
  ...s,
  nombre: s.nombre.trim(),
  ciudad: s.ciudad.trim(),
  direccion: s.direccion.trim(),
  descripcion: s.descripcion.trim(),
  servicios: s.servicios.map((x) => x.trim()).filter((x) => x !== ''),
})

export class ListarSedesAdminUseCase implements UseCase<void, SedeAdmin[]> {
  constructor(private readonly sedes: SedeAdminRepository) {}
  execute(): Res<SedeAdmin[]> {
    return this.sedes.listar()
  }
}

export class CrearSedeUseCase implements UseCase<SedeInput, SedeAdmin> {
  constructor(private readonly sedes: SedeAdminRepository) {}
  async execute(entrada: SedeInput): Res<SedeAdmin> {
    const input = limpiarSede(entrada)
    const invalido = validarSede(input)
    if (invalido) return left(invalido)
    return this.sedes.crear(input)
  }
}

export class ActualizarSedeUseCase implements UseCase<{ id: number; datos: SedeInput }, SedeAdmin> {
  constructor(private readonly sedes: SedeAdminRepository) {}
  async execute({ id, datos }: { id: number; datos: SedeInput }): Res<SedeAdmin> {
    const input = limpiarSede(datos)
    const invalido = validarSede(input)
    if (invalido) return left(invalido)
    return this.sedes.actualizar(id, input)
  }
}

// --- Accesos ---

export function validarConceder(i: ConcederInput, ahora: Date): ValidationFailure | null {
  if (!i.usuarioId) return new ValidationFailure('Elige a la persona.')
  if (!i.submodulo || !i.accion) return new ValidationFailure('Elige el permiso que quieres conceder.')
  if (i.vigencia === 'temporal') {
    const t = i.expiraEn ? new Date(i.expiraEn) : null
    if (!t || Number.isNaN(t.getTime())) {
      return new ValidationFailure('Un permiso temporal necesita fecha de vencimiento.')
    }
    if (t.getTime() <= ahora.getTime()) {
      return new ValidationFailure('El vencimiento tiene que ser una fecha futura.')
    }
  }
  return null
}

export class ExcepcionesDeUseCase implements UseCase<number, Excepcion[]> {
  constructor(private readonly accesos: AccesosRepository) {}
  execute(usuarioId: number): Res<Excepcion[]> {
    return this.accesos.excepcionesDe(usuarioId)
  }
}

export class ConcederPermisoUseCase implements UseCase<ConcederInput, Excepcion> {
  constructor(
    private readonly accesos: AccesosRepository,
    private readonly ahora: () => Date = () => new Date(),
  ) {}
  async execute(entrada: ConcederInput): Res<Excepcion> {
    const input: ConcederInput = {
      ...entrada,
      motivo: entrada.motivo.trim(),
      // Fuera de "temporal" la fecha no significa nada: no se manda.
      expiraEn: entrada.vigencia === 'temporal' ? entrada.expiraEn : null,
    }
    const invalido = validarConceder(input, this.ahora())
    if (invalido) return left(invalido)
    return this.accesos.conceder(input)
  }
}

export class RevocarPermisoUseCase implements UseCase<number, void> {
  constructor(private readonly accesos: AccesosRepository) {}
  execute(id: number): Res<void> {
    return this.accesos.revocar(id)
  }
}

export class SolicitarPermisoUseCase implements UseCase<SolicitarInput, SolicitudPermiso> {
  constructor(private readonly accesos: AccesosRepository) {}
  execute(entrada: SolicitarInput): Res<SolicitudPermiso> {
    return this.accesos.solicitar({
      ...entrada,
      motivo: entrada.motivo.trim(),
      referencia: entrada.referencia.trim(),
    })
  }
}

export class MisSolicitudesUseCase implements UseCase<void, SolicitudPermiso[]> {
  constructor(private readonly accesos: AccesosRepository) {}
  execute(): Res<SolicitudPermiso[]> {
    return this.accesos.misSolicitudes()
  }
}

export class BandejaSolicitudesUseCase implements UseCase<boolean, SolicitudPermiso[]> {
  constructor(private readonly accesos: AccesosRepository) {}
  execute(soloPendientes: boolean): Res<SolicitudPermiso[]> {
    return this.accesos.bandeja(soloPendientes)
  }
}

export class AprobarSolicitudUseCase implements UseCase<AprobarInput, SolicitudPermiso> {
  constructor(
    private readonly accesos: AccesosRepository,
    private readonly ahora: () => Date = () => new Date(),
  ) {}
  async execute(entrada: AprobarInput): Res<SolicitudPermiso> {
    if (entrada.vigencia === 'temporal') {
      const t = entrada.expiraEn ? new Date(entrada.expiraEn) : null
      if (!t || Number.isNaN(t.getTime()) || t.getTime() <= this.ahora().getTime()) {
        return left(new ValidationFailure('Un permiso temporal necesita un vencimiento futuro.'))
      }
    }
    return this.accesos.aprobar({
      ...entrada,
      expiraEn: entrada.vigencia === 'temporal' ? entrada.expiraEn : null,
      respuesta: entrada.respuesta.trim(),
    })
  }
}

export class RechazarSolicitudUseCase implements UseCase<{ id: number; respuesta: string }, SolicitudPermiso> {
  constructor(private readonly accesos: AccesosRepository) {}
  execute({ id, respuesta }: { id: number; respuesta: string }): Res<SolicitudPermiso> {
    return this.accesos.rechazar(id, respuesta.trim())
  }
}

export class CatalogoAlcancesUseCase implements UseCase<void, CatalogoAlcances> {
  constructor(private readonly accesos: AccesosRepository) {}
  execute(): Res<CatalogoAlcances> {
    return this.accesos.catalogoAlcances()
  }
}

export class AlcancesDeRolUseCase implements UseCase<number, Alcances> {
  constructor(private readonly accesos: AccesosRepository) {}
  execute(rolId: number): Res<Alcances> {
    return this.accesos.alcancesDeRol(rolId)
  }
}

export class GuardarAlcancesRolUseCase implements UseCase<{ rolId: number; alcances: Alcances }, void> {
  constructor(private readonly accesos: AccesosRepository) {}
  execute({ rolId, alcances }: { rolId: number; alcances: Alcances }): Res<void> {
    return this.accesos.guardarAlcancesRol(rolId, alcances)
  }
}

export class AlcancesDeUsuarioUseCase implements UseCase<number, Alcances> {
  constructor(private readonly accesos: AccesosRepository) {}
  execute(usuarioId: number): Res<Alcances> {
    return this.accesos.alcancesDeUsuario(usuarioId)
  }
}

export class GuardarAlcancesUsuarioUseCase
  implements UseCase<{ usuarioId: number; alcances: Alcances }, void>
{
  constructor(private readonly accesos: AccesosRepository) {}
  execute({ usuarioId, alcances }: { usuarioId: number; alcances: Alcances }): Res<void> {
    return this.accesos.guardarAlcancesUsuario(usuarioId, alcances)
  }
}

// --- Auditoría ---

export class ListarAuditoriaUseCase implements UseCase<FiltroAuditoria, PaginaAuditoria> {
  constructor(private readonly auditoria: AuditoriaRepository) {}
  async execute(filtro: FiltroAuditoria): Res<PaginaAuditoria> {
    if (filtro.desde && filtro.hasta && filtro.hasta < filtro.desde) {
      return left(new ValidationFailure('La fecha final no puede ser anterior a la inicial.'))
    }
    return this.auditoria.listar(filtro)
  }
}

export class DetalleAuditoriaUseCase implements UseCase<number, DetalleAuditoria> {
  constructor(private readonly auditoria: AuditoriaRepository) {}
  execute(id: number): Res<DetalleAuditoria> {
    return this.auditoria.detalle(id)
  }
}

export class ResumenAuditoriaUseCase implements UseCase<void, ResumenAuditoria> {
  constructor(private readonly auditoria: AuditoriaRepository) {}
  execute(): Res<ResumenAuditoria> {
    return this.auditoria.resumen()
  }
}

export class EntidadesAuditoriaUseCase implements UseCase<void, string[]> {
  constructor(private readonly auditoria: AuditoriaRepository) {}
  execute(): Res<string[]> {
    return this.auditoria.entidades()
  }
}

export class DepurarAuditoriaUseCase implements UseCase<string, number> {
  constructor(private readonly auditoria: AuditoriaRepository) {}
  async execute(hasta: string): Res<number> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      return left(new ValidationFailure('Indica hasta qué fecha se depura.'))
    }
    return this.auditoria.depurar(hasta)
  }
}
