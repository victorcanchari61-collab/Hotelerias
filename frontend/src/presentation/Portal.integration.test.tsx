// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createContainer } from '@/di'
import {
  FakeAuthRepository,
  FakePermisoRepository,
  FakeUsuarioRepository,
  MemoryStorage,
  sesionDe,
} from '@/test/fakes'
import {
  FakeClienteRepository,
  FakePortalRepository,
  clienteDe,
  conflicto,
  promocionDe,
  reservaDe,
} from '@/test/fakesPortal'
import { App } from './App'
import { AppProviders } from './AppProviders'

vi.mock('@/lib/realtime', () => ({ useRealtime: () => undefined, suscribirCambios: () => () => undefined }))
vi.mock('@/lib/alertasApi', () => ({ alertaApi: { getAll: async () => [] } }))

afterEach(cleanup)

function Ubicacion() {
  const l = useLocation()
  return <span data-testid="ubicacion">{l.pathname}</span>
}

const BUSQUEDA = 'entrada=2026-11-10&salida=2026-11-12&huespedes=2'

interface Escenario {
  ruta: string
  /** Un huésped que ya tiene sesión al abrir la web. */
  huesped?: boolean
  /** Una sesión de PERSONAL guardada. */
  personal?: boolean
  permisos?: string[]
  /** Prepara los datos de los fakes ANTES de montar (las pantallas cargan al montarse). */
  configurar?: (fakes: { portal: FakePortalRepository; cliente: FakeClienteRepository }) => void
}

function montar({ ruta, huesped = false, personal = false, permisos = [], configurar }: Escenario) {
  const portal = new FakePortalRepository()
  const cliente = new FakeClienteRepository()
  const permiso = new FakePermisoRepository()
  permiso.claves = permisos
  configurar?.({ portal, cliente })

  const storage = { persistent: new MemoryStorage(), ephemeral: new MemoryStorage() }
  if (huesped) {
    storage.persistent.setItem('hotelerias.cliente.token', 'tok-cliente')
    storage.persistent.setItem(
      'hotelerias.cliente.perfil',
      JSON.stringify({ ...cliente.cliente, creadoEn: undefined }),
    )
  }

  const container = createContainer({
    storage,
    hoy: () => '2026-11-01',
    repositories: {
      auth: new FakeAuthRepository(),
      permiso,
      usuario: new FakeUsuarioRepository(),
      portal,
      cliente,
    },
  })
  if (personal) container.session.guardar(sesionDe(), false)

  render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppProviders container={container}>
        <App />
        <Ubicacion />
      </AppProviders>
    </MemoryRouter>,
  )

  return {
    container,
    portal,
    cliente,
    storage,
    ubicacion: () => screen.getByTestId('ubicacion').textContent,
  }
}

