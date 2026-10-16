import { useState } from 'react'
import { FaBan, FaCircleCheck, FaPencil } from 'react-icons/fa6'
import { BadgePercent, Package, Plus, Tag } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { ACCION } from '@/domain/entities/Permiso'
import type { Promocion, PromocionInput, TipoPromocion } from '@/domain/entities/Portal'
import { sumarDias } from '@/domain/fechas'
import { Alert, Badge, Button, Checkbox, Input, ListPage, Modal, Select, StatCard, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import { beneficioTexto, centimosASoles, fechaCorta, solesACentimos } from '../portal/format'

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
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const nombreSede = (id: number | null) =>
    id === null ? 'Todos los hoteles' : (sedes.datos.find((s) => s.id === id)?.nombre ?? `Hotel ${id}`)
  const nombreTipo = (id: number | null) =>
    id === null ? 'Todos los huéspedes' : (tipos.datos.find((t) => t.id === id)?.nombre ?? `Tipo ${id}`)

  const activas = promos.datos.filter((p) => p.activo).length
  const conCodigo = promos.datos.filter((p) => p.codigo !== null).length

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
    setOcupada(p.id)
    const resultado = await useCases.actualizarPromocion.execute({ id: p.id, datos: { ...p, activo: !p.activo } })
    setOcupada(null)
    if (resultado.isLeft()) {
      toast.error(describeFailure(resultado.value))
      return
    }
    toast.exito(p.activo ? 'Oferta desactivada.' : 'Oferta activada.')
    await promos.recargar()
  }

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))

  const columnas: DataTableColumn<Promocion>[] = [
    {
      key: 'nombre',
      label: 'Oferta',
      filterable: false,
      render: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{p.nombre}</div>
          {p.minNoches > 1 && <div className="text-xs text-ink-soft">Desde {p.minNoches} noches</div>}
        </div>
      ),
    },
    {
      key: 'beneficio',
      label: 'Beneficio',
      filterable: false,
      value: (p) => beneficioTexto(p),
      render: (p) => beneficioTexto(p),
    },
    {
      key: 'para',
      label: 'Para',
      filterable: false,
      value: (p) => `${nombreSede(p.sedeId)} ${nombreTipo(p.tipoClienteId)}`,
      render: (p) => (
        <div className="min-w-0">
          <div>{nombreSede(p.sedeId)}</div>
          <div className="text-xs text-ink-soft">{nombreTipo(p.tipoClienteId)}</div>
        </div>
      ),
    },
    {
      key: 'estadias',
      label: 'Estadías',
      filterType: 'date',
      value: (p) => new Date(`${p.desde}T00:00:00`).getTime(),
      render: (p) => `${fechaCorta(p.desde)} → ${fechaCorta(p.hasta)}`,
    },
    {
      key: 'codigo',
      label: 'Código',
      filterable: false,
      value: (p) => p.codigo ?? '',
      render: (p) => (p.codigo ? <Badge tone="info">{p.codigo}</Badge> : <span className="text-ink-soft">Automática</span>),
    },
    {
      key: 'activo',
      label: 'Estado',
      filterType: 'select',
      filterOptions: [
        { value: 'Activa', label: 'Activa' },
        { value: 'Inactiva', label: 'Inactiva' },
      ],
      value: (p) => (p.activo ? 'Activa' : 'Inactiva'),
      render: (p) => <Badge tone={p.activo ? 'sys' : 'neutral'}>{p.activo ? 'Activa' : 'Inactiva'}</Badge>,
    },
  ]

  return (
    <ListPage
      icon={<Package size={20} />}
      title="Paquetes y promociones"
      description="Las ofertas que el hotel ofrece en la web. Se aplican solas o con un código; no se acumulan: gana la mejor para el huésped."
      actions={
        puedeCrear ? (
          <Button
            size="sm"
            iconRight={<Plus size={15} />}
            onClick={() => {
              setErrorForm(null)
              setEditando({ id: null, form: vacio(hoy()) })
            }}
          >
            Nueva oferta
          </Button>
        ) : undefined
      }
      alert={promos.error ? <Alert>{promos.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Ofertas" value={String(promos.datos.length)} icon={<Package size={18} />} />
          <StatCard
            label="Activas"
            value={String(activas)}
            icon={<BadgePercent size={18} />}
            hint={`${promos.datos.length - activas} desactivadas`}
          />
          <StatCard label="Con código" value={String(conCodigo)} icon={<Tag size={18} />} hint="solo con el código" />
        </>
      }
      columns={columnas}
      rows={promos.datos}
      rowKey="id"
      cardIcon={Package}
      actionsWidth={puedeEditar ? 130 : 0}
      searchPlaceholder="Buscar por nombre o código..."
      empty={promos.cargando ? 'Cargando ofertas...' : 'Aún no hay ofertas.'}
      rowActions={
        puedeEditar
          ? (p) => (
              <FilaAcciones>
                <BotonFila
                  color="info"
                  titulo={`Editar ${p.nombre}`}
                  onClick={() => {
                    setErrorForm(null)
                    setEditando({ id: p.id, form: deOferta(p) })
                  }}
                >
                  <FaPencil />
                </BotonFila>
                <BotonFila
                  color={p.activo ? 'warning' : 'success'}
                  titulo={`${p.activo ? 'Desactivar' : 'Activar'} ${p.nombre}`}
                  loading={ocupada === p.id}
                  onClick={() => void alternar(p)}
                >
                  {p.activo ? <FaBan /> : <FaCircleCheck />}
                </BotonFila>
              </FilaAcciones>
            )
          : undefined
      }
    >
      <Modal
        open={editando !== null}
        title={editando?.id === null ? 'Nueva oferta' : 'Editar oferta'}
        description="Para qué estadías vale y a quién."
        size="lg"
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardar()}>
              {editando?.id === null ? 'Crear oferta' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}

            <Input label="Nombre" value={editando.form.nombre} onChange={(e) => set('nombre', e.target.value)} />
            <Input label="Descripción" optional value={editando.form.descripcion} onChange={(e) => set('descripcion', e.target.value)} />

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
              <Select label="Tipo de huésped" value={editando.form.tipoClienteId} onChange={(e) => set('tipoClienteId', e.target.value)}>
                <option value="">Todos los huéspedes</option>
                {tipos.datos.map((t) => <option key={t.id} value={t.id}>Solo {t.nombre}</option>)}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Estadías desde" type="date" value={editando.form.desde} onChange={(e) => set('desde', e.target.value)} />
              <Input label="Hasta" type="date" min={editando.form.desde} value={editando.form.hasta} onChange={(e) => set('hasta', e.target.value)} />
              <Input label="Mínimo de noches" type="number" min={1} value={editando.form.minNoches} onChange={(e) => set('minNoches', e.target.value)} />
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
    </ListPage>
  )
}
