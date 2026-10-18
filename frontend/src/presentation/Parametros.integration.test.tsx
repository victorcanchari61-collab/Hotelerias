// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createContainer } from '@/di'
import {
  FakeAuthRepository,
  FakePermisoRepository,
  FakeUsuarioRepository,
  MemoryStorage,
  sesionDe,
} from '@/test/fakes'
import { FakeParametroRepository } from '@/test/fakesParametro'
import { FakeClienteRepository, FakePortalRepository } from '@/test/fakesPortal'
import { App } from './App'
import { AppProviders } from './AppProviders'

vi.mock('@/lib/realtime', () => ({ useRealtime: () => undefined, suscribirCambios: () => () => undefined }))
vi.mock('@/lib/alertasApi', () => ({ alertaApi: { getAll: async () => [] } }))

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

afterEach(cleanup)

function montar(ruta: string, opciones: { permisos?: string[]; configurar?: (p: FakePortalRepository) => void } = {}) {
  const parametro = new FakeParametroRepository()
  const portal = new FakePortalRepository()
  opciones.configurar?.(portal)
  const permiso = new FakePermisoRepository()
  permiso.claves = opciones.permisos ?? []

  const container = createContainer({
    storage: { persistent: new MemoryStorage(), ephemeral: new MemoryStorage() },
    hoy: () => '2026-11-01',
    repositories: {
      auth: new FakeAuthRepository(),
      permiso,
      usuario: new FakeUsuarioRepository(),
      portal,
      cliente: new FakeClienteRepository(),
      parametro,
    },
  })
  if (opciones.permisos) container.session.guardar(sesionDe(), false)

  render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppProviders container={container}>
        <App />
      </AppProviders>
    </MemoryRouter>,
  )
  return { parametro, portal }
}

const RUTA = '/admin/config/parametros'
const entrada = (nombre: string) => screen.findByLabelText(nombre) as Promise<HTMLInputElement>

describe('Parámetros', () => {
  it('lista los parámetros agrupados, con su valor y su defecto', async () => {
    montar(RUTA, { permisos: ['config.parametros:ver'] })

    expect((await entrada('Máximo de noches por reserva')).value).toBe('30')
    expect(screen.getByRole('heading', { name: 'Reservas' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Horarios' })).toBeTruthy()
    expect((screen.getByLabelText('Hora de check-in') as HTMLInputElement).value).toBe('14:00')
  })

  it('sin permiso de editar los campos están apagados y no hay botón de guardar', async () => {
    montar(RUTA, { permisos: ['config.parametros:ver'] })

    expect((await entrada('Máximo de noches por reserva')).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull()
  })

  it('guarda solo lo que se cambió', async () => {
    const app = montar(RUTA, { permisos: ['config.parametros:ver', 'config.parametros:editar'] })

    const boton = await screen.findByRole('button', { name: 'Guardar cambios' })
    expect((boton as HTMLButtonElement).disabled).toBe(true) // sin cambios

    fireEvent.change(await entrada('Máximo de noches por reserva'), { target: { value: '45' } })
    expect(screen.getByText('1 cambio sin guardar.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(app.parametro.guardados).toHaveLength(1))
    expect(app.parametro.guardados[0]).toEqual({ 'reservas.max_noches': '45' })
    expect(await screen.findByText('Sin cambios.')).toBeTruthy()
    // Tras guardar, queda marcado quién y el defecto sigue visible.
    expect(((await entrada('Máximo de noches por reserva')).value)).toBe('45')
  })

  it('un valor inválido avisa y bloquea el guardado', async () => {
    const app = montar(RUTA, { permisos: ['config.parametros:ver', 'config.parametros:editar'] })

    fireEvent.change(await entrada('Máximo de noches por reserva'), { target: { value: '9999' } })

    expect(await screen.findByText(/debe estar entre 1 y 365/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true)
    expect(app.parametro.guardados).toHaveLength(0)
  })

  it('«Restablecer» devuelve el valor por defecto en el formulario', async () => {
    const app = montar(RUTA, { permisos: ['config.parametros:ver', 'config.parametros:editar'] })

    const campo = await entrada('Máximo de noches por reserva')
    fireEvent.change(campo, { target: { value: '45' } })
    fireEvent.click(await screen.findByRole('button', { name: /Restablecer/ }))

    expect(campo.value).toBe('30')
    expect(screen.getByText('Sin cambios.')).toBeTruthy()
    expect(app.parametro.guardados).toHaveLength(0)
  })
})

describe('los horarios en la web', () => {
  it('la página del hotel muestra el check-in y el check-out', async () => {
    montar('/hoteles/1?entrada=2026-11-10&salida=2026-11-12&huespedes=2')

    expect(await screen.findByText(/Check-in desde las 14:00/)).toBeTruthy()
    expect(screen.getByText(/Check-out hasta las\s+12:00/)).toBeTruthy()
  })

  it('si no hay horarios, la página sigue sin esa línea', async () => {
    montar('/hoteles/1?entrada=2026-11-10&salida=2026-11-12&huespedes=2', {
      configurar: (p) => (p.parametrosPublicos = {}),
    })

    expect(await screen.findByText('Habitación Deluxe')).toBeTruthy()
    expect(screen.queryByText(/Check-in desde/)).toBeNull()
  })
})
