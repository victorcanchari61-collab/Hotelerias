import { describe, expect, it } from 'vitest'
import { AuthenticationFailure, CacheFailure, NetworkFailure, NotFoundFailure, ServerFailure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import { FakeAuthRepository, FakeSessionRepository, FakeUsuarioRepository, inputDe, sesionDe, usuarioDe } from '@/test/fakes'
import { LoginUseCase, LogoutUseCase, RestoreSessionUseCase } from './auth.usecases'
import {
  ActualizarUsuarioUseCase,
  CambiarEstadoUsuarioUseCase,
  CrearUsuarioUseCase,
  EliminarUsuarioUseCase,
} from './usuario.usecases'

describe('LoginUseCase', () => {
  function montar() {
    const auth = new FakeAuthRepository()
    const session = new FakeSessionRepository()
    return { auth, session, uc: new LoginUseCase(auth, session) }
  }

  it.each([
    ['correo vacío', '', 'secreta', 'Escribe tu correo.'],
    ['solo espacios', '   ', 'secreta', 'Escribe tu correo.'],
    ['correo sin formato', 'ana', 'secreta', 'El correo no tiene un formato válido.'],
    ['sin contraseña', 'ana@hotel.pe', '', 'Escribe tu contraseña.'],
  ])('rechaza %s SIN ir al servidor', async (_n, email, password, mensaje) => {
    const { auth, session, uc } = montar()
    const r = await uc.execute({ credenciales: { email, password }, recordar: true })

    expect(r.isLeft() && r.value.kind).toBe('validation')
    expect(r.isLeft() && r.value.message).toBe(mensaje)
    expect(auth.loginCalls).toHaveLength(0)
    expect(session.stored).toBeNull()
  })

  it('autentica, guarda la sesión con la preferencia de "recordar" y la devuelve', async () => {
    const { auth, session, uc } = montar()
    const r = await uc.execute({ credenciales: { email: ' ana@hotel.pe ', password: 'x' }, recordar: false })

    expect(r.isRight()).toBe(true)
    expect(auth.loginCalls[0].email).toBe('ana@hotel.pe') // sin espacios
    expect(session.stored?.token).toBe('tok-123')
    expect(session.recordar).toBe(false)
  })

  it('si el servidor rechaza, NO guarda nada', async () => {
    const { auth, session, uc } = montar()
    auth.loginResult = left(new AuthenticationFailure('Email o contraseña incorrectos'))

    const r = await uc.execute({ credenciales: { email: 'a@b.pe', password: 'mal' }, recordar: true })
    expect(r.isLeft() && r.value.message).toBe('Email o contraseña incorrectos')
    expect(session.stored).toBeNull()
  })

  it('si no se puede guardar la sesión es un fallo, no un login "a medias"', async () => {
    const { session, uc } = montar()
    session.guardarResult = left(new CacheFailure('cuota'))

    const r = await uc.execute({ credenciales: { email: 'a@b.pe', password: 'x' }, recordar: true })
    expect(r.isLeft() && r.value.kind).toBe('cache')
  })
})

describe('RestoreSessionUseCase', () => {
  function montar() {
    const auth = new FakeAuthRepository()
    const session = new FakeSessionRepository()
    return { auth, session, uc: new RestoreSessionUseCase(auth, session) }
  }

  it('sin sesión guardada devuelve null (no es un error) y no llama al servidor', async () => {
    const { auth, uc } = montar()
    const r = await uc.execute()
    expect(r.isRight() && r.value).toBeNull()
    expect(auth.meCalls).toBe(0)
  })

  it('con sesión válida refresca el usuario con lo que dice el servidor', async () => {
    const { auth, session, uc } = montar()
    session.stored = sesionDe({ usuario: usuarioDe({ nombre: 'Viejo' }) })
    auth.meResult = right(usuarioDe({ nombre: 'Actualizado' }))

    const r = await uc.execute()
    expect(r.isRight() && r.value?.usuario.nombre).toBe('Actualizado')
    expect(session.stored?.usuario.nombre).toBe('Actualizado')
    expect(session.stored?.token).toBe('tok-123') // el token no cambia
  })

  it.each([
    ['token vencido (401)', new AuthenticationFailure('vencido')],
    ['cuenta eliminada (404)', new NotFoundFailure('Usuario no encontrado')],
  ])('%s: limpia la sesión guardada', async (_n, failure) => {
    const { auth, session, uc } = montar()
    session.stored = sesionDe()
    auth.meResult = left(failure)

    const r = await uc.execute()
    expect(r.isRight() && r.value).toBeNull()
    expect(session.stored).toBeNull()
  })

  it.each([
    ['sin red', new NetworkFailure('sin conexión')],
    ['servidor caído', new ServerFailure('500')],
  ])('%s: NO saca a la persona de su sesión', async (_n, failure) => {
    const { auth, session, uc } = montar()
    session.stored = sesionDe()
    auth.meResult = left(failure)

    const r = await uc.execute()
    expect(r.isRight() && r.value?.token).toBe('tok-123')
    expect(session.stored).not.toBeNull()
  })
})

describe('LogoutUseCase', () => {
  it('limpia la sesión', async () => {
    const session = new FakeSessionRepository()
    session.stored = sesionDe()
    const r = await new LogoutUseCase(session).execute()
    expect(r.isRight()).toBe(true)
    expect(session.stored).toBeNull()
  })
})

describe('casos de uso de usuarios', () => {
  it('crear: valida nombre, correo, contraseña y largo mínimo ANTES de llamar al repositorio', async () => {
    const repo = new FakeUsuarioRepository()
    const uc = new CrearUsuarioUseCase(repo)

    const casos: Array<[string, Parameters<typeof inputDe>[0], string]> = [
      ['nombre', { nombre: '  ' }, 'El nombre es obligatorio.'],
      ['correo vacío', { email: '' }, 'El correo es obligatorio.'],
      ['correo inválido', { email: 'sin-arroba' }, 'El correo no tiene un formato válido.'],
      ['contraseña', { password: '' }, 'La contraseña es obligatoria.'],
      ['contraseña corta', { password: '1234567' }, 'La contraseña debe tener al menos 8 caracteres.'],
    ]
    for (const [, parcial, mensaje] of casos) {
      const r = await uc.execute(inputDe(parcial))
      expect(r.isLeft() && r.value.message).toBe(mensaje)
    }
    expect(repo.creados).toHaveLength(0)
  })

  it('crear: normaliza espacios y delega', async () => {
    const repo = new FakeUsuarioRepository()
    const r = await new CrearUsuarioUseCase(repo).execute(
      inputDe({ nombre: '  Luis ', email: ' luis@hotel.pe ' }),
    )
    expect(r.isRight()).toBe(true)
    expect(repo.creados[0]).toMatchObject({ nombre: 'Luis', email: 'luis@hotel.pe' })
  })

  it('actualizar: contraseña vacía significa "no la cambies" y no viaja', async () => {
    const repo = new FakeUsuarioRepository()
    const uc = new ActualizarUsuarioUseCase(repo)

    await uc.execute({ id: 5, datos: inputDe({ password: '' }) })
    expect('password' in repo.actualizados[0].input).toBe(false)

    await uc.execute({ id: 5, datos: inputDe({ password: 'nueva-clave-1' }) })
    expect(repo.actualizados[1].input.password).toBe('nueva-clave-1')
  })

  it('actualizar: una contraseña nueva corta sí se rechaza', async () => {
    const repo = new FakeUsuarioRepository()
    const r = await new ActualizarUsuarioUseCase(repo).execute({ id: 5, datos: inputDe({ password: 'corta' }) })
    expect(r.isLeft()).toBe(true)
    expect(repo.actualizados).toHaveLength(0)
  })

  it('cambiar estado y eliminar delegan en el repositorio', async () => {
    const repo = new FakeUsuarioRepository()
    repo.lista = [usuarioDe({ id: 5, activo: true })]

    const estado = await new CambiarEstadoUsuarioUseCase(repo).execute({ id: 5, activo: false })
    expect(estado.isRight() && estado.value).toBe(false)

    await new EliminarUsuarioUseCase(repo).execute(5)
    expect(repo.eliminados).toEqual([5])
  })
})
