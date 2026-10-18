// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ValidationFailure } from '@/core/errors/failures'
import { createContainer } from '@/di'
import {
  FakeAuthRepository,
  FakePermisoRepository,
  FakeUsuarioRepository,
  MemoryStorage,
  sesionDe,
} from '@/test/fakes'
import { FakeLimpiezaRepository } from '@/test/fakesLimpieza'
import { FakeClienteRepository, FakePortalRepository } from '@/test/fakesPortal'
import { App } from './App'
import { AppProviders } from './AppProviders'

vi.mock('@/lib/realtime', () => ({ useRealtime: () => undefined, suscribirCambios: () => () => undefined }))
vi.mock('@/lib/alertasApi', () => ({ alertaApi: { getAll: async () => [] } }))

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

afterEach(cleanup)

const RUTA = '/admin/habitaciones/housekeeping'
const VER = ['habitaciones.housekeeping:ver']
const TODO = [...VER, 'habitaciones.housekeeping:crear', 'habitaciones.housekeeping:editar', 'habitaciones.housekeeping:confirmar']

function montar(permisos: string[], preparar?: (l: FakeLimpiezaRepository) => void) {
  const limpieza = new FakeLimpiezaRepository()
  preparar?.(limpieza)
  const permiso = new FakePermisoRepository()
  permiso.claves = permisos

  const container = createContainer({
    storage: { persistent: new MemoryStorage(), ephemeral: new MemoryStorage() },
    hoy: () => '2026-11-01',
    repositories: {
      auth: new FakeAuthRepository(),
      permiso,
      usuario: new FakeUsuarioRepository(),
      portal: new FakePortalRepository(),
      cliente: new FakeClienteRepository(),
      limpieza,
    },
  })
  container.session.guardar(sesionDe(), false)

  render(
    <MemoryRouter initialEntries={[RUTA]}>
      <AppProviders container={container}>
        <App />
      </AppProviders>
    </MemoryRouter>,
  )
  return limpieza
}

const boton = (nombre: string | RegExp) => screen.getAllByRole('button', { name: nombre })[0] as HTMLButtonElement

describe('Limpieza', () => {
  it('lista las habitaciones sucias con su estado y responsable, y marca las urgentes', async () => {
    montar(VER)

    expect((await screen.findAllByText('101')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Urgente').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Por asignar').length).toBeGreaterThan(0)
    expect(screen.getAllByText('En curso').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rosa Camarera').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/hace 2 h/).length).toBeGreaterThan(0)
  })

  it('sin permisos de escritura no hay botones de asignar, empezar ni terminar', async () => {
    montar(VER)

    await screen.findAllByText('101')
    expect(screen.queryByRole('button', { name: /Asignar la/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Empezar la/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Terminar la/ })).toBeNull()
  })

  it('asigna a una persona', async () => {
    const app = montar(TODO)

    fireEvent.click(await waitFor(() => boton('Asignar la 101')))
    const dialogo = await screen.findByRole('dialog')
    // El desplegable arranca en «Sin asignar»: se elige a Rosa.
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Responsable' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Rosa Camarera' }))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(app.asignaciones).toEqual([{ habitacionId: 1, usuarioId: 4 }]))
  })

  it('empieza una limpieza; la que ya está en curso no se puede empezar otra vez', async () => {
    const app = montar(TODO)

    await screen.findAllByText('101')
    expect(boton('Empezar la 103').disabled).toBe(true)
    fireEvent.click(boton('Empezar la 102'))
    await waitFor(() => expect(app.iniciadas).toEqual([2]))
  })

  it('terminar pide confirmar, manda las observaciones y la habitación sale del tablero', async () => {
    const app = montar(TODO)

    fireEvent.click(await waitFor(() => boton('Terminar la 102')))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/queda/)).toBeTruthy()
    fireEvent.change(within(dialogo).getByLabelText(/Observaciones/), { target: { value: 'Faltaba jabón' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Dejarla limpia' }))

    await waitFor(() => expect(app.terminadasLlamadas).toEqual([{ habitacionId: 2, observaciones: 'Faltaba jabón' }]))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Terminar la 102' })).toBeNull())
  })

  it('si el servidor rechaza (ya no está sucia), lo muestra dentro del formulario', async () => {
    montar(TODO, (l) => (l.falla = new ValidationFailure('La habitación ya no está sucia (está ocupada). Recarga el tablero')))

    fireEvent.click(await waitFor(() => boton('Terminar la 101')))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Dejarla limpia' }))

    expect(await within(dialogo).findByText(/ya no está sucia/)).toBeTruthy()
  })

  it('el historial muestra quién limpió, cuándo y cuánto tardó', async () => {
    montar(VER)

    await screen.findAllByText('101')
    fireEvent.click(screen.getByRole('tab', { name: /Historial/ }))

    expect((await screen.findAllByText('110')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('25 min').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cambié sábanas').length).toBeGreaterThan(0)
    // En el historial no hay acciones por fila.
    expect(screen.queryByRole('button', { name: /Terminar la/ })).toBeNull()
  })
})
