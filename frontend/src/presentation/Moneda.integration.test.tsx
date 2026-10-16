// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { right } from '@/core/utils/either'
import { createContainer } from '@/di'
import type { SubmoduloCatalogo } from '@/domain/entities/Permiso'
import {
  FakeAuthRepository,
  FakePermisoRepository,
  FakeUsuarioRepository,
  MemoryStorage,
  sesionDe,
} from '@/test/fakes'
import { FakeTipoCambioRepository } from '@/test/fakesFinanzas'
import { FakeClienteRepository, FakePortalRepository, reservaDe } from '@/test/fakesPortal'
import { App } from './App'
import { AppProviders } from './AppProviders'

vi.mock('@/lib/realtime', () => ({ useRealtime: () => undefined, suscribirCambios: () => () => undefined }))
vi.mock('@/lib/alertasApi', () => ({ alertaApi: { getAll: async () => [] } }))

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 20000 })

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const BUSQUEDA = 'entrada=2026-11-10&salida=2026-11-12&huespedes=2'

class PermisosConCatalogo extends FakePermisoRepository {
  async catalogo() {
    return right<SubmoduloCatalogo[]>([
      { submodulo: 'finanzas.tipocambio', modulo: 'finanzas', acciones: ['ver', 'crear', 'editar'] },
    ])
  }
}

function montar(ruta: string, opciones: { personal?: string[]; configurar?: (p: FakePortalRepository) => void } = {}) {
  const portal = new FakePortalRepository()
  const tipoCambio = new FakeTipoCambioRepository()
  opciones.configurar?.(portal)
  const permiso = new PermisosConCatalogo()
  permiso.claves = opciones.personal ?? []

  const container = createContainer({
    storage: { persistent: new MemoryStorage(), ephemeral: new MemoryStorage() },
    hoy: () => '2026-11-01',
    repositories: {
      auth: new FakeAuthRepository(),
      permiso,
      usuario: new FakeUsuarioRepository(),
      portal,
      cliente: new FakeClienteRepository(),
      tipoCambio,
    },
  })
  if (opciones.personal) container.session.guardar(sesionDe(), false)

  render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppProviders container={container}>
        <App />
      </AppProviders>
    </MemoryRouter>,
  )
  return { container, portal, tipoCambio }
}

