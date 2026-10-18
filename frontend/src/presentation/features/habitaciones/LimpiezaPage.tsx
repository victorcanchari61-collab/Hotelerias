import { useState } from 'react'
import { FaCheck, FaPlay, FaUserPlus } from 'react-icons/fa6'
import { CheckCheck, Flame, Hourglass, SprayCan } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { MAX_OBSERVACIONES } from '@/domain/entities/Limpieza'
import type { EstadoLimpieza, LimpiezaTerminada, PersonaLimpieza, TareaLimpieza } from '@/domain/entities/Limpieza'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, Desplegable, Input, ListPage, Modal, StatCard, Tabs, useToast } from '@/shared/ui'
import type { BadgeTone, DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'habitaciones.housekeeping'
const SIN_ASIGNAR = ''

const ESTADO: Record<EstadoLimpieza, { texto: string; tono: BadgeTone }> = {
  pendiente: { texto: 'Por asignar', tono: 'warning' },
  asignada: { texto: 'Asignada', tono: 'info' },
  en_curso: { texto: 'En curso', tono: 'accent' },
}

/** "hace 5 min", "hace 2 h", "hace 3 d". */
function hace(desde: Date | null, ahora: Date): string {
  if (!desde) return '—'
  const min = Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 60_000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 60 * 24) return `hace ${Math.floor(min / 60)} h`
  return `hace ${Math.floor(min / 60 / 24)} d`
}

