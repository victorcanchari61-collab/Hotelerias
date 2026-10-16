/** Dobles del módulo de Configuración (misma interfaz que los reales). */
import { NotFoundFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
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
} from '@/domain/entities/Configuracion'
import type {
  AccesosRepository,
  AuditoriaRepository,
  EmpresaRepository,
  RolRepository,
  SedeAdminRepository,
} from '@/domain/repositories/ConfiguracionRepository'

export function rolDe(parcial: Partial<Rol> = {}): Rol {
  return {
    id: 2,
    nombre: 'Recepcionista',
    descripcion: '',
    activo: true,
    delSistema: false,
    accesoTotal: false,
    creadoEn: null,
    usuarios: 0,
    permisos: [],
    ...parcial,
  }
}

export function sedeAdminDe(parcial: Partial<SedeAdmin> = {}): SedeAdmin {
  return {
    id: 1,
    nombre: 'Velothr Miraflores',
    ciudad: 'Lima',
    direccion: '',
    descripcion: '',
    estrellas: 5,
    imagen: 'ciudad',
    servicios: [],
    activo: true,
    habitaciones: 3,
    reservasVigentes: 0,
    ...parcial,
  }
}

export function solicitudDe(parcial: Partial<SolicitudPermiso> = {}): SolicitudPermiso {
  return {
    id: 1,
    usuarioId: 5,
    usuario: 'Pepe Rojas',
    submodulo: 'reservas.reservas',
    accion: 'anular',
    motivo: 'La emití mal',
    referencia: '',
    estado: 'pendiente',
    fechaSolicitud: null,
    fechaResolucion: null,
    respuesta: '',
    ...parcial,
  }
}

export class FakeRolRepository implements RolRepository {
  lista: Rol[] = [rolDe()]
  creados: RolInput[] = []
  permisosGuardados: Array<{ id: number; permisos: string[] }> = []
  eliminados: number[] = []

  async listar() {
    return right<Rol[], Failure>([...this.lista])
  }
  async crear(input: RolInput) {
    this.creados.push(input)
    const nuevo = rolDe({ id: 90 + this.creados.length, ...input })
    this.lista.push(nuevo)
    return right<Rol, Failure>(nuevo)
  }
  async actualizar(id: number, input: RolInput) {
    this.lista = this.lista.map((r) => (r.id === id ? { ...r, ...input } : r))
    return right<Rol, Failure>(this.lista.find((r) => r.id === id)!)
  }
  async guardarPermisos(id: number, permisos: string[]) {
    this.permisosGuardados.push({ id, permisos })
    this.lista = this.lista.map((r) => (r.id === id ? { ...r, permisos } : r))
    return right<Rol, Failure>(this.lista.find((r) => r.id === id)!)
  }
  async eliminar(id: number) {
    this.eliminados.push(id)
    this.lista = this.lista.filter((r) => r.id !== id)
    return right<void, Failure>(undefined)
  }
}

export class FakeEmpresaRepository implements EmpresaRepository {
  datos: Empresa = {
    razonSocial: '',
    nombreComercial: 'Hotel Velothr',
    ruc: '',
    direccion: '',
    departamento: '',
    provincia: '',
    distrito: '',
    telefono: '',
    email: '',
    sitioWeb: '',
    representanteLegal: '',
    actualizadoEn: null,
  }
  guardados: EmpresaInput[] = []

  async obtener() {
    return right<Empresa, Failure>(this.datos)
  }
  async guardar(input: EmpresaInput) {
    this.guardados.push(input)
    this.datos = { ...this.datos, ...input }
    return right<Empresa, Failure>(this.datos)
  }
}

export class FakeSedeAdminRepository implements SedeAdminRepository {
  lista: SedeAdmin[] = [sedeAdminDe()]
  creadas: SedeInput[] = []

  async listar() {
    return right<SedeAdmin[], Failure>([...this.lista])
  }
  async crear(input: SedeInput) {
    this.creadas.push(input)
    const s = sedeAdminDe({ id: 50 + this.creadas.length, ...input })
    this.lista.push(s)
    return right<SedeAdmin, Failure>(s)
  }
  async actualizar(id: number, input: SedeInput) {
    this.lista = this.lista.map((s) => (s.id === id ? { ...s, ...input } : s))
    return right<SedeAdmin, Failure>(this.lista.find((s) => s.id === id)!)
  }
}