describe('la web en dos monedas', () => {
  it('ofrece soles y dólares cuando hay tipo de cambio, y por defecto muestra soles', async () => {
    montar(`/hoteles/1?${BUSQUEDA}`)

    const selector = await screen.findByRole('group', { name: 'Moneda' })
    const soles = within(selector).getByRole('button', { name: 'S/' }) as HTMLButtonElement
    expect(soles.getAttribute('aria-pressed')).toBe('true')
    expect(within(selector).getByRole('button', { name: 'US$' })).toBeTruthy()
    expect((await screen.findAllByText(/760\.00/)).length).toBeGreaterThan(0)
  })

  it('al elegir dólares vuelve a cotizar en dólares, con el tipo de cambio a la vista', async () => {
    const app = montar(`/hoteles/1?${BUSQUEDA}`)

    fireEvent.click(await screen.findByRole('button', { name: 'US$' }))

    // S/ 380 / 3.752 = US$ 101.28 por noche; × 2 noches = US$ 202.56.
    expect((await screen.findAllByText(/US\$ 202\.56/)).length).toBeGreaterThan(0)
    expect(screen.getByText(/US\$ 101\.28 × 2 noches/)).toBeTruthy()
    expect(screen.getByText(/S\/ 3\.752 por US\$ 1/)).toBeTruthy()
    expect(app.portal.cotizaciones.at(-1)?.moneda).toBe('USD')
  })

  it('recuerda la moneda elegida en este navegador', async () => {
    montar(`/hoteles/1?${BUSQUEDA}`)
    fireEvent.click(await screen.findByRole('button', { name: 'US$' }))
    await screen.findAllByText(/US\$ 202\.56/)
    expect(window.localStorage.getItem('hotel.moneda')).toBe('USD')

    cleanup()
    montar(`/hoteles/1?${BUSQUEDA}`)
    expect((await screen.findAllByText(/US\$ 202\.56/)).length).toBeGreaterThan(0)
  })

  it('sin tipo de cambio no ofrece dólares, aunque el visitante los hubiera elegido antes', async () => {
    window.localStorage.setItem('hotel.moneda', 'USD')
    const app = montar(`/hoteles/1?${BUSQUEDA}`, { configurar: (p) => (p.ventaUsdMicro = 0) })

    expect((await screen.findAllByText(/760\.00/)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('group', { name: 'Moneda' })).toBeNull()
    expect(app.portal.cotizaciones.every((c) => c.moneda !== 'USD')).toBe(true)
  })

  it('funciona aunque el almacenamiento del navegador falle', async () => {
    const roto = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    try {
      montar(`/hoteles/1?${BUSQUEDA}`)
      expect((await screen.findAllByText(/760\.00/)).length).toBeGreaterThan(0)
    } finally {
      roto.mockRestore()
    }
  })

  it('"mis reservas" muestra cada reserva en la moneda en que se hizo, con su equivalente en soles', async () => {
    // La sesión del huésped se lee del almacenamiento persistente del contenedor.
    const portal = new FakePortalRepository()
    portal.misReservasLista = [
      reservaDe({ codigo: 'HV-USD0-0001', moneda: 'USD', tipoCambioMicro: 3_752_000, totalCent: 20_256, totalPenCent: 76_001 }),
      reservaDe({ id: 2, codigo: 'HV-PEN0-0002', totalCent: 76_000, totalPenCent: 76_000 }),
    ]
    const storage = { persistent: new MemoryStorage(), ephemeral: new MemoryStorage() }
    storage.persistent.setItem('hotelerias.cliente.token', 'tok-cliente')
    storage.persistent.setItem(
      'hotelerias.cliente.perfil',
      JSON.stringify({ id: 7, nombre: 'Lucía', apellido: 'Vega', email: 'l@correo.pe', activo: true, tipoClienteId: 1 }),
    )
    const container = createContainer({
      storage,
      hoy: () => '2026-11-01',
      repositories: {
        auth: new FakeAuthRepository(),
        permiso: new FakePermisoRepository(),
        usuario: new FakeUsuarioRepository(),
        portal,
        cliente: new FakeClienteRepository(),
      },
    })
    render(
      <MemoryRouter initialEntries={['/mis-reservas']}>
        <AppProviders container={container}>
          <App />
        </AppProviders>
      </MemoryRouter>,
    )

    expect(await screen.findByText('US$ 202.56')).toBeTruthy()
    expect(screen.getByText(/≈ S\/ 760\.01/)).toBeTruthy()
    expect(screen.getByText('S/ 760.00')).toBeTruthy()
  })
})

describe('Tipo de cambio (Finanzas)', () => {
  it('lista el historial y muestra la venta vigente', async () => {
    montar('/admin/finanzas/tipocambio', { personal: ['finanzas.tipocambio:ver'] })

    expect((await screen.findAllByText('3.752')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Registrar tipo de cambio/ })).toBeNull()
  })

  it('registra el de hoy mandando las tasas como texto', async () => {
    const app = montar('/admin/finanzas/tipocambio', {
      personal: ['finanzas.tipocambio:ver', 'finanzas.tipocambio:crear'],
    })

    fireEvent.click(await screen.findByRole('button', { name: /Registrar tipo de cambio/ }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText('Compra'), { target: { value: '3.760' } })
    fireEvent.change(within(dialogo).getByLabelText('Venta'), { target: { value: '3.768' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(app.tipoCambio.guardados).toHaveLength(1))
    expect(app.tipoCambio.guardados[0]).toEqual({ fecha: '2026-11-01', moneda: 'USD', compra: '3.760', venta: '3.768' })
  })

  it('avisa sin ir al servidor si la venta es menor que la compra', async () => {
    const app = montar('/admin/finanzas/tipocambio', {
      personal: ['finanzas.tipocambio:ver', 'finanzas.tipocambio:crear'],
    })

    fireEvent.click(await screen.findByRole('button', { name: /Registrar tipo de cambio/ }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText('Compra'), { target: { value: '3.9' } })
    fireEvent.change(within(dialogo).getByLabelText('Venta'), { target: { value: '3.8' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    expect(await within(dialogo).findByText(/venta no puede ser menor/i)).toBeTruthy()
    expect(app.tipoCambio.guardados).toHaveLength(0)
  })

  it('corregir un día prellena el formulario con las tasas de ese día', async () => {
    montar('/admin/finanzas/tipocambio', {
      personal: ['finanzas.tipocambio:ver', 'finanzas.tipocambio:crear'],
    })

    const botones = await screen.findAllByRole('button', { name: /Corregir el tipo de cambio/ })
    fireEvent.click(botones[0])
    const dialogo = await screen.findByRole('dialog')
    expect((within(dialogo).getByLabelText('Compra') as HTMLInputElement).value).toBe('3.745')
    expect((within(dialogo).getByLabelText('Venta') as HTMLInputElement).value).toBe('3.752')
  })
})