const cuando = (d: Date | null) => (d ? d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—')

/**
 * El tablero de limpieza. Una habitación sucia ES una limpieza pendiente: sale sola del
 * check-out. Aquí se asigna a quien la limpia, se marca que empezó y, al terminar, queda
 * limpia (y registrada quién y cuándo). Las que hacen falta para una llegada de hoy van primero.
 */
export function LimpiezaPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const puedeAsignar = puede(SUBMODULO, ACCION.crear)
  const puedeIniciar = puede(SUBMODULO, ACCION.editar)
  const puedeTerminar = puede(SUBMODULO, ACCION.confirmar)

  const tablero = useCarga<TareaLimpieza[]>(() => useCases.tableroLimpieza.execute(), [useCases], [])
  const historial = useCarga<LimpiezaTerminada[]>(() => useCases.historialLimpieza.execute(), [useCases], [])
  const personal = useCarga<PersonaLimpieza[]>(() => useCases.personalLimpieza.execute(), [useCases], [])

  const [pestaña, setPestaña] = useState<'pendientes' | 'historial'>('pendientes')
  const [asignando, setAsignando] = useState<{ tarea: TareaLimpieza; usuarioId: string } | null>(null)
  const [terminando, setTerminando] = useState<{ tarea: TareaLimpieza; observaciones: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const ahora = new Date()
  const lista = tablero.datos
  const urgentes = lista.filter((t) => t.urgente).length
  const enCurso = lista.filter((t) => t.estado === 'en_curso').length
  const hoy = ahora.toDateString()
  const hechasHoy = historial.datos.filter((h) => h.terminadaEn?.toDateString() === hoy).length

  async function recargar() {
    await Promise.all([tablero.recargar(), historial.recargar()])
  }

  async function iniciar(t: TareaLimpieza) {
    setOcupada(t.habitacionId)
    const r = await useCases.iniciarLimpieza.execute(t.habitacionId)
    setOcupada(null)
    if (r.isLeft()) {
      toast.error(describeFailure(r.value))
    } else {
      toast.exito(`Limpieza de la ${t.numero} en curso.`)
    }
    await recargar()
  }

  async function confirmarAsignacion() {
    if (!asignando) return
    setGuardando(true)
    setErrorForm(null)
    const r = await useCases.asignarLimpieza.execute({
      habitacionId: asignando.tarea.habitacionId,
      usuarioId: asignando.usuarioId === SIN_ASIGNAR ? null : Number(asignando.usuarioId),
    })
    setGuardando(false)
    if (r.isLeft()) {
      setErrorForm(describeFailure(r.value))
      return
    }
    toast.exito(asignando.usuarioId === SIN_ASIGNAR ? 'Responsable quitado.' : 'Limpieza asignada.')
    setAsignando(null)
    await recargar()
  }

  async function confirmarTerminar() {
    if (!terminando) return
    setGuardando(true)
    setErrorForm(null)
    const r = await useCases.terminarLimpieza.execute({
      habitacionId: terminando.tarea.habitacionId,
      observaciones: terminando.observaciones,
    })
    setGuardando(false)
    if (r.isLeft()) {
      setErrorForm(describeFailure(r.value))
      return
    }
    toast.exito(`Habitación ${terminando.tarea.numero} limpia: ya se puede asignar.`)
    setTerminando(null)
    await recargar()
  }

  const columnasPendientes: DataTableColumn<TareaLimpieza>[] = [
    {
      key: 'habitacion',
      label: 'Habitación',
      filterable: false,
      value: (t) => t.numero,
      render: (t) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink">{t.numero}</span>
          {t.urgente && <Badge tone="danger">Urgente</Badge>}
        </div>
      ),
    },
    {
      key: 'hotel',
      label: 'Hotel y tipo',
      filterType: 'select',
      filterOptions: [...new Set(lista.map((t) => t.sedeNombre))].map((s) => ({ value: s, label: s })),
      value: (t) => t.sedeNombre,
      render: (t) => (
        <div className="min-w-0">
          <div>{t.sedeNombre}</div>
          <div className="text-xs text-ink-soft">
            {t.tipoNombre} · piso {t.piso}
          </div>
        </div>
      ),
    },
    {
      key: 'sucia',
      label: 'Sucia',
      filterable: false,
      value: (t) => t.suciaDesde?.getTime() ?? 0,
      render: (t) => <span className="whitespace-nowrap text-ink-muted">{hace(t.suciaDesde, ahora)}</span>,
    },
    {
      key: 'estado',
      label: 'Estado',
      filterType: 'select',
      filterOptions: (Object.keys(ESTADO) as EstadoLimpieza[]).map((e) => ({ value: ESTADO[e].texto, label: ESTADO[e].texto })),
      value: (t) => ESTADO[t.estado].texto,
      render: (t) => <Badge tone={ESTADO[t.estado].tono}>{ESTADO[t.estado].texto}</Badge>,
    },
    {
      key: 'responsable',
      label: 'Responsable',
      filterable: false,
      value: (t) => t.asignadaANombre,
      render: (t) => t.asignadaANombre || <span className="text-ink-soft">—</span>,
    },
  ]

  const columnasHistorial: DataTableColumn<LimpiezaTerminada>[] = [
    { key: 'habitacion', label: 'Habitación', filterable: false, value: (h) => h.numero, render: (h) => <span className="font-semibold text-ink">{h.numero}</span> },
    {
      key: 'hotel',
      label: 'Hotel y tipo',
      filterType: 'select',
      filterOptions: [...new Set(historial.datos.map((h) => h.sedeNombre))].map((s) => ({ value: s, label: s })),
      value: (h) => h.sedeNombre,
      render: (h) => (
        <div className="min-w-0">
          <div>{h.sedeNombre}</div>
          <div className="text-xs text-ink-soft">{h.tipoNombre}</div>
        </div>
      ),
    },
    { key: 'quien', label: 'La limpió', filterable: false, value: (h) => h.terminadaPor, render: (h) => h.terminadaPor || '—' },
    {
      key: 'termino',
      label: 'Terminó',
      filterable: false,
      value: (h) => h.terminadaEn?.getTime() ?? 0,
      render: (h) => <span className="whitespace-nowrap">{cuando(h.terminadaEn)}</span>,
    },
    {
      key: 'duracion',
      label: 'Duración',
      align: 'right',
      filterable: false,
      value: (h) => h.minutos ?? -1,
      render: (h) => (h.minutos === null ? '—' : `${h.minutos} min`),
    },
    {
      key: 'obs',
      label: 'Observaciones',
      filterable: false,
      render: (h) => <span className="block max-w-56 truncate text-ink-muted">{h.observaciones || '—'}</span>,
    },
  ]

  const error = tablero.error ?? historial.error

  // Lo que las dos pestañas comparten: cabecera, indicadores y las pestañas mismas.
  const comunes = {
    icon: <SprayCan size={20} />,
    title: 'Limpieza',
    description:
      'Las habitaciones sucias salen solas del check-out. Al terminar una queda limpia y registrada, y se puede asignar a un huésped.',
    alert: error ? <Alert>{error}</Alert> : undefined,
    stats: (
      <>
        <StatCard label="Por limpiar" value={String(lista.length)} icon={<Hourglass size={18} />} tono={lista.length > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Urgentes" value={String(urgentes)} icon={<Flame size={18} />} tono={urgentes > 0 ? 'danger' : 'neutral'} hint="faltan para una llegada de hoy" />
        <StatCard label="En curso" value={String(enCurso)} icon={<SprayCan size={18} />} />
        <StatCard label="Limpiadas hoy" value={String(hechasHoy)} icon={<CheckCheck size={18} />} />
      </>
    ),
    banner: (
      <Tabs
        active={pestaña}
        onChange={(id) => setPestaña(id as 'pendientes' | 'historial')}
        items={[
          { id: 'pendientes', label: 'Por limpiar', badge: lista.length },
          { id: 'historial', label: 'Historial' },
        ]}
      />
    ),
    cardIcon: SprayCan,
    searchPlaceholder: 'Buscar por habitación, hotel o persona...',
  }

  if (pestaña === 'historial') {
    return (
      <ListPage<LimpiezaTerminada>
        key="historial"
        {...comunes}
        columns={columnasHistorial}
        rows={historial.datos}
        rowKey="id"
        actionsWidth={0}
        empty={historial.cargando ? 'Cargando...' : 'Todavía no hay limpiezas registradas.'}
      />
    )
  }

  return (
    <ListPage<TareaLimpieza>
      key="pendientes"
      {...comunes}
      columns={columnasPendientes}
      rows={lista}
      rowKey="habitacionId"
      actionsWidth={puedeAsignar || puedeIniciar || puedeTerminar ? 180 : 0}
      empty={tablero.cargando ? 'Cargando...' : 'No hay habitaciones por limpiar.'}
      rowActions={(t) => (
        <FilaAcciones>
          {puedeAsignar && (
            <BotonFila
              color="info"
              titulo={`Asignar la ${t.numero}`}
              onClick={() => {
                setErrorForm(null)
                setAsignando({ tarea: t, usuarioId: t.asignadaA ? String(t.asignadaA) : SIN_ASIGNAR })
              }}
            >
              <FaUserPlus />
            </BotonFila>
          )}
          {puedeIniciar && (
            <BotonFila
              color="warning"
              titulo={`Empezar la ${t.numero}`}
              disabled={t.estado === 'en_curso'}
              loading={ocupada === t.habitacionId}
              onClick={() => void iniciar(t)}
            >
              <FaPlay />
            </BotonFila>
          )}
          {puedeTerminar && (
            <BotonFila
              color="success"
              titulo={`Terminar la ${t.numero}`}
              onClick={() => {
                setErrorForm(null)
                setTerminando({ tarea: t, observaciones: '' })
              }}
            >
              <FaCheck />
            </BotonFila>
          )}
        </FilaAcciones>
      )}
    >
      <Modal
        open={asignando !== null}
        title="Asignar limpieza"
        description={asignando ? `${asignando.tarea.sedeNombre} · habitación ${asignando.tarea.numero}` : undefined}
        onClose={() => setAsignando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAsignando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void confirmarAsignacion()}>
              Guardar
            </Button>
          </>
        }
      >
        {asignando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            {asignando.tarea.estado === 'en_curso' && (
              <Alert tone="warning">Ya está en curso: puedes cambiar a la responsable, pero no dejarla sin asignar.</Alert>
            )}
            <Desplegable
              label="Responsable"
              ariaLabel="Responsable"
              value={asignando.usuarioId}
              onChange={(v) => setAsignando((a) => (a ? { ...a, usuarioId: String(v) } : a))}
              options={[
                { value: SIN_ASIGNAR, label: 'Sin asignar' },
                ...personal.datos.map((p) => ({ value: String(p.id), label: p.nombre })),
              ]}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={terminando !== null}
        title="Terminar limpieza"
        description={terminando ? `${terminando.tarea.sedeNombre} · habitación ${terminando.tarea.numero}` : undefined}
        onClose={() => setTerminando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTerminando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void confirmarTerminar()}>
              Dejarla limpia
            </Button>
          </>
        }
      >
        {terminando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            <p className="text-sm text-ink-muted">
              La habitación queda <strong>limpia</strong> y se registra quién la limpió y cuándo. Desde ese momento se puede
              asignar a un huésped.
            </p>
            <Input
              label="Observaciones"
              optional
              maxLength={MAX_OBSERVACIONES}
              value={terminando.observaciones}
              onChange={(e) => setTerminando((t) => (t ? { ...t, observaciones: e.target.value } : t))}
            />
          </div>
        )}
      </Modal>
    </ListPage>
  )
}
