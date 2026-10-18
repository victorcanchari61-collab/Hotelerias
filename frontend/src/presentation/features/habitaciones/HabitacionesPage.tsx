import { useMemo, useState } from 'react'
import { FaBroom, FaCircleCheck, FaPencil, FaWrench } from 'react-icons/fa6'
import { BedDouble, Hotel, ListPlus, Plus, Sparkles, SprayCan, Wrench } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { MAX_LOTE } from '@/domain/entities/Inventario'
import type {
  EstadoHabitacion,
  HabitacionFisica,
  OpcionesHabitacion,
  TipoOpcion,
} from '@/domain/entities/Inventario'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, Checkbox, Desplegable, Input, ListPage, Modal, StatCard, useToast } from '@/shared/ui'
import type { BadgeTone, DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'habitaciones.habitaciones'

const ESTADO: Record<EstadoHabitacion, { texto: string; tono: BadgeTone }> = {
  limpia: { texto: 'Limpia', tono: 'success' },
  sucia: { texto: 'Sucia', tono: 'warning' },
  ocupada: { texto: 'Ocupada', tono: 'info' },
  mantenimiento: { texto: 'En mantenimiento', tono: 'danger' },
}

/** Lo que se ve en la columna Estado: una desactivada es otra cosa que "limpia". */
const textoEstado = (h: HabitacionFisica) => (h.activa ? ESTADO[h.estado].texto : 'Desactivada')

interface Formulario {
  tipoHabitacionId: string
  numero: string
  piso: string
  notas: string
  activa: boolean
}

interface FormLote {
  tipoHabitacionId: string
  piso: string
  desde: string
  hasta: string
}

const SIN_OPCIONES: OpcionesHabitacion = { sedes: [], tipos: [] }

const etiquetaTipo = (t: TipoOpcion) => `${t.sedeNombre} · ${t.nombre}`

/**
 * El inventario de habitaciones físicas de cada hotel. La cantidad que la web
 * vende de cada tipo sale de aquí (las habitaciones ACTIVAS), y el estado
 * (limpia, sucia, mantenimiento) es el del día: no reduce lo que se vende.
 */
export function HabitacionesPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const puedeCrear = puede(SUBMODULO, ACCION.crear)
  const puedeEditar = puede(SUBMODULO, ACCION.editar)

  const habitaciones = useCarga<HabitacionFisica[]>(() => useCases.listarHabitaciones.execute(), [useCases], [])
  const opciones = useCarga<OpcionesHabitacion>(() => useCases.opcionesHabitacion.execute(), [useCases], SIN_OPCIONES)

  const [editando, setEditando] = useState<{ id: number | null; sedeId: number | null; form: Formulario } | null>(null)
  const [lote, setLote] = useState<FormLote | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<number | null>(null)

  const lista = habitaciones.datos
  const activas = lista.filter((h) => h.activa)
  const cuenta = (e: EstadoHabitacion) => activas.filter((h) => h.estado === e).length

  // Los tipos que se pueden elegir: los activos y, al editar, solo los del mismo hotel.
  const tiposElegibles = useMemo(
    () =>
      opciones.datos.tipos.filter(
        (t) =>
          (t.activo || String(t.id) === editando?.form.tipoHabitacionId) &&
          (editando?.sedeId == null || t.sedeId === editando.sedeId),
      ),
    [opciones.datos.tipos, editando],
  )
  const tiposActivos = opciones.datos.tipos.filter((t) => t.activo)

  const abrirNueva = () => {
    setErrorForm(null)
    setEditando({
      id: null,
      sedeId: null,
      form: { tipoHabitacionId: String(tiposActivos[0]?.id ?? ''), numero: '', piso: '1', notas: '', activa: true },
    })
  }

  const abrirEdicion = (h: HabitacionFisica) => {
    setErrorForm(null)
    setEditando({
      id: h.id,
      sedeId: h.sedeId,
      form: {
        tipoHabitacionId: String(h.tipoHabitacionId),
        numero: h.numero,
        piso: String(h.piso),
        notas: h.notas,
        activa: h.activa,
      },
    })
  }

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setEditando((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))

  async function guardar() {
    if (!editando) return
    const f = editando.form
    const datos = {
      tipoHabitacionId: Number(f.tipoHabitacionId),
      numero: f.numero,
      piso: Number(f.piso),
      notas: f.notas,
      activa: f.activa,
    }

    setGuardando(true)
    setErrorForm(null)
    const resultado =
      editando.id === null
        ? await useCases.crearHabitacion.execute(datos)
        : await useCases.actualizarHabitacion.execute({ id: editando.id, datos })
    setGuardando(false)

    if (resultado.isLeft()) {
      setErrorForm(describeFailure(resultado.value))
      return
    }
    toast.exito(editando.id === null ? 'Habitación creada.' : 'Habitación guardada.')
    setEditando(null)
    await habitaciones.recargar()
  }

  async function guardarLote() {
    if (!lote) return
    setGuardando(true)
    setErrorForm(null)
    const resultado = await useCases.crearLoteHabitaciones.execute({
      tipoHabitacionId: Number(lote.tipoHabitacionId),
      piso: Number(lote.piso),
      desde: Number(lote.desde),
      hasta: Number(lote.hasta),
    })
    setGuardando(false)

    if (resultado.isLeft()) {
      setErrorForm(describeFailure(resultado.value))
      return
    }
    toast.exito(`${resultado.value} habitaciones creadas.`)
    setLote(null)
    await habitaciones.recargar()
  }

  async function cambiarEstado(h: HabitacionFisica, estado: EstadoHabitacion) {
    setOcupada(h.id)
    const resultado = await useCases.cambiarEstadoHabitacion.execute({ id: h.id, estado })
    setOcupada(null)
    if (resultado.isLeft()) {
      toast.error(describeFailure(resultado.value))
      // Puede haber cambiado mientras tanto: se vuelve a mostrar lo real.
      await habitaciones.recargar()
      return
    }
    toast.exito(`Habitación ${h.numero}: ${ESTADO[estado].texto.toLowerCase()}.`)
    await habitaciones.recargar()
  }

  const columnas: DataTableColumn<HabitacionFisica>[] = [
    {
      key: 'numero',
      label: 'Habitación',
      filterable: false,
      value: (h) => h.numero,
      render: (h) => <span className="font-semibold text-ink">{h.numero}</span>,
    },
    {
      key: 'hotel',
      label: 'Hotel',
      filterType: 'select',
      filterOptions: opciones.datos.sedes.map((s) => ({ value: s.nombre, label: s.nombre })),
      value: (h) => h.sedeNombre,
      render: (h) => h.sedeNombre,
    },
    {
      key: 'tipo',
      label: 'Tipo',
      filterType: 'select',
      filterOptions: [...new Set(lista.map((h) => h.tipoNombre))].map((t) => ({ value: t, label: t })),
      value: (h) => h.tipoNombre,
      render: (h) => h.tipoNombre,
    },
    { key: 'piso', label: 'Piso', filterable: false, value: (h) => h.piso, render: (h) => h.piso },
    {
      key: 'estado',
      label: 'Estado',
      filterType: 'select',
      filterOptions: [
        ...(Object.keys(ESTADO) as EstadoHabitacion[]).map((e) => ({ value: ESTADO[e].texto, label: ESTADO[e].texto })),
        { value: 'Desactivada', label: 'Desactivada' },
      ],
      value: (h) => textoEstado(h),
      render: (h) => <Badge tone={h.activa ? ESTADO[h.estado].tono : 'neutral'}>{textoEstado(h)}</Badge>,
    },
    {
      key: 'notas',
      label: 'Notas',
      filterable: false,
      render: (h) => <span className="block max-w-56 truncate text-ink-muted">{h.notas || '—'}</span>,
    },
  ]

  const rangoLote = lote ? Number(lote.hasta) - Number(lote.desde) + 1 : 0

  return (
    <ListPage
      icon={<BedDouble size={20} />}
      title="Habitaciones"
      description="El inventario de cada hotel. Desactivar una la quita de la venta; limpia, sucia o en mantenimiento es el estado del día."
      actions={
        puedeCrear ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              iconRight={<ListPlus size={15} />}
              disabled={tiposActivos.length === 0}
              onClick={() => {
                setErrorForm(null)
                setLote({ tipoHabitacionId: String(tiposActivos[0]?.id ?? ''), piso: '1', desde: '', hasta: '' })
              }}
            >
              Crear varias
            </Button>
            <Button size="sm" iconRight={<Plus size={15} />} disabled={tiposActivos.length === 0} onClick={abrirNueva}>
              Nueva habitación
            </Button>
          </>
        ) : undefined
      }
      alert={habitaciones.error ? <Alert>{habitaciones.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Habitaciones" value={String(activas.length)} icon={<Hotel size={18} />} hint={`${lista.length - activas.length} desactivadas`} />
          <StatCard label="Limpias" value={String(cuenta('limpia'))} icon={<Sparkles size={18} />} />
          <StatCard label="Sucias" value={String(cuenta('sucia'))} icon={<SprayCan size={18} />} tono={cuenta('sucia') > 0 ? 'warning' : 'neutral'} />
          <StatCard label="En mantenimiento" value={String(cuenta('mantenimiento'))} icon={<Wrench size={18} />} tono={cuenta('mantenimiento') > 0 ? 'warning' : 'neutral'} />
        </>
      }
      columns={columnas}
      rows={lista}
      rowKey="id"
      cardIcon={BedDouble}
      actionsWidth={puedeEditar ? 230 : 0}
      searchPlaceholder="Buscar por número, hotel o tipo..."
      empty={habitaciones.cargando ? 'Cargando habitaciones...' : 'Todavía no hay habitaciones.'}
      rowActions={
        puedeEditar
          ? (h) => {
              // Una ocupada se libera con el check-out; una desactivada no tiene estado que cambiar.
              const bloqueada = h.estado === 'ocupada' || !h.activa
              const boton = (e: EstadoHabitacion) => ({
                // Una sucia se libera desde Limpieza: así queda quién la limpió y cuándo.
                disabled: bloqueada || h.estado === e || (e === 'limpia' && h.estado === 'sucia'),
                loading: ocupada === h.id,
              })
              const tituloLimpia =
                h.estado === 'sucia' ? `La ${h.numero} está sucia: se libera desde Limpieza` : `Marcar limpia la ${h.numero}`
              return (
                <FilaAcciones>
                  <BotonFila color="success" titulo={tituloLimpia} onClick={() => void cambiarEstado(h, 'limpia')} {...boton('limpia')}>
                    <FaCircleCheck />
                  </BotonFila>
                  <BotonFila color="warning" titulo={`Marcar sucia la ${h.numero}`} onClick={() => void cambiarEstado(h, 'sucia')} {...boton('sucia')}>
                    <FaBroom />
                  </BotonFila>
                  <BotonFila color="danger" titulo={`Poner en mantenimiento la ${h.numero}`} onClick={() => void cambiarEstado(h, 'mantenimiento')} {...boton('mantenimiento')}>
                    <FaWrench />
                  </BotonFila>
                  <BotonFila color="info" titulo={`Editar la ${h.numero}`} onClick={() => abrirEdicion(h)}>
                    <FaPencil />
                  </BotonFila>
                </FilaAcciones>
              )
            }
          : undefined
      }
    >
      <Modal
        open={editando !== null}
        title={editando?.id === null ? 'Nueva habitación' : 'Editar habitación'}
        description="El número es único dentro del hotel."
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardar()}>
              {editando?.id === null ? 'Crear habitación' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <Desplegable
              label="Tipo de habitación"
              ariaLabel="Tipo de habitación"
              value={editando.form.tipoHabitacionId}
              onChange={(v) => set('tipoHabitacionId', String(v))}
              options={tiposElegibles.map((t) => ({ value: String(t.id), label: etiquetaTipo(t) }))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Número" value={editando.form.numero} maxLength={10} onChange={(e) => set('numero', e.target.value)} />
              <Input label="Piso" type="number" min={-5} max={100} value={editando.form.piso} onChange={(e) => set('piso', e.target.value)} />
            </div>
            <Input label="Notas" optional value={editando.form.notas} onChange={(e) => set('notas', e.target.value)} />
            <Checkbox
              label="Activa (forma parte del inventario que se vende)"
              checked={editando.form.activa}
              onChange={(e) => set('activa', e.target.checked)}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={lote !== null}
        title="Crear varias habitaciones"
        description={`Numeradas de corrido, hasta ${MAX_LOTE} de una vez. Si alguna ya existe, no se crea ninguna.`}
        onClose={() => setLote(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setLote(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void guardarLote()}>
              {rangoLote > 0 ? `Crear ${rangoLote}` : 'Crear'}
            </Button>
          </>
        }
      >
        {lote && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <Desplegable
              label="Tipo de habitación"
              ariaLabel="Tipo de habitación"
              value={lote.tipoHabitacionId}
              onChange={(v) => setLote((l) => (l ? { ...l, tipoHabitacionId: String(v) } : l))}
              options={tiposActivos.map((t) => ({ value: String(t.id), label: etiquetaTipo(t) }))}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Piso" type="number" min={-5} max={100} value={lote.piso} onChange={(e) => setLote((l) => (l ? { ...l, piso: e.target.value } : l))} />
              <Input label="Desde el número" type="number" min={1} max={9999} value={lote.desde} onChange={(e) => setLote((l) => (l ? { ...l, desde: e.target.value } : l))} />
              <Input label="Hasta el número" type="number" min={1} max={9999} value={lote.hasta} onChange={(e) => setLote((l) => (l ? { ...l, hasta: e.target.value } : l))} />
            </div>
            {rangoLote > 0 && (
              <p className="text-sm text-ink-muted">
                Se crearán {rangoLote} {rangoLote === 1 ? 'habitación' : 'habitaciones'}: de la {lote.desde} a la {lote.hasta}.
              </p>
            )}
          </div>
        )}
      </Modal>
    </ListPage>
  )
}
