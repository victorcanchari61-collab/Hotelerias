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
import { FakeHabitacionRepository } from '@/test/fakesHabitacion'
import { FakeClienteRepository, FakePortalRepository } from '@/test/fakesPortal'
import { App } from './App'
import { AppProviders } from './AppProviders'

vi.mock('@/lib/realtime', () => ({ useRealtime: () => undefined, suscribirCambios: () => () => undefined }))
vi.mock('@/lib/alertasApi', () => ({ alertaApi: { getAll: async () => [] } }))

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

afterEach(cleanup)

const RUTA = '/admin/habitaciones/habitaciones'
const VER = ['habitaciones.habitaciones:ver']
const TODO = [...VER, 'habitaciones.habitaciones:crear', 'habitaciones.habitaciones:editar']

function montar(permisos: string[], preparar?: (h: FakeHabitacionRepository) => void) {
  const habitacion = new FakeHabitacionRepository()
  preparar?.(habitacion)
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
      habitacion,
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
  return habitacion
}

/** Los botones de crear se habilitan cuando llegan los tipos: se espera a eso antes de pulsar. */
async function pulsar(nombre: RegExp) {
  const b = await screen.findByRole('button', { name: nombre })
  await waitFor(() => expect((b as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(b)
}

const boton = (nombre: string | RegExp) => screen.getAllByRole('button', { name: nombre })[0] as HTMLButtonElement

describe('Habitaciones', () => {
  it('lista el inventario con los indicadores del día', async () => {
    montar(VER)

    expect((await screen.findAllByText('101')).length).toBeGreaterThan(0)
    // 5 en total, una desactivada: 4 activas (una limpia, una sucia, una ocupada y una en mantenimiento).
    expect(screen.getAllByText('Limpias').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sucias').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1 desactivadas').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Desactivada').length).toBeGreaterThan(0)
  })

  it('sin permisos de crear ni editar no hay botones de escritura', async () => {
    montar(VER)

    await screen.findAllByText('101')
    expect(screen.queryByRole('button', { name: /Nueva habitación/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Crear varias/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Marcar sucia/ })).toBeNull()
  })

  it('marca sucia una limpia con un clic', async () => {
    const app = montar(TODO)

    await screen.findAllByText('101')
    fireEvent.click(boton('Marcar sucia la 101'))

    await waitFor(() => expect(app.estados).toEqual([{ id: 1, estado: 'sucia' }]))
  })

  it('una ocupada y una desactivada no se pueden cambiar; el botón del estado actual tampoco', async () => {
    montar(TODO)

    await screen.findAllByText('101')
    for (const nombre of ['Marcar limpia la 103', 'Marcar sucia la 103', 'Poner en mantenimiento la 103', 'Marcar sucia la 105']) {
      expect(boton(nombre).disabled, nombre).toBe(true)
    }
    expect(boton('Marcar limpia la 101').disabled).toBe(true) // ya está limpia
    expect(boton('Marcar sucia la 101').disabled).toBe(false)
  })

  it('si el servidor rechaza el cambio, lo muestra y vuelve a leer lo real', async () => {
    const app = montar(TODO, (h) => (h.falla = new ValidationFailure('La habitación está ocupada: se libera con el check-out')))

    await screen.findAllByText('101')
    fireEvent.click(boton('Marcar sucia la 101'))

    expect(await screen.findByText(/está ocupada: se libera con el check-out/)).toBeTruthy()
    expect(app.lista.find((h) => h.id === 1)?.estado).toBe('limpia')
  })

  it('crea una habitación con el número en mayúsculas', async () => {
    const app = montar(TODO)

    await pulsar(/Nueva habitación/)
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText('Número'), { target: { value: ' ph-1 ' } })
    fireEvent.change(within(dialogo).getByLabelText('Piso'), { target: { value: '9' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear habitación' }))

    await waitFor(() => expect(app.creadas).toHaveLength(1))
    expect(app.creadas[0]).toMatchObject({ tipoHabitacionId: 10, numero: 'PH-1', piso: 9, activa: true })
  })

  it('un número vacío avisa sin ir al servidor', async () => {
    const app = montar(TODO)

    await pulsar(/Nueva habitación/)
    const dialogo = await screen.findByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear habitación' }))

    expect(await within(dialogo).findByText(/Indica el número/)).toBeTruthy()
    expect(app.creadas).toHaveLength(0)
  })

  it('un número repetido que rechaza el servidor se muestra dentro del formulario', async () => {
    montar(TODO, (h) => (h.falla = new ValidationFailure('Ya existe la habitación 101 en Velothr Miraflores')))

    await pulsar(/Nueva habitación/)
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText('Número'), { target: { value: '101' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear habitación' }))

    expect(await within(dialogo).findByText(/Ya existe la habitación 101/)).toBeTruthy()
  })

  it('crea varias y avisa cuántas serán antes de confirmar', async () => {
    const app = montar(TODO)

    await pulsar(/Crear varias/)
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText('Piso'), { target: { value: '2' } })
    fireEvent.change(within(dialogo).getByLabelText('Desde el número'), { target: { value: '201' } })
    fireEvent.change(within(dialogo).getByLabelText('Hasta el número'), { target: { value: '210' } })

    expect(within(dialogo).getByText(/Se crearán 10 habitaciones: de la 201 a la 210/)).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear 10' }))

    await waitFor(() => expect(app.lotes).toHaveLength(1))
    expect(app.lotes[0]).toEqual({ tipoHabitacionId: 10, piso: 2, desde: 201, hasta: 210 })
  })

  it('editar prellena el formulario y puede desactivar', async () => {
    const app = montar(TODO)

    await screen.findAllByText('102')
    fireEvent.click(boton('Editar la 102'))
    const dialogo = await screen.findByRole('dialog')
    expect((within(dialogo).getByLabelText('Número') as HTMLInputElement).value).toBe('102')

    fireEvent.click(within(dialogo).getByRole('checkbox'))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(app.actualizadas).toHaveLength(1))
    expect(app.actualizadas[0]).toMatchObject({ id: 2, input: { numero: '102', activa: false } })
  })
})
