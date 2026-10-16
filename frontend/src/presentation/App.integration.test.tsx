// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthenticationFailure } from '@/core/errors/failures'
import { left } from '@/core/utils/either'
import { createContainer } from '@/di'
import {
  FakeAuthRepository,
  FakePermisoRepository,
  FakeUsuarioRepository,
  MemoryStorage,
  sesionDe,
  usuarioDe,
} from '@/test/fakes'
import { App } from './App'
import { AppProviders } from './AppProviders'

// Fuera del alcance de estas pruebas: tiempo real (SignalR) y las alertas, que
// pegan a la red. Todo lo demás es el código real, de punta a punta.
vi.mock('@/lib/realtime', () => ({ useRealtime: () => undefined, suscribirCambios: () => () => undefined }))
vi.mock('@/lib/alertasApi', () => ({ alertaApi: { getAll: async () => [] } }))

afterEach(cleanup)

function Ubicacion() {
  return <span data-testid="ubicacion">{useLocation().pathname}</span>
}

interface Escenario {
  ruta: string
  /** Si ya hay una sesión guardada al abrir la app. */
  conSesion?: boolean
  permisos?: string[]
}

function montar({ ruta, conSesion = false, permisos = [] }: Escenario) {
  const auth = new FakeAuthRepository()
  const permiso = new FakePermisoRepository()
  permiso.claves = permisos
  const usuarios = new FakeUsuarioRepository()
  usuarios.lista = [
    usuarioDe({ id: 2, nombre: 'Luis', apellido: 'Rojas', email: 'luis@hotel.pe', rolNombre: 'Vendedor' }),
    usuarioDe({ id: 3, nombre: 'María', apellido: 'Quispe', email: 'maria@hotel.pe', activo: false }),
  ]

  const container = createContainer({
    storage: { persistent: new MemoryStorage(), ephemeral: new MemoryStorage() },
    repositories: { auth, permiso, usuario: usuarios },
  })
  if (conSesion) container.session.guardar(sesionDe(), false)

  render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppProviders container={container}>
        <App />
        <Ubicacion />
      </AppProviders>
    </MemoryRouter>,
  )

  return { container, auth, permiso, usuarios, ubicacion: () => screen.getByTestId('ubicacion').textContent }
}

