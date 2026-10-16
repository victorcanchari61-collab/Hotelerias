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
  usuarioDe,
} from '@/test/fakes'
import {
  FakeAccesosRepository,
  FakeAuditoriaRepository,
  FakeEmpresaRepository,
  FakeRolRepository,
  FakeSedeAdminRepository,
  rolDe,
} from '@/test/fakesConfiguracion'
import { FakePortalRepository } from '@/test/fakesPortal'
import { App } from './App'
import { AppProviders } from './AppProviders'

vi.mock('@/lib/realtime', () => ({ useRealtime: () => undefined, suscribirCambios: () => () => undefined }))
vi.mock('@/lib/alertasApi', () => ({ alertaApi: { getAll: async () => [] } }))

// Cada prueba monta la app completa; con muchas pruebas en paralelo 1 s no alcanza.
configure({ asyncUtilTimeout: 5000 })
// La primera prueba compila las pantallas cargadas bajo demanda (lazy): tarda.
vi.setConfig({ testTimeout: 20000 })

afterEach(cleanup)

const CATALOGO: SubmoduloCatalogo[] = [
  { submodulo: 'reservas.reservas', modulo: 'reservas', acciones: ['ver', 'crear', 'editar', 'anular'] },
  { submodulo: 'config.usuarios', modulo: 'config', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
]

class PermisosConCatalogo extends FakePermisoRepository {
  async catalogo() {
    return right<SubmoduloCatalogo[]>(CATALOGO)
  }
}

type Fakes = {
  rol: FakeRolRepository
  empresa: FakeEmpresaRepository
  sedeAdmin: FakeSedeAdminRepository
  accesos: FakeAccesosRepository
  auditoria: FakeAuditoriaRepository
  usuario: FakeUsuarioRepository
}

function montar(ruta: string, permisos: string[], preparar?: (fakes: Fakes) => void) {
  const permiso = new PermisosConCatalogo()
  permiso.claves = permisos
  const fakes = {
    rol: new FakeRolRepository(),
    empresa: new FakeEmpresaRepository(),
    sedeAdmin: new FakeSedeAdminRepository(),
    accesos: new FakeAccesosRepository(),
    auditoria: new FakeAuditoriaRepository(),
    usuario: new FakeUsuarioRepository(),
  }
  fakes.usuario.lista = [usuarioDe({ id: 5, nombre: 'Pepe', apellido: 'Rojas', rolIds: [2] })]
  preparar?.(fakes)

  const container = createContainer({
    storage: { persistent: new MemoryStorage(), ephemeral: new MemoryStorage() },
    hoy: () => '2026-11-01',
    repositories: {
      auth: new FakeAuthRepository(),
      permiso,
      portal: new FakePortalRepository(),
      ...fakes,
    },
  })
  container.session.guardar(sesionDe(), false)

  render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppProviders container={container}>
        <App />
      </AppProviders>
    </MemoryRouter>,
  )
  return { container, ...fakes }
}

describe('Roles', () => {
  it('crea un rol con el nombre recortado', async () => {
    const app = montar('/admin/config/roles', ['config.roles:ver', 'config.roles:crear'])

    fireEvent.click(await screen.findByRole('button', { name: /Nuevo rol/ }))
    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: '  Concierge ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear rol' }))

    await waitFor(() => expect(app.rol.creados).toHaveLength(1))
    expect(app.rol.creados[0].nombre).toBe('Concierge')
  })

  it('sin "crear" no ofrece el botón; un rol protegido no se desactiva ni se elimina', async () => {
    const app = montar('/admin/config/roles', ['config.roles:ver', 'config.roles:editar', 'config.roles:eliminar'], ({ rol }) => {
      rol.lista = [rolDe({ id: 1, nombre: 'Administrador', accesoTotal: true, delSistema: true })]
    })

    expect((await screen.findAllByText('Administrador')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Nuevo rol/ })).toBeNull()
    // Los botones existen pero están apagados: se ve por qué no se puede.
    for (const nombre of ['Desactivar Administrador', 'Eliminar Administrador']) {
      const botones = screen.getAllByRole('button', { name: nombre }) as HTMLButtonElement[]
      expect(botones.every((b) => b.disabled), nombre).toBe(true)
    }
    expect(app.rol.eliminados).toHaveLength(0)
  })
})