export class FakeAccesosRepository implements AccesosRepository {
  excepciones: Excepcion[] = []
  bandejaLista: SolicitudPermiso[] = [solicitudDe()]
  alcancesRol: Alcances = {}
  alcancesGuardadosRol: Array<{ rolId: number; alcances: Alcances }> = []
  solicitadas: SolicitarInput[] = []
  aprobadas: AprobarInput[] = []
  rechazadas: Array<{ id: number; respuesta: string }> = []
  concedidas: ConcederInput[] = []
  revocadas: number[] = []
  catalogo: CatalogoAlcances = { submodulos: ['reservas.reservas'], niveles: ['todas', 'mis_sedes'] }

  async excepcionesDe() {
    return right<Excepcion[], Failure>([...this.excepciones])
  }
  async conceder(input: ConcederInput) {
    this.concedidas.push(input)
    return right<Excepcion, Failure>({
      id: 1,
      usuarioId: input.usuarioId,
      submodulo: input.submodulo,
      accion: input.accion,
      vigencia: input.vigencia,
      expiraEn: null,
      usos: 0,
      revocado: false,
      motivo: input.motivo,
      otorgadoPor: 'Admin',
      fechaOtorgado: null,
      vigente: true,
    })
  }
  async revocar(id: number) {
    this.revocadas.push(id)
    return right<void, Failure>(undefined)
  }
  async solicitar(input: SolicitarInput) {
    this.solicitadas.push(input)
    return right<SolicitudPermiso, Failure>(solicitudDe({ ...input }))
  }
  async misSolicitudes() {
    return right<SolicitudPermiso[], Failure>([])
  }
  async bandeja() {
    return right<SolicitudPermiso[], Failure>([...this.bandejaLista])
  }
  async aprobar(input: AprobarInput): Promise<Either<Failure, SolicitudPermiso>> {
    this.aprobadas.push(input)
    this.bandejaLista = this.bandejaLista.filter((s) => s.id !== input.id)
    return right(solicitudDe({ id: input.id, estado: 'aprobada' }))
  }
  async rechazar(id: number, respuesta: string): Promise<Either<Failure, SolicitudPermiso>> {
    this.rechazadas.push({ id, respuesta })
    this.bandejaLista = this.bandejaLista.filter((s) => s.id !== id)
    return right(solicitudDe({ id, estado: 'rechazada' }))
  }
  async catalogoAlcances() {
    return right<CatalogoAlcances, Failure>(this.catalogo)
  }
  async alcancesDeRol() {
    return right<Alcances, Failure>({ ...this.alcancesRol })
  }
  async guardarAlcancesRol(rolId: number, alcances: Alcances) {
    this.alcancesGuardadosRol.push({ rolId, alcances })
    return right<void, Failure>(undefined)
  }
  async alcancesDeUsuario() {
    return right<Alcances, Failure>({})
  }
  async guardarAlcancesUsuario() {
    return right<void, Failure>(undefined)
  }
}

export class FakeAuditoriaRepository implements AuditoriaRepository {
  filtros: FiltroAuditoria[] = []
  depuradas: string[] = []

  async listar(filtro: FiltroAuditoria) {
    this.filtros.push(filtro)
    return right<PaginaAuditoria, Failure>({
      items: [
        {
          id: 1,
          fecha: null,
          usuarioId: 1,
          usuario: 'Super Admin',
          entidad: 'Rol',
          entidadId: '3',
          accion: 'ACTUALIZADO',
        },
      ],
      total: 1,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    })
  }
  async detalle(id: number): Promise<Either<Failure, DetalleAuditoria>> {
    if (id !== 1) return left(new NotFoundFailure('No existe'))
    return right({
      id: 1,
      fecha: null,
      usuarioId: 1,
      usuario: 'Super Admin',
      entidad: 'Rol',
      entidadId: '3',
      accion: 'ACTUALIZADO',
      valoresAnteriores: { nombre: 'Housekeeping' },
      valoresNuevos: { nombre: 'Limpieza' },
    })
  }
  async resumen() {
    return right<ResumenAuditoria, Failure>({ total: 1, creados: 0, actualizados: 1, eliminados: 0, ultimo: null })
  }
  async entidades() {
    return right<string[], Failure>(['Rol', 'Usuario'])
  }
  async depurar(hasta: string) {
    this.depuradas.push(hasta)
    return right<number, Failure>(4)
  }
}
