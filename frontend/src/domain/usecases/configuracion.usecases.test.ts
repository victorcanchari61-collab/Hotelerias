import { describe, expect, it } from 'vitest'
import { FakeAccesosRepository, FakeAuditoriaRepository, FakeEmpresaRepository, FakeRolRepository, FakeSedeAdminRepository } from '@/test/fakesConfiguracion'
import {
  AprobarSolicitudUseCase,
  ConcederPermisoUseCase,
  CrearRolUseCase,
  CrearSedeUseCase,
  DepurarAuditoriaUseCase,
  GuardarEmpresaUseCase,
  ListarAuditoriaUseCase,
} from './configuracion.usecases'

const AHORA = new Date('2026-11-01T10:00:00Z')
const ahora = () => AHORA

describe('roles', () => {
  it('recorta el nombre y no envía uno vacío', async () => {
    const repo = new FakeRolRepository()
    const uc = new CrearRolUseCase(repo)

    expect((await uc.execute({ nombre: '   ', descripcion: '', activo: true })).isLeft()).toBe(true)
    expect(repo.creados).toHaveLength(0)

    await uc.execute({ nombre: '  Concierge ', descripcion: ' Atención ', activo: true })
    expect(repo.creados[0]).toEqual({ nombre: 'Concierge', descripcion: 'Atención', activo: true })
  })
})

describe('empresa', () => {
  const base = {
    razonSocial: '', nombreComercial: 'Hotel Velothr', ruc: '', direccion: '', departamento: '',
    provincia: '', distrito: '', telefono: '', email: '', sitioWeb: '', representanteLegal: '',
  }

  it('el RUC, si se escribe, debe tener 11 dígitos', async () => {
    const repo = new FakeEmpresaRepository()
    const uc = new GuardarEmpresaUseCase(repo)

    for (const ruc of ['123', '2012345678a', '201234567890']) {
      expect((await uc.execute({ ...base, ruc })).isLeft(), ruc).toBe(true)
    }
    expect((await uc.execute({ ...base, ruc: '20123456789' })).isRight()).toBe(true)
    expect((await uc.execute({ ...base, ruc: '' })).isRight()).toBe(true) // opcional
    expect(repo.guardados).toHaveLength(2)
  })

  it('exige nombre comercial y un correo válido si lo hay', async () => {
    const uc = new GuardarEmpresaUseCase(new FakeEmpresaRepository())
    expect((await uc.execute({ ...base, nombreComercial: ' ' })).isLeft()).toBe(true)
    expect((await uc.execute({ ...base, email: 'no-es-correo' })).isLeft()).toBe(true)
  })
})

describe('sedes', () => {
  it('valida estrellas y limpia los servicios', async () => {
    const repo = new FakeSedeAdminRepository()
    const uc = new CrearSedeUseCase(repo)
    const sede = {
      nombre: 'Cusco', ciudad: 'Cusco', direccion: '', descripcion: '', estrellas: 5, imagen: 'andino',
      servicios: [' Spa ', '', '  ', 'Mayordomo'], activo: true,
    }

    expect((await uc.execute({ ...sede, estrellas: 6 })).isLeft()).toBe(true)
    expect((await uc.execute({ ...sede, ciudad: ' ' })).isLeft()).toBe(true)

    await uc.execute(sede)
    expect(repo.creadas[0].servicios).toEqual(['Spa', 'Mayordomo'])
  })
})

describe('accesos', () => {
  const conceder = { usuarioId: 5, submodulo: 'reservas.reservas', accion: 'anular', vigencia: 'una_vez' as const, expiraEn: null, motivo: ' x ' }

  it('un permiso temporal necesita un vencimiento futuro', async () => {
    const repo = new FakeAccesosRepository()
    const uc = new ConcederPermisoUseCase(repo, ahora)

    const sinFecha = await uc.execute({ ...conceder, vigencia: 'temporal' })
    const pasado = await uc.execute({ ...conceder, vigencia: 'temporal', expiraEn: '2026-10-01T00:00:00Z' })
    expect(sinFecha.isLeft() && pasado.isLeft()).toBe(true)
    expect(repo.concedidas).toHaveLength(0)

    const ok = await uc.execute({ ...conceder, vigencia: 'temporal', expiraEn: '2026-11-02T00:00:00Z' })
    expect(ok.isRight()).toBe(true)
  })

  it('fuera de "temporal" la fecha no viaja', async () => {
    const repo = new FakeAccesosRepository()
    await new ConcederPermisoUseCase(repo, ahora).execute({ ...conceder, vigencia: 'permanente', expiraEn: '2026-12-01T00:00:00Z' })
    expect(repo.concedidas[0].expiraEn).toBeNull()
    expect(repo.concedidas[0].motivo).toBe('x')
  })

  it('exige persona y permiso', async () => {
    const uc = new ConcederPermisoUseCase(new FakeAccesosRepository(), ahora)
    expect((await uc.execute({ ...conceder, usuarioId: 0 })).isLeft()).toBe(true)
    expect((await uc.execute({ ...conceder, accion: '' })).isLeft()).toBe(true)
  })

  it('aprobar como temporal sin fecha futura no llega al servidor', async () => {
    const repo = new FakeAccesosRepository()
    const uc = new AprobarSolicitudUseCase(repo, ahora)

    expect((await uc.execute({ id: 1, vigencia: 'temporal', expiraEn: null, respuesta: '' })).isLeft()).toBe(true)
    expect(repo.aprobadas).toHaveLength(0)

    await uc.execute({ id: 1, vigencia: 'permanente', expiraEn: '2099-01-01T00:00:00Z', respuesta: ' ok ' })
    expect(repo.aprobadas[0]).toMatchObject({ vigencia: 'permanente', expiraEn: null, respuesta: 'ok' })
  })
})

describe('auditoría', () => {
  const filtro = { entidad: '', accion: '' as const, desde: '', hasta: '', buscar: '', pagina: 1, porPagina: 25 }

  it('un rango de fechas invertido no llega al servidor', async () => {
    const repo = new FakeAuditoriaRepository()
    const uc = new ListarAuditoriaUseCase(repo)

    expect((await uc.execute({ ...filtro, desde: '2026-11-10', hasta: '2026-11-01' })).isLeft()).toBe(true)
    expect(repo.filtros).toHaveLength(0)
    expect((await uc.execute({ ...filtro, desde: '2026-11-01', hasta: '2026-11-10' })).isRight()).toBe(true)
  })

  it('depurar exige una fecha bien escrita', async () => {
    const repo = new FakeAuditoriaRepository()
    const uc = new DepurarAuditoriaUseCase(repo)

    expect((await uc.execute('')).isLeft()).toBe(true)
    expect((await uc.execute('01/11/2026')).isLeft()).toBe(true)
    expect(repo.depuradas).toHaveLength(0)

    const r = await uc.execute('2026-08-01')
    expect(r.isRight() && r.value).toBe(4)
  })
})
