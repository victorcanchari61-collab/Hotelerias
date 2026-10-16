import { useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { sumarDias } from '@/domain/fechas'
import { ACCION } from '@/domain/entities/Permiso'
import type { Promocion, PromocionInput, TipoPromocion } from '@/domain/entities/Portal'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  PageHeader,
  Select,
  useToast,
} from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import {
  beneficioTexto,
  centimosASoles,
  fechaCorta,
  solesACentimos,
} from '../portal/format'

const SUBMODULO = 'reservas.paquetes'

interface Formulario {
  nombre: string
  descripcion: string
  tipo: TipoPromocion
  porcentaje: string
  montoSoles: string
  codigo: string
  sedeId: string
  tipoClienteId: string
  desde: string
  hasta: string
  minNoches: string
  activo: boolean
}

function vacio(hoy: string): Formulario {
  return {
    nombre: '',
    descripcion: '',
    tipo: 'porcentaje',
    porcentaje: '10',
    montoSoles: '',
    codigo: '',
    sedeId: '',
    tipoClienteId: '',
    desde: hoy,
    hasta: sumarDias(hoy, 90),
    minNoches: '1',
    activo: true,
  }
}

function deOferta(p: Promocion): Formulario {
  return {
    nombre: p.nombre,
    descripcion: p.descripcion,
    tipo: p.tipo,
    porcentaje: p.porcentaje === null ? '' : String(p.porcentaje),
    montoSoles: p.montoNocheCent === null ? '' : centimosASoles(p.montoNocheCent),
    codigo: p.codigo ?? '',
    sedeId: p.sedeId === null ? '' : String(p.sedeId),
    tipoClienteId: p.tipoClienteId === null ? '' : String(p.tipoClienteId),
    desde: p.desde,
    hasta: p.hasta,
    minNoches: String(p.minNoches),
    activo: p.activo,
  }
}