/**
 * Elige un rol en el desplegable del kit: se abre el campo y se pulsa la opción.
 * Espera a que la lista haya llegado (carga asíncrona).
 */
async function elegirRol(_id: string, nombre: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name: 'Elige un rol…' }))
  fireEvent.click(await screen.findByRole('option', { name: nombre }))
}

describe('Accesos', () => {
  const PERMISOS = ['config.accesos:ver', 'config.accesos:editar', 'config.roles:ver']

  it('marcar una acción marca "ver" y guarda la matriz completa del rol', async () => {
    const app = montar('/admin/config/accesos', PERMISOS)

    await elegirRol('2', /Recepcionista/)
    const anular = await screen.findByLabelText('Reservas: Anular')
    fireEvent.click(anular)

    expect((screen.getByLabelText('Reservas: Ver') as HTMLInputElement).checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar accesos' }))
    await waitFor(() => expect(app.rol.permisosGuardados).toHaveLength(1))
    expect(new Set(app.rol.permisosGuardados[0].permisos)).toEqual(
      new Set(['reservas.reservas:ver', 'reservas.reservas:anular']),
    )
  })

  it('quitar "ver" quita las demás acciones de esa pantalla', async () => {
    montar('/admin/config/accesos', PERMISOS, ({ rol }) => {
      rol.lista[0] = rolDe({ permisos: ['reservas.reservas:ver', 'reservas.reservas:crear'] })
    })

    await elegirRol('2', /Recepcionista/)
    fireEvent.click(await screen.findByLabelText('Reservas: Ver'))

    expect((screen.getByLabelText('Reservas: Crear') as HTMLInputElement).checked).toBe(false)
  })

  it('el rol de acceso total no se configura', async () => {
    montar('/admin/config/accesos', PERMISOS, ({ rol }) => {
      rol.lista[0] = rolDe({ id: 1, nombre: 'Administrador', accesoTotal: true })
    })

    await elegirRol('1', /Administrador/)

    expect(await screen.findByText(/acceso total: puede todo/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Guardar accesos' })).toBeNull()
    expect(screen.queryByLabelText('Reservas: Ver')).toBeNull()
  })

  it('el alcance por sede se guarda junto con la matriz', async () => {
    const app = montar('/admin/config/accesos', PERMISOS)

    await elegirRol('2', /Recepcionista/)
    fireEvent.click(await screen.findByRole('button', { name: 'Alcance de Reservas' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Solo sus sedes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar accesos' }))

    await waitFor(() => expect(app.accesos.alcancesGuardadosRol).toHaveLength(1))
    expect(app.accesos.alcancesGuardadosRol[0]).toEqual({ rolId: 2, alcances: { 'reservas.reservas': 'mis_sedes' } })
  })

  it('solo con "ver" es de consulta: sin guardar ni aprobar', async () => {
    const app = montar('/admin/config/accesos', ['config.accesos:ver', 'config.roles:ver'])
    expect(await screen.findByText(/modo consulta/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Solicitudes/ }))
    await screen.findAllByText('Pepe Rojas')
    expect(screen.queryByRole('button', { name: /Aprobar/ })).toBeNull()
    expect(app.accesos.aprobadas).toHaveLength(0)
  })

  it('aprueba una solicitud desde la bandeja', async () => {
    const app = montar('/admin/config/accesos', PERMISOS)

    fireEvent.click(await screen.findByRole('tab', { name: /Solicitudes/ }))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Aprobar la solicitud de Pepe Rojas' }))[0])

    const dialogo = await screen.findByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(app.accesos.aprobadas).toHaveLength(1))
    expect(app.accesos.aprobadas[0]).toMatchObject({ id: 1, vigencia: 'una_vez' })
  })

  it('rechaza con una respuesta', async () => {
    const app = montar('/admin/config/accesos', PERMISOS)

    fireEvent.click(await screen.findByRole('tab', { name: /Solicitudes/ }))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Rechazar la solicitud de Pepe Rojas' }))[0])
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText(/Respuesta/), { target: { value: ' Pídelo a tu jefe ' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Rechazar' }))

    await waitFor(() => expect(app.accesos.rechazadas).toEqual([{ id: 1, respuesta: 'Pídelo a tu jefe' }]))
  })
})

describe('pedir un permiso al toparse con un 403', () => {
  it('el 403 de una acción abre el diálogo y la solicitud lleva QUÉ faltaba', async () => {
    const app = montar('/admin', ['config.usuarios:ver'])
    await screen.findByText('Hola, Ana')

    app.container.events.permissionDenied.emit({ submodulo: 'reservas.reservas', accion: 'anular' })

    expect(await screen.findByText('No tienes permiso para esto')).toBeTruthy()
    expect(screen.getByText(/Reservas/)).toBeTruthy() // el nombre de la pantalla, no la clave técnica

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'La emití mal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pedir acceso' }))

    await waitFor(() => expect(app.accesos.solicitadas).toHaveLength(1))
    expect(app.accesos.solicitadas[0]).toMatchObject({
      submodulo: 'reservas.reservas',
      accion: 'anular',
      motivo: 'La emití mal',
    })
  })
})

describe('Auditoría', () => {
  it('la tabla pide al servidor (modo servidor) y muestra los cambios de un registro', async () => {
    const app = montar('/admin/config/auditoria', ['config.auditoria:ver'])

    expect((await screen.findAllByText('Super Admin')).length).toBeGreaterThan(0)
    // Pidió la primera página al servidor: no filtra ni pagina en memoria.
    await waitFor(() => expect(app.auditoria.filtros.length).toBeGreaterThan(0))
    expect(app.auditoria.filtros[0]).toMatchObject({ pagina: 1, porPagina: 25 })

    fireEvent.click(screen.getAllByRole('button', { name: /Ver cambios del registro 3/ })[0])

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Housekeeping')).toBeTruthy()
    expect(within(dialogo).getByText('Limpieza')).toBeTruthy()
  })

  it('depurar es solo con "eliminar" y borra lo que se está viendo, tras confirmar', async () => {
    const solo = montar('/admin/config/auditoria', ['config.auditoria:ver'])
    await screen.findAllByText('Super Admin')
    expect(screen.queryByRole('button', { name: /Depurar/ })).toBeNull()
    expect(solo.auditoria.depuradas).toHaveLength(0)
    cleanup()

    const app = montar('/admin/config/auditoria', ['config.auditoria:ver', 'config.auditoria:eliminar'])
    await screen.findAllByText('Super Admin')
    fireEvent.click(await screen.findByRole('button', { name: /Depurar/ }))
    expect(app.auditoria.depuradas).toHaveLength(0) // todavía no: falta confirmar

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/Nunca se borra lo de los últimos 30 días/)).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Depurar' }))

    await waitFor(() => expect(app.auditoria.depuradas).toHaveLength(1))
    // La consulta que se envía es la que la tabla tiene a la vista.
    expect(app.auditoria.depuradas[0]).toMatchObject({ pagina: 1, buscar: '', filtros: [] })
  })
})

describe('Empresa y Sedes', () => {
  it('guarda los datos de la empresa', async () => {
    const app = montar('/admin/config/empresa', ['config.empresa:ver', 'config.empresa:editar'])

    const ruc = (await screen.findByLabelText('RUC')) as HTMLInputElement
    await waitFor(() => expect(ruc.disabled).toBe(false)) // ya cargó los datos
    fireEvent.change(ruc, { target: { value: '20123456789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(app.empresa.guardados).toHaveLength(1))
    expect(app.empresa.guardados[0].ruc).toBe('20123456789')
  })

  it('un RUC mal escrito se corrige sin llegar al servidor', async () => {
    const app = montar('/admin/config/empresa', ['config.empresa:ver', 'config.empresa:editar'])

    const ruc = (await screen.findByLabelText('RUC')) as HTMLInputElement
    await waitFor(() => expect(ruc.disabled).toBe(false))
    fireEvent.change(ruc, { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('El RUC debe tener 11 dígitos.')).toBeTruthy()
    expect(app.empresa.guardados).toHaveLength(0)
  })

  it('solo con "ver" los campos son de lectura', async () => {
    montar('/admin/config/empresa', ['config.empresa:ver'])
    const nombre = (await screen.findByLabelText('Nombre comercial')) as HTMLInputElement
    expect(nombre.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull()
  })

  it('crea una sede', async () => {
    const app = montar('/admin/config/sedes', ['config.sedes:ver', 'config.sedes:crear'])

    fireEvent.click(await screen.findByRole('button', { name: /Nueva sede/ }))
    const modal = within(await screen.findByRole('dialog'))
    fireEvent.change(modal.getByLabelText('Nombre'), { target: { value: 'Velothr Cusco' } })
    fireEvent.change(modal.getByLabelText('Ciudad'), { target: { value: 'Cusco' } })
    fireEvent.click(modal.getByRole('button', { name: 'Crear sede' }))

    await waitFor(() => expect(app.sedeAdmin.creadas).toHaveLength(1))
    expect(app.sedeAdmin.creadas[0]).toMatchObject({ nombre: 'Velothr Cusco', ciudad: 'Cusco', estrellas: 5 })
  })
})

describe('Usuarios', () => {
  it('crea un usuario con sus roles', async () => {
    const app = montar('/admin/config/usuarios', ['config.usuarios:ver', 'config.usuarios:crear', 'config.roles:ver'], ({ rol }) => {
      rol.lista = [rolDe({ id: 2, nombre: 'Recepcionista' }), rolDe({ id: 3, nombre: 'Housekeeping' })]
    })

    fireEvent.click(await screen.findByRole('button', { name: /Nuevo usuario/ }))
    const modal = within(await screen.findByRole('dialog'))
    fireEvent.change(modal.getByLabelText('Nombre'), { target: { value: 'Rosa' } })
    fireEvent.change(modal.getByLabelText('Correo'), { target: { value: 'rosa@hotel.pe' } })
    fireEvent.change(modal.getByLabelText('Contraseña'), { target: { value: 'clave-larga-123' } })
    fireEvent.click(await modal.findByLabelText('Housekeeping'))
    fireEvent.click(modal.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(app.usuario.creados).toHaveLength(1))
    expect(app.usuario.creados[0]).toMatchObject({ nombre: 'Rosa', rolIds: [3], activo: true })
  })

  it('sin ningún rol, se avisa antes de ir al servidor', async () => {
    const app = montar('/admin/config/usuarios', ['config.usuarios:ver', 'config.usuarios:crear'])

    fireEvent.click(await screen.findByRole('button', { name: /Nuevo usuario/ }))
    const modal = within(await screen.findByRole('dialog'))
    fireEvent.change(modal.getByLabelText('Nombre'), { target: { value: 'Rosa' } })
    fireEvent.change(modal.getByLabelText('Correo'), { target: { value: 'rosa@hotel.pe' } })
    fireEvent.change(modal.getByLabelText('Contraseña'), { target: { value: 'clave-larga-123' } })
    fireEvent.click(modal.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Elige al menos un rol.')).toBeTruthy()
    expect(app.usuario.creados).toHaveLength(0)
  })
})