async function iniciarSesion(clave = 'clave-correcta') {
  fireEvent.change(await screen.findByLabelText('Correo'), { target: { value: 'lucia@correo.pe' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: clave } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('la web pública', () => {
  describe('como visitante', () => {
    it('ve los hoteles y las ofertas sin tener cuenta', async () => {
      const app = montar({ ruta: '/' })

      expect(await screen.findByText('Velothr Miraflores — Lima')).toBeTruthy() // en el buscador
      expect(await screen.findByText('Escapada de 3 noches')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Ingresar' })).toBeTruthy()
      expect(app.ubicacion()).toBe('/')
    })

    it('ve las habitaciones con su precio, también sin cuenta', async () => {
      montar({ ruta: `/hoteles/1?${BUSQUEDA}` })

      expect(await screen.findByText('Habitación Deluxe')).toBeTruthy()
      // 2 noches × S/ 380.00 = S/ 760.00 (aparece como subtotal y como total).
      expect((await screen.findAllByText(/760\.00/)).length).toBeGreaterThan(0)
      expect(screen.getByText(/necesitas iniciar sesión|tendrás que/)).toBeTruthy()
    })

    it('una habitación agotada se muestra como tal y no se puede reservar', async () => {
      montar({
        ruta: `/hoteles/1?${BUSQUEDA}`,
        configurar: ({ portal }) => portal.disponibles.set(10, 0),
      })

      expect(await screen.findByText('Agotada')).toBeTruthy()
      const boton = screen.getByRole('button', { name: 'No disponible' })
      expect((boton as HTMLButtonElement).disabled).toBe(true)
    })

    it('RESERVAR sin sesión lleva a ingresar, y al entrar vuelve a la reserva a medias', async () => {
      const app = montar({ ruta: `/hoteles/1?${BUSQUEDA}` })

      fireEvent.click(await screen.findByRole('button', { name: 'Reservar' }))

      // Mandado a iniciar sesión: NO se reservó nada.
      expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeTruthy()
      expect(app.ubicacion()).toBe('/ingresar')
      expect(app.portal.reservas).toHaveLength(0)

      await iniciarSesion()

      // De vuelta en la reserva, con lo que había elegido.
      expect(await screen.findByRole('heading', { name: 'Confirma tu reserva' })).toBeTruthy()
      expect(app.ubicacion()).toBe('/reservar')
      expect(app.portal.reservas).toHaveLength(0) // entrar tampoco reserva

      fireEvent.click(await screen.findByRole('button', { name: 'Confirmar reserva' }))

      expect(await screen.findByText('¡Reserva confirmada!')).toBeTruthy()
      expect(app.ubicacion()).toBe('/mis-reservas')
      expect(app.portal.reservas).toHaveLength(1)
      expect(app.portal.reservas[0]).toMatchObject({
        tipoHabitacionId: 10,
        checkIn: '2026-11-10',
        checkOut: '2026-11-12',
        huespedes: 2,
      })
    })

    it('abrir /reservar directamente sin sesión también manda a ingresar', async () => {
      const app = montar({ ruta: `/reservar?hab=10&${BUSQUEDA}` })

      expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeTruthy()
      expect(app.ubicacion()).toBe('/ingresar')
      expect(app.portal.reservas).toHaveLength(0)
    })

    it('mis reservas exige sesión', async () => {
      const app = montar({ ruta: '/mis-reservas' })

      expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeTruthy()
      expect(app.ubicacion()).toBe('/ingresar')
    })

    it('una clave incorrecta muestra el mensaje y no entra', async () => {
      const app = montar({ ruta: '/ingresar' })
      await iniciarSesion('mala')

      expect(await screen.findByText('Email o contraseña incorrectos')).toBeTruthy()
      expect(app.ubicacion()).toBe('/ingresar')
    })

    it('crear la cuenta lo deja con sesión iniciada', async () => {
      const app = montar({ ruta: '/registro' })

      fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Rosa' } })
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'rosa@correo.pe' } })
      fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'una-clave-larga' } })
      fireEvent.click(screen.getByRole('button', { name: /Crear cuenta y continuar/ }))

      await waitFor(() => expect(app.cliente.registroCalls).toHaveLength(1))
      expect(await screen.findByRole('button', { name: 'Salir' })).toBeTruthy()
      await waitFor(() => expect(app.ubicacion()).toBe('/')) // sin "de dónde venía": a la portada
    })

    it('una contraseña corta se avisa sin llegar al servidor', async () => {
      const app = montar({ ruta: '/registro' })

      fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Rosa' } })
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'rosa@correo.pe' } })
      fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'corta' } })
      fireEvent.click(screen.getByRole('button', { name: /Crear cuenta y continuar/ }))

      expect(await screen.findByText(/al menos 8 caracteres/)).toBeTruthy()
      expect(app.cliente.registroCalls).toHaveLength(0)
    })
  })

  describe('como huésped con sesión', () => {
    it('restaura su sesión al abrir y la muestra en la cabecera', async () => {
      const app = montar({ ruta: '/', huesped: true })

      expect(await screen.findByRole('button', { name: 'Salir' })).toBeTruthy()
      expect(screen.getByText('Lucía Vega')).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Ingresar' })).toBeNull()
      expect(app.cliente.meCalls).toBe(1) // validó el token con el servidor
    })

    it('su categoría le da el precio con descuento, y se muestra de dónde sale', async () => {
      montar({
        ruta: `/reservar?hab=10&${BUSQUEDA}`,
        huesped: true,
        configurar: ({ portal }) => {
          portal.descuentoPct = 10
          portal.nombreDescuento = 'Beneficio VIP'
        },
      })

      expect(await screen.findByText('Beneficio VIP')).toBeTruthy()
      // 2 × S/ 380.00 = S/ 760.00; 10% menos = S/ 76.00; total S/ 684.00.
      expect(screen.getByText(/684\.00/)).toBeTruthy()
      expect(screen.getByText(/− S\/\s*76\.00/)).toBeTruthy()
    })

    it('si no queda cupo, lo dice y se queda en la pantalla (no pierde la reserva a medias)', async () => {
      const app = montar({ ruta: `/reservar?hab=10&${BUSQUEDA}`, huesped: true })
      app.portal.reservaResult = conflicto('Ya no quedan habitaciones de ese tipo para esas fechas')

      fireEvent.click(await screen.findByRole('button', { name: 'Confirmar reserva' }))

      expect(await screen.findByText('Ya no quedan habitaciones de ese tipo para esas fechas')).toBeTruthy()
      expect(app.ubicacion()).toBe('/reservar')
    })

    it('lista sus reservas y cancela una pidiendo confirmación', async () => {
      const app = montar({
        ruta: '/mis-reservas',
        huesped: true,
        configurar: ({ portal }) => {
          portal.misReservasLista = [reservaDe({ checkIn: '2099-01-10', checkOut: '2099-01-12' })]
        },
      })

      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva' }))

      expect(app.portal.cancelaciones).toHaveLength(0) // todavía no: falta confirmar
      const dialogo = await screen.findByRole('dialog')
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar reserva' }))

      await waitFor(() => expect(app.portal.cancelaciones).toEqual(['HV-ABCD-2345']))
      expect(await screen.findByText('Cancelada')).toBeTruthy()
    })

    it('una reserva que ya empezó no ofrece cancelar', async () => {
      montar({
        ruta: '/mis-reservas',
        huesped: true,
        configurar: ({ portal }) => {
          portal.misReservasLista = [reservaDe({ checkIn: '2026-10-30', checkOut: '2026-11-03' })]
        },
      })

      expect(await screen.findByText('HV-ABCD-2345')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).toBeNull()
    })

    it('cerrar sesión lo devuelve a la portada como visitante', async () => {
      const app = montar({ ruta: '/mis-reservas', huesped: true })

      fireEvent.click(await screen.findByRole('button', { name: 'Salir' }))

      expect(await screen.findByRole('link', { name: 'Ingresar' })).toBeTruthy()
      await waitFor(() => expect(app.ubicacion()).toBe('/'))
      expect(app.storage.persistent.getItem('hotelerias.cliente.token')).toBeNull()
    })

    it('si el servidor dice que el token venció, vuelve a ser visitante con aviso', async () => {
      const app = montar({ ruta: '/mis-reservas', huesped: true })
      await screen.findByRole('button', { name: 'Salir' })

      app.container.events.clienteSessionExpired.emit()

      expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeTruthy()
      expect(await screen.findByText(/Tu sesión venció/)).toBeTruthy()
    })
  })

  describe('las dos sesiones no se mezclan', () => {
    it('un huésped NO entra al panel', async () => {
      const app = montar({ ruta: '/admin/config/usuarios', huesped: true, permisos: ['config.usuarios:ver'] })

      expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
      expect(app.ubicacion()).toBe('/admin/login')
    })

    it('el personal con sesión NO cuenta como huésped en la web', async () => {
      const app = montar({ ruta: '/mis-reservas', personal: true })

      expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeTruthy()
      expect(app.ubicacion()).toBe('/ingresar')
    })

    it('en la web cuenta la sesión del huésped, no la del personal', async () => {
      montar({
        ruta: '/ofertas',
        personal: true,
        configurar: ({ portal }) => {
          portal.promos = [promocionDe({ id: 2, nombre: 'Solo VIP', tipoClienteId: 3 })]
        },
      })

      expect(await screen.findByText('Solo VIP')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Ingresar' })).toBeTruthy() // sigue siendo visitante
    })
  })

  describe('rutas', () => {
    it('una URL de la web que no existe es un 404 con enlace a la portada', async () => {
      montar({ ruta: '/esto/no/existe' })

      expect(await screen.findByText('Esta página no existe')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Volver al inicio' }).getAttribute('href')).toBe('/')
    })

    it('un hotel que no existe muestra el aviso, no una pantalla rota', async () => {
      montar({ ruta: '/hoteles/999' })

      expect(await screen.findByText('Ese hotel no existe')).toBeTruthy()
    })
  })
})
