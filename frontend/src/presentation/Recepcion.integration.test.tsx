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
import { FakeEstanciaRepository } from '@/test/fakesEstancia'
import { FakeClienteRepository, FakePortalRepository } from '@/test/fakesPortal'
import { App } from './App'
import { AppProviders } from './AppProviders'

vi.mock('@/lib/realtime', () => ({ useRealtime: () => undefined, suscribirCambios: () => () => undefined }))
vi.mock('@/lib/alertasApi', () => ({ alertaApi: { getAll: async () => [] } }))

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

afterEach(cleanup)

const RUTA = '/admin/recepcion/estancias'
const VER = ['recepcion.estancias:ver']
const ATENDER = [...VER, 'recepcion.estancias:confirmar']
const CON_FICHAS = [...ATENDER, 'recepcion.fichas:ver']

function montar(permisos: string[], preparar?: (e: FakeEstanciaRepository) => void) {
  const estancia = new FakeEstanciaRepository()
  preparar?.(estancia)
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
      estancia,
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
  return estancia
}

const boton = (nombre: string | RegExp) => screen.getAllByRole('button', { name: nombre })[0] as HTMLButtonElement

/** Abre el check-in y espera a que lleguen las habitaciones libres. */
async function abrirCheckIn() {
  fireEvent.click(await waitFor(() => boton('Check-in de Lucía Vega')))
  const dialogo = await screen.findByRole('dialog')
  await waitFor(() => expect((within(dialogo).getByRole('button', { name: 'Hacer el check-in' }) as HTMLButtonElement).disabled).toBe(false))
  return dialogo
}

describe('Recepción', () => {
  it('muestra las llegadas y los huéspedes en casa, con los indicadores', async () => {
    montar(VER)

    expect((await screen.findAllByText('Lucía Vega')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('John Smith').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Llegadas por atender').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Salen hoy').length).toBeGreaterThan(0)
    // John sale hoy (checkOut 2026-11-01); Marta se queda hasta el 5.
    expect(screen.getAllByText(/sale hoy/).length).toBeGreaterThan(0)
  })

  it('sin permiso de confirmar no hay botones de check-in ni check-out', async () => {
    montar(VER)

    await screen.findAllByText('Lucía Vega')
    expect(screen.queryByRole('button', { name: /Check-in de/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Check-out de/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Ver la ficha/ })).toBeNull()
  })

  it('hace el check-in: elige la primera habitación libre y manda la ficha', async () => {
    const app = montar(ATENDER)

    const dialogo = await abrirCheckIn()
    // El nombre viene de la reserva y la primera habitación libre ya está elegida.
    expect((within(dialogo).getByLabelText('Nombre completo') as HTMLInputElement).value).toBe('Lucía Vega')
    fireEvent.change(within(dialogo).getByLabelText('Número de documento'), { target: { value: '12345678' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Hacer el check-in' }))

    await waitFor(() => expect(app.checkIns).toHaveLength(1))
    expect(app.checkIns[0]).toMatchObject({
      reservaId: 1, habitacionId: 11,
      ficha: { documentoTipo: 'dni', documentoNumero: '12345678', nombreCompleto: 'Lucía Vega', domiciliado: true, fechaIngresoPais: null },
    })
  })

  it('un no domiciliado debe indicar su fecha de ingreso al país', async () => {
    const app = montar(ATENDER)

    const dialogo = await abrirCheckIn()
    fireEvent.change(within(dialogo).getByLabelText('Número de documento'), { target: { value: '12345678' } })
    expect(within(dialogo).queryByLabelText('Fecha de ingreso al país')).toBeNull()

    fireEvent.click(within(dialogo).getByLabelText('Domiciliado en el Perú'))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Hacer el check-in' }))
    expect(await within(dialogo).findByText(/debe indicar la fecha en que ingresó al país/)).toBeTruthy()
    expect(app.checkIns).toHaveLength(0)

    fireEvent.change(within(dialogo).getByLabelText('Fecha de ingreso al país'), { target: { value: '2026-10-28' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Hacer el check-in' }))
    await waitFor(() => expect(app.checkIns).toHaveLength(1))
    expect(app.checkIns[0].ficha).toMatchObject({ domiciliado: false, fechaIngresoPais: '2026-10-28' })
  })

  it('un documento mal escrito avisa sin ir al servidor', async () => {
    const app = montar(ATENDER)

    const dialogo = await abrirCheckIn()
    fireEvent.change(within(dialogo).getByLabelText('Número de documento'), { target: { value: '123' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Hacer el check-in' }))

    expect(await within(dialogo).findByText('El DNI tiene 8 dígitos.')).toBeTruthy()
    expect(app.checkIns).toHaveLength(0)
  })

  it('si no hay habitaciones limpias lo explica y no deja hacer el check-in', async () => {
    const app = montar(ATENDER, (e) => (e.libresLista = []))

    fireEvent.click(await waitFor(() => boton('Check-in de Lucía Vega')))
    const dialogo = await screen.findByRole('dialog')

    expect(await within(dialogo).findByText(/No hay habitaciones limpias de «Habitación Deluxe»/)).toBeTruthy()
    expect((within(dialogo).getByRole('button', { name: 'Hacer el check-in' }) as HTMLButtonElement).disabled).toBe(true)
    expect(app.checkIns).toHaveLength(0)
  })

  it('lo que rechaza el servidor se muestra dentro del formulario', async () => {
    montar(ATENDER, (e) => (e.falla = new ValidationFailure('No se puede asignar esa habitación: la 101 está sucia')))

    const dialogo = await abrirCheckIn()
    fireEvent.change(within(dialogo).getByLabelText('Número de documento'), { target: { value: '12345678' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Hacer el check-in' }))

    expect(await within(dialogo).findByText(/la 101 está sucia/)).toBeTruthy()
  })

  it('el check-out pide confirmar, avisa que la habitación queda sucia y avisa una salida anticipada', async () => {
    const app = montar(ATENDER)

    // Marta Díaz (103) sale el 5: salida anticipada.
    fireEvent.click(await waitFor(() => boton('Check-out de la 103')))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/queda/)).toBeTruthy()
    expect(within(dialogo).getByText(/salida anticipada/)).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Hacer el check-out' }))

    await waitFor(() => expect(app.checkOuts).toEqual([8]))
  })

  it('la ficha solo se ve con el permiso de fichas', async () => {
    montar(ATENDER)
    await screen.findAllByText('Lucía Vega')
    expect(screen.queryByRole('button', { name: /Ver la ficha/ })).toBeNull()
    cleanup()

    const app = montar(CON_FICHAS)
    fireEvent.click(await waitFor(() => boton('Ver la ficha de John Smith')))
    const dialogo = await screen.findByRole('dialog')
    expect(await within(dialogo).findByText(/X1234567/)).toBeTruthy()
    expect(within(dialogo).getByText('Ingresó al país el')).toBeTruthy()
    expect(app.fichasPedidas).toEqual([7])
  })
})
