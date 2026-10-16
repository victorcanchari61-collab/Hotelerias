import { describe, expect, it } from 'vitest'
import { ValidationFailure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import {
  FakeClienteRepository,
  FakePortalRepository,
  clienteDe,
  habitacionDe,
  reservaDe,
} from '@/test/fakesPortal'
import { MemoryStorage } from '@/test/fakes'
import { BrowserClienteSessionLocalDataSource } from '@/data/datasources/ClienteSessionLocalDataSource'
import { ClienteSessionRepositoryImpl } from '@/data/repositories/ClienteRepositoryImpl'
import {
  LoginClienteUseCase,
  RegistrarClienteUseCase,
  RestaurarSesionClienteUseCase,
} from './cliente.usecases'
import {
  AsignarTipoClienteUseCase,
  CrearPromocionUseCase,
  CrearTipoClienteUseCase,
  validarPromocion,
} from './gestion.usecases'
import {
  BuscarEstadiaUseCase,
  CotizarEstadiaUseCase,
  MAX_NOCHES,
  ReservarEstadiaUseCase,
  validarEstadia,
} from './portal.usecases'

const HOY = '2026-11-01'
const hoy = () => HOY

const busqueda = { entrada: '2026-11-10', salida: '2026-11-12', huespedes: 2 }

describe('validarEstadia', () => {
  it('una estadía normal es válida', () => {
    expect(validarEstadia(busqueda, HOY)).toBeNull()
  })

  it('entrar hoy está permitido; ayer no', () => {
    expect(validarEstadia({ ...busqueda, entrada: HOY, salida: '2026-11-02' }, HOY)).toBeNull()
    expect(validarEstadia({ ...busqueda, entrada: '2026-10-31' }, HOY)).toBeInstanceOf(ValidationFailure)
  })

  it('la salida debe ser posterior a la entrada', () => {
    expect(validarEstadia({ ...busqueda, salida: busqueda.entrada }, HOY)).toBeInstanceOf(ValidationFailure)
    expect(validarEstadia({ ...busqueda, salida: '2026-11-09' }, HOY)).toBeInstanceOf(ValidationFailure)
  })

  it(`no pasa de ${MAX_NOCHES} noches`, () => {
    expect(validarEstadia({ ...busqueda, entrada: '2026-11-01', salida: '2026-12-01' }, HOY)).toBeNull() // 30
    expect(validarEstadia({ ...busqueda, entrada: '2026-11-01', salida: '2026-12-02' }, HOY)).toBeInstanceOf(
      ValidationFailure,
    )
  })

  it('fechas vacías o mal escritas', () => {
    expect(validarEstadia({ ...busqueda, entrada: '' }, HOY)).toBeInstanceOf(ValidationFailure)
    expect(validarEstadia({ ...busqueda, salida: '2026-02-31' }, HOY)).toBeInstanceOf(ValidationFailure)
    expect(validarEstadia({ ...busqueda, entrada: '10/11/2026' }, HOY)).toBeInstanceOf(ValidationFailure)
  })

  it('huéspedes: entero, al menos 1 y con tope', () => {
    for (const huespedes of [0, -1, 1.5, 11]) {
      expect(validarEstadia({ ...busqueda, huespedes }, HOY), String(huespedes)).toBeInstanceOf(ValidationFailure)
    }
  })
})

describe('CotizarEstadia y ReservarEstadia', () => {
  const solicitud = {
    tipoHabitacionId: 10,
    checkIn: '2026-11-10',
    checkOut: '2026-11-12',
    huespedes: 2,
    codigo: '  bienvenido10 ',
    notas: '  llego tarde ',
  }

  it('cotizar normaliza el código (mayúsculas, sin espacios) y no manda importes', async () => {
    const portal = new FakePortalRepository()
    const r = await new CotizarEstadiaUseCase(portal, hoy).execute(solicitud)

    expect(r.isRight()).toBe(true)
    expect(portal.cotizaciones[0].codigo).toBe('BIENVENIDO10')
  })

  it('unas fechas inválidas no llegan al servidor', async () => {
    const portal = new FakePortalRepository()
    const r = await new CotizarEstadiaUseCase(portal, hoy).execute({ ...solicitud, checkIn: '2026-10-01' })

    expect(r.isLeft()).toBe(true)
    expect(portal.cotizaciones).toHaveLength(0)
  })

  it('una habitación sin elegir no llega al servidor', async () => {
    const portal = new FakePortalRepository()
    const r = await new ReservarEstadiaUseCase(portal, hoy).execute({ ...solicitud, tipoHabitacionId: 0 })

    expect(r.isLeft()).toBe(true)
    expect(portal.reservas).toHaveLength(0)
  })

  it('reservar manda la solicitud normalizada', async () => {
    const portal = new FakePortalRepository()
    const r = await new ReservarEstadiaUseCase(portal, hoy).execute(solicitud)

    expect(r.isRight()).toBe(true)
    expect(portal.reservas[0]).toMatchObject({ codigo: 'BIENVENIDO10', notas: 'llego tarde' })
  })

  it('un fallo del servidor (sin cupo) sube tal cual, sin esconderse', async () => {
    const portal = new FakePortalRepository()
    portal.reservaResult = left(new ValidationFailure('Ya no quedan habitaciones'))

    const r = await new ReservarEstadiaUseCase(portal, hoy).execute(solicitud)
    expect(r.isLeft()).toBe(true)
    expect(r.isLeft() && r.value.message).toBe('Ya no quedan habitaciones')
  })
})

describe('BuscarEstadia', () => {
  it('cotiza solo lo que tiene disponibilidad', async () => {
    const portal = new FakePortalRepository()
    portal.habitaciones = [habitacionDe({ id: 10 }), habitacionDe({ id: 11, nombre: 'Suite' })]
    portal.disponibles.set(11, 0) // agotada

    const r = await new BuscarEstadiaUseCase(portal, hoy).execute({ sedeId: 1, busqueda, codigo: '' })

    expect(r.isRight()).toBe(true)
    const opciones = r.isRight() ? r.value : []
    expect(opciones).toHaveLength(2)
    expect(opciones[0].cotizacion?.totalCent).toBe(76000)
    expect(opciones[1].habitacion.disponibles).toBe(0)
    expect(opciones[1].cotizacion).toBeNull()
    expect(portal.cotizaciones.map((c) => c.tipoHabitacionId)).toEqual([10]) // la agotada no se cotizó
  })

  it('una cotización que falla no tumba la búsqueda', async () => {
    const portal = new FakePortalRepository()
    portal.cotizar = async () => left(new ValidationFailure('boom'))

    const r = await new BuscarEstadiaUseCase(portal, hoy).execute({ sedeId: 1, busqueda, codigo: '' })

    expect(r.isRight()).toBe(true)
    expect(r.isRight() && r.value[0].cotizacion).toBeNull()
    expect(r.isRight() && r.value[0].habitacion.disponibles).toBe(5)
  })

  it('fechas inválidas: ni siquiera pregunta la disponibilidad', async () => {
    const portal = new FakePortalRepository()
    const r = await new BuscarEstadiaUseCase(portal, hoy).execute({
      sedeId: 1,
      busqueda: { ...busqueda, salida: busqueda.entrada },
      codigo: '',
    })

    expect(r.isLeft()).toBe(true)
    expect(portal.disponibilidades).toHaveLength(0)
  })
})

describe('sesión del huésped', () => {
  function armar() {
    const clientes = new FakeClienteRepository()
    const storage = new MemoryStorage()
    const session = new ClienteSessionRepositoryImpl(new BrowserClienteSessionLocalDataSource(storage))
    return { clientes, session, storage }
  }

  it('registrarse valida antes de ir al servidor', async () => {
    const { clientes, session } = armar()
    const uc = new RegistrarClienteUseCase(clientes, session)
    const base = { nombre: 'Ana', apellido: '', email: 'ana@correo.pe', password: 'larga-clave-1', telefono: '', pais: '' }

    for (const cambio of [{ nombre: ' ' }, { email: 'sin-arroba' }, { password: 'corta' }]) {
      const r = await uc.execute({ ...base, ...cambio })
      expect(r.isLeft(), JSON.stringify(cambio)).toBe(true)
    }
    expect(clientes.registroCalls).toHaveLength(0)

    const ok = await uc.execute(base)
    expect(ok.isRight()).toBe(true)
    expect(clientes.registroCalls).toHaveLength(1)
    expect(session.cargar()?.token).toBe('tok-cliente') // quedó con sesión
  })

  it('un login correcto guarda la sesión; uno malo no guarda nada', async () => {
    const { clientes, session } = armar()
    const uc = new LoginClienteUseCase(clientes, session)

    const mala = await uc.execute({ email: 'lucia@correo.pe', password: 'incorrecta' })
    expect(mala.isLeft()).toBe(true)
    expect(session.cargar()).toBeNull()

    const buena = await uc.execute({ email: 'lucia@correo.pe', password: 'clave-correcta' })
    expect(buena.isRight()).toBe(true)
    expect(session.cargar()?.cliente.nombre).toBe('Lucía')
  })

  it('al restaurar, el servidor manda: refleja su categoría actual', async () => {
    const { clientes, session } = armar()
    session.guardar({ token: 't', cliente: clienteDe({ tipoCliente: 'Regular' }) })
    clientes.cliente = clienteDe({ tipoCliente: 'VIP', descuentoPct: 10 })

    const r = await new RestaurarSesionClienteUseCase(clientes, session).execute()

    expect(r.isRight() && r.value?.cliente.tipoCliente).toBe('VIP')
    expect(session.cargar()?.cliente.tipoCliente).toBe('VIP')
  })

  it('una sesión guardada que el servidor ya no reconoce se descarta', async () => {
    const { clientes, session } = armar()
    session.guardar({ token: 't', cliente: clienteDe() })
    clientes.me = async () => left(new (await import('@/core/errors/failures')).AuthenticationFailure('vencida'))

    const r = await new RestaurarSesionClienteUseCase(clientes, session).execute()

    expect(r.isRight() && r.value).toBeNull()
    expect(session.cargar()).toBeNull()
  })

  it('sin red NO se la saca de su sesión', async () => {
    const { clientes, session } = armar()
    session.guardar({ token: 't', cliente: clienteDe() })
    clientes.me = async () => left(new (await import('@/core/errors/failures')).NetworkFailure('sin red'))

    const r = await new RestaurarSesionClienteUseCase(clientes, session).execute()

    expect(r.isRight() && r.value?.token).toBe('t')
    expect(session.cargar()).not.toBeNull()
  })

  it('un token corrupto en el almacenamiento no la deja atascada', () => {
    const { session, storage } = armar()
    storage.setItem('hotelerias.cliente.token', 't')
    storage.setItem('hotelerias.cliente.perfil', '{no es json')

    expect(session.cargar()).toBeNull()
    expect(storage.getItem('hotelerias.cliente.token')).toBeNull() // se limpió
  })
})

describe('gestión del personal', () => {
  const promo = {
    nombre: 'Verano',
    descripcion: '',
    tipo: 'porcentaje' as const,
    porcentaje: 12,
    montoNocheCent: null,
    codigo: null,
    sedeId: null,
    tipoClienteId: null,
    desde: '2026-12-01',
    hasta: '2027-03-31',
    minNoches: 2,
    activo: true,
  }

  it('validarPromocion', () => {
    expect(validarPromocion(promo)).toBeNull()
    expect(validarPromocion({ ...promo, nombre: ' ' })).toBeInstanceOf(ValidationFailure)
    expect(validarPromocion({ ...promo, hasta: '2026-11-30' })).toBeInstanceOf(ValidationFailure)
    expect(validarPromocion({ ...promo, porcentaje: 0 })).toBeInstanceOf(ValidationFailure)
    expect(validarPromocion({ ...promo, porcentaje: 101 })).toBeInstanceOf(ValidationFailure)
    expect(validarPromocion({ ...promo, minNoches: 0 })).toBeInstanceOf(ValidationFailure)
    expect(
      validarPromocion({ ...promo, tipo: 'monto_noche', porcentaje: null, montoNocheCent: 0 }),
    ).toBeInstanceOf(ValidationFailure)
    expect(
      validarPromocion({ ...promo, tipo: 'monto_noche', porcentaje: null, montoNocheCent: 8000 }),
    ).toBeNull()
  })

  it('crear una oferta deja solo el valor del tipo y el código normalizado', async () => {
    const enviados: unknown[] = []
    const repo = {
      listar: async () => left(new ValidationFailure('x')),
      crear: async (i: unknown) => {
        enviados.push(i)
        return left(new ValidationFailure('detenido'))
      },
      actualizar: async () => left(new ValidationFailure('x')),
    }

    await new CrearPromocionUseCase(repo as never).execute({
      ...promo,
      codigo: ' verano12 ',
      montoNocheCent: 5000, // sobra: el tipo es porcentaje
    })

    expect(enviados[0]).toMatchObject({ codigo: 'VERANO12', porcentaje: 12, montoNocheCent: null })
  })

  it('un tipo de cliente: descuento 0..100 y mínimo ≥ 1 o vacío', async () => {
    const llamadas: unknown[] = []
    const repo = {
      crearTipo: async (i: unknown) => {
        llamadas.push(i)
        return left(new ValidationFailure('detenido'))
      },
    }
    const uc = new CrearTipoClienteUseCase(repo as never)
    const base = { nombre: 'VIP', descripcion: '', descuentoPct: 10, reservasMinimas: 6, orden: 2, activo: true }

    for (const malo of [{ nombre: ' ' }, { descuentoPct: 101 }, { descuentoPct: -1 }, { reservasMinimas: 0 }]) {
      await uc.execute({ ...base, ...malo })
    }
    expect(llamadas).toHaveLength(0)

    await uc.execute({ ...base, reservasMinimas: null }) // solo a mano: válido
    expect(llamadas).toHaveLength(1)
  })

  it('asignar tipo pasa null para volver a la clasificación automática', async () => {
    const llamadas: Array<[number, number | null]> = []
    const repo = {
      asignarTipo: async (c: number, t: number | null) => {
        llamadas.push([c, t])
        return left(new ValidationFailure('x'))
      },
    }
    await new AsignarTipoClienteUseCase(repo as never).execute({ clienteId: 7, tipoId: null })
    expect(llamadas).toEqual([[7, null]])
  })
})

describe('reservaDe', () => {
  it('el helper de pruebas cuadra: total = subtotal − descuento', () => {
    const r = reservaDe({ subtotalCent: 100, descuentoCent: 10, totalCent: 90 })
    expect(r.subtotalCent - r.descuentoCent).toBe(r.totalCent)
  })
})