async function iniciarSesion(correo = 'ana@hotel.pe', clave = 'secreta') {
  fireEvent.change(await screen.findByLabelText('Correo'), { target: { value: correo } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: clave } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('la app, de punta a punta (DI con repositorios falsos)', () => {
  describe('sin sesión', () => {
    it('una ruta protegida manda al login', async () => {
      const app = montar({ ruta: '/admin/config/usuarios' })

      expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
      expect(app.ubicacion()).toBe('/admin/login')
    })

    it('tras entrar, vuelve a la pantalla que se quería abrir', async () => {
      const app = montar({ ruta: '/admin/config/usuarios', permisos: ['config.usuarios:ver'] })

      await iniciarSesion()

      expect(await screen.findByText('Luis Rojas')).toBeTruthy()
      expect(app.ubicacion()).toBe('/admin/config/usuarios')
      expect(app.auth.loginCalls).toEqual([{ email: 'ana@hotel.pe', password: 'secreta' }])
    })

    it('credenciales incorrectas: muestra el mensaje del servidor y se queda en el login', async () => {
      const app = montar({ ruta: '/admin/login' })
      app.auth.loginResult = left(new AuthenticationFailure('Email o contraseña incorrectos'))

      await iniciarSesion('ana@hotel.pe', 'mala')

      expect(await screen.findByText('Email o contraseña incorrectos')).toBeTruthy()
      expect(app.ubicacion()).toBe('/admin/login')
    })

    it('un correo mal escrito se corrige sin llegar al servidor', async () => {
      const app = montar({ ruta: '/admin/login' })
      await iniciarSesion('no-es-correo', 'x')

      expect(await screen.findByText('El correo no tiene un formato válido.')).toBeTruthy()
      expect(app.auth.loginCalls).toHaveLength(0)
    })
  })

  describe('con sesión', () => {
    it('al abrir la app restaura la sesión y llega a Inicio', async () => {
      const app = montar({ ruta: '/admin', conSesion: true, permisos: ['config.usuarios:ver'] })

      expect(await screen.findByText('Hola, Ana')).toBeTruthy()
      expect(app.auth.meCalls).toBe(1) // validó el token con el servidor
    })

    it('el login ya no tiene sentido: la manda adentro', async () => {
      const app = montar({ ruta: '/admin/login', conSesion: true })

      expect(await screen.findByText('Hola, Ana')).toBeTruthy()
      expect(app.ubicacion()).toBe('/admin')
    })

    it('sin el permiso: "no tienes acceso" y dice QUÉ pantalla', async () => {
      montar({ ruta: '/admin/config/usuarios', conSesion: true, permisos: ['inventario.stock:ver'] })

      expect(await screen.findByText('No tienes acceso a esta pantalla')).toBeTruthy()
      expect(screen.getByText('Usuarios')).toBeTruthy() // el nombre, no "config.usuarios"
      expect(screen.queryByText('Luis Rojas')).toBeNull()
    })

    it('una entrada del menú sin pantalla construida muestra "en construcción", no un 404', async () => {
      montar({ ruta: '/admin/inventario/stock', conSesion: true, permisos: ['inventario.stock:ver'] })

      expect(await screen.findByText('Esta sección todavía no está disponible.')).toBeTruthy()
    })

    it('esa misma pantalla vacía también exige su permiso', async () => {
      montar({ ruta: '/admin/inventario/stock', conSesion: true, permisos: [] })

      expect(await screen.findByText('No tienes acceso a esta pantalla')).toBeTruthy()
    })

    it('una URL del panel que no existe es un 404', async () => {
      montar({ ruta: '/admin/esto/no/existe', conSesion: true })

      expect(await screen.findByText('Esta página no existe')).toBeTruthy()
    })

    it('quien no tiene ningún permiso ve Inicio con la indicación de qué hacer', async () => {
      montar({ ruta: '/admin', conSesion: true, permisos: [] })

      expect(await screen.findByText(/Todavía no tienes accesos asignados/)).toBeTruthy()
    })

    it('cerrar sesión desde el menú de usuario limpia todo y manda al login', async () => {
      const app = montar({ ruta: '/admin', conSesion: true, permisos: ['config.usuarios:ver'] })
      await screen.findByText('Hola, Ana')

      fireEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }))
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }))

      expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
      expect(app.container.session.cargar()).toBeNull()
      expect(app.ubicacion()).toBe('/admin/login')
    })

    it('el menú solo muestra lo que la persona puede abrir, y los grupos vacíos desaparecen', async () => {
      montar({ ruta: '/admin', conSesion: true, permisos: ['inventario.stock:ver'] })
      await screen.findByText('Hola, Ana')

      // Mientras los permisos cargan el menú NO pinta nada (en vez de pintarlo
      // todo un instante): se espera a que llegue lo que sí puede abrir.
      await screen.findByText('Inventario')
      const menu = screen.getByRole('complementary', { name: 'Menú principal' })
      expect(menu.textContent).not.toContain('Facturación')
      expect(menu.textContent).not.toContain('Configuración')
    })

    it('si el servidor dice que el token venció, vuelve al login con un aviso', async () => {
      const app = montar({ ruta: '/admin/config/usuarios', conSesion: true, permisos: ['config.usuarios:ver'] })
      await screen.findByText('Luis Rojas')

      act(() => app.container.events.sessionExpired.emit())

      expect(await screen.findByText(/Tu sesión venció/)).toBeTruthy()
      expect(app.ubicacion()).toBe('/admin/login')
      expect(app.container.session.cargar()).toBeNull()
    })
  })

  describe('pantalla de usuarios', () => {
    it('solo con "ver": lista sin acciones', async () => {
      montar({ ruta: '/admin/config/usuarios', conSesion: true, permisos: ['config.usuarios:ver'] })

      expect(await screen.findByText('Luis Rojas')).toBeTruthy()
      expect(screen.getByText('María Quispe')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Desactivar' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
    })

    it('con "editar": puede activar y desactivar, y la lista se actualiza', async () => {
      const app = montar({
        ruta: '/admin/config/usuarios',
        conSesion: true,
        permisos: ['config.usuarios:ver', 'config.usuarios:editar'],
      })
      await screen.findByText('Luis Rojas')

      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))

      await waitFor(() => expect(app.usuarios.lista.find((u) => u.id === 2)?.activo).toBe(false))
      await waitFor(() => expect(screen.getAllByText('Inactivo')).toHaveLength(2))
      expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull() // no tiene "eliminar"
    })

    it('con "eliminar": pide confirmación y recién entonces borra', async () => {
      const app = montar({
        ruta: '/admin/config/usuarios',
        conSesion: true,
        permisos: ['config.usuarios:ver', 'config.usuarios:eliminar'],
      })
      await screen.findByText('Luis Rojas')

      fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0])
      expect(app.usuarios.eliminados).toHaveLength(0) // todavía no: falta confirmar

      const dialogo = await screen.findByText(/Esta acción no se puede deshacer/)
      expect(dialogo.textContent).toContain('Luis Rojas')

      const botones = screen.getAllByRole('button', { name: 'Eliminar' })
      fireEvent.click(botones[botones.length - 1]) // el del diálogo

      await waitFor(() => expect(app.usuarios.eliminados).toEqual([2]))
      await waitFor(() => expect(screen.queryByText('Luis Rojas')).toBeNull())
    })

    it('si el servidor falla, lo dice con un mensaje y no deja la pantalla rota', async () => {
      const app = montar({ ruta: '/admin', conSesion: true, permisos: ['config.usuarios:ver'] })
      await screen.findByText('Hola, Ana')
      app.usuarios.fail = null

      // Se reemplaza el resultado a mitad de camino y se navega a la pantalla.
      app.usuarios.listar = async () =>
        left(new (await import('@/core/errors/failures')).ServerFailure('pq: boom'))
      fireEvent.click(screen.getByText('Configuración'))
      fireEvent.click(await screen.findByText('Usuarios'))

      expect(await screen.findByText(/El servidor tuvo un problema/)).toBeTruthy()
      expect(screen.queryByText(/pq: boom/)).toBeNull() // no se filtra el detalle interno
    })
  })
})