export function PromocionesPage() {
  const { useCases, hoy } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()

  const puedeCrear = puede(SUBMODULO, ACCION.crear)
  const puedeEditar = puede(SUBMODULO, ACCION.editar)

  const promos = useCarga<Promocion[]>(() => useCases.listarPromocionesAdmin.execute(), [useCases], [])
  const sedes = useCarga(() => useCases.listarSedes.execute(), [useCases], [])
  // Puede faltar el permiso de fidelización: sin él el selector solo ofrece "todos".
  const tipos = useCarga(() => useCases.listarTiposCliente.execute(), [useCases], [])

  const [editando, setEditando] = useState<{ id: number | null; form: Formulario } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const nombreSede = (id: number | null) =>
    id === null ? 'Todos los hoteles' : (sedes.datos.find((s) => s.id === id)?.nombre ?? `Hotel ${id}`)
  const nombreTipo = (id: number | null) =>
    id === null ? 'Todos los huéspedes' : (tipos.datos.find((t) => t.id === id)?.nombre ?? `Tipo ${id}`)

  function abrirNueva() {
    setErrorForm(null)
    setEditando({ id: null, form: vacio(hoy()) })
  }

  function abrirEditar(p: Promocion) {
    setErrorForm(null)
    setEditando({ id: p.id, form: deOferta(p) })
  }

  async function guardar() {
    if (!editando) return
    const f = editando.form

    // El importe se interpreta aquí; el resto de reglas las aplica el caso de uso.
    let montoNocheCent: number | null = null
    if (f.tipo === 'monto_noche') {
      montoNocheCent = solesACentimos(f.montoSoles)
      if (montoNocheCent === null) {
        setErrorForm('El monto por noche no es un importe válido (por ejemplo 80 o 80.50).')
        return
      }
    }

    const input: PromocionInput = {
      nombre: f.nombre,
      descripcion: f.descripcion,
      tipo: f.tipo,
      porcentaje: f.tipo === 'porcentaje' ? Number(f.porcentaje) : null,
      montoNocheCent,
      codigo: f.codigo.trim() === '' ? null : f.codigo,
      sedeId: f.sedeId === '' ? null : Number(f.sedeId),
      tipoClienteId: f.tipoClienteId === '' ? null : Number(f.tipoClienteId),
      desde: f.desde,
      hasta: f.hasta,
      minNoches: Number(f.minNoches),
      activo: f.activo,
    }

    setGuardando(true)
    setErrorForm(null)
    const resultado =
      editando.id === null
        ? await useCases.crearPromocion.execute(input)
        : await useCases.actualizarPromocion.execute({ id: editando.id, datos: input })
    setGuardando(false)

    if (resultado.isLeft()) {
      setErrorForm(describeFailure(resultado.value))
      return
    }
    toast.exito(editando.id === null ? 'Oferta creada.' : 'Oferta guardada.')
    setEditando(null)
    await promos.recargar()
  }

  async function alternar(p: Promocion) {
    const resultado = await useCases.actualizarPromocion.execute({
      id: p.id,
      datos: { ...p, activo: !p.activo },
    })
    if (resultado.isLeft()) {
      toast.error(describeFailure(resultado.value))
      return
    }
    toast.exito(p.activo ? 'Oferta desactivada.' : 'Oferta activada.')
    await promos.recargar()
  }

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Paquetes y promociones"
        description="Las ofertas que el hotel ofrece en la web. Se aplican solas o con un código; no se acumulan: gana la mejor para el huésped."
        icon={<Package size={20} />}
        actions={
          puedeCrear ? (
            <Button onClick={abrirNueva} iconRight={<Plus size={16} />}>
              Nueva oferta
            </Button>
          ) : undefined
        }
      />

      {promos.error && <Alert>{promos.error}</Alert>}

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-alt text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Oferta</th>
                <th className="px-4 py-3 font-semibold">Beneficio</th>
                <th className="px-4 py-3 font-semibold">Para</th>
                <th className="px-4 py-3 font-semibold">Estadías</th>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                {puedeEditar && <th className="px-4 py-3 text-right font-semibold">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {promos.cargando && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted">Cargando…</td></tr>
              )}
              {!promos.cargando && promos.datos.length === 0 && !promos.error && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted">Aún no hay ofertas.</td></tr>
              )}
              {promos.datos.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{p.nombre}</p>
                    {p.minNoches > 1 && <p className="text-xs text-ink-muted">Desde {p.minNoches} noches</p>}
                  </td>
                  <td className="px-4 py-3 text-ink">{beneficioTexto(p)}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    <p>{nombreSede(p.sedeId)}</p>
                    <p className="text-xs">{nombreTipo(p.tipoClienteId)}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                    {fechaCorta(p.desde)} → {fechaCorta(p.hasta)}
                  </td>
                  <td className="px-4 py-3">
                    {p.codigo ? <Badge tone="info">{p.codigo}</Badge> : <span className="text-ink-soft">Automática</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={p.activo ? 'success' : 'neutral'}>{p.activo ? 'Activa' : 'Inactiva'}</Badge>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => abrirEditar(p)}>Editar</Button>
                        <Button variant="ghost" onClick={() => void alternar(p)}>
                          {p.activo ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={editando !== null}
        title={editando?.id === null ? 'Nueva oferta' : 'Editar oferta'}
        size="lg"
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button loading={guardando} onClick={() => void guardar()}>Guardar</Button>
          </>
        }
      >
        {editando && (
          <div className="space-y-4">
            {errorForm && <Alert>{errorForm}</Alert>}

            <Input label="Nombre" value={editando.form.nombre} onChange={(e) => set('nombre', e.target.value)} />
            <Input
              label="Descripción"
              optional
              value={editando.form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Tipo de descuento" value={editando.form.tipo} onChange={(e) => set('tipo', e.target.value as TipoPromocion)}>
                <option value="porcentaje">Porcentaje del total</option>
                <option value="monto_noche">Monto fijo por noche</option>
              </Select>
              {editando.form.tipo === 'porcentaje' ? (
                <Input
                  label="Porcentaje (1–100)"
                  type="number"
                  min={1}
                  max={100}
                  value={editando.form.porcentaje}
                  onChange={(e) => set('porcentaje', e.target.value)}
                />
              ) : (
                <Input
                  label="Monto por noche (S/)"
                  inputMode="decimal"
                  value={editando.form.montoSoles}
                  onChange={(e) => set('montoSoles', e.target.value)}
                  placeholder="80.00"
                />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Hotel" value={editando.form.sedeId} onChange={(e) => set('sedeId', e.target.value)}>
                <option value="">Todos los hoteles</option>
                {sedes.datos.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </Select>
              <Select
                label="Tipo de huésped"
                value={editando.form.tipoClienteId}
                onChange={(e) => set('tipoClienteId', e.target.value)}
              >
                <option value="">Todos los huéspedes</option>
                {tipos.datos.map((t) => <option key={t.id} value={t.id}>Solo {t.nombre}</option>)}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Estadías desde" type="date" value={editando.form.desde} onChange={(e) => set('desde', e.target.value)} />
              <Input label="Hasta" type="date" min={editando.form.desde} value={editando.form.hasta} onChange={(e) => set('hasta', e.target.value)} />
              <Input
                label="Mínimo de noches"
                type="number"
                min={1}
                value={editando.form.minNoches}
                onChange={(e) => set('minNoches', e.target.value)}
              />
            </div>

            <Input
              label="Código"
              optional
              hint="Vacío = se aplica sola"
              value={editando.form.codigo}
              onChange={(e) => set('codigo', e.target.value.toUpperCase())}
              placeholder="BIENVENIDO10"
            />

            <Checkbox label="Activa" checked={editando.form.activo} onChange={(e) => set('activo', e.target.checked)} />
          </div>
        )}
      </Modal>
    </div>
  )
}
