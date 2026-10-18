import { useState } from 'react'
import { FaIdCard, FaRightFromBracket, FaRightToBracket } from 'react-icons/fa6'
import { DoorOpen, LogIn, LogOut, Users } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { DOCUMENTOS } from '@/domain/entities/Recepcion'
import type { DocumentoTipo, Ficha, HabitacionLibre, Movimiento } from '@/domain/entities/Recepcion'
import { ACCION } from '@/domain/entities/Permiso'
import { Alert, Badge, Button, Checkbox, Desplegable, Input, ListPage, Modal, StatCard, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import { fechaCorta, pluralNoches, rangoFechas } from '../portal/format'

const SUBMODULO = 'recepcion.estancias'
const SUBMODULO_FICHAS = 'recepcion.fichas'

interface FormCheckIn {
  habitacionId: string
  documentoTipo: DocumentoTipo
  documentoNumero: string
  nombreCompleto: string
  nacionalidad: string
  domiciliado: boolean
  fechaIngresoPais: string
  telefono: string
}

const textoFase = (m: Movimiento) => (m.fase === 'en_casa' ? 'En casa' : 'Llegada por atender')

/**
 * Recepción: las llegadas por atender y los huéspedes en casa. El check-in asigna
 * una habitación física y registra la ficha del huésped; el check-out libera la
 * habitación (queda sucia, a la espera de la limpieza).
 */
export function EstanciasPage() {
  const { useCases, hoy: hoyFn } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const hoy = hoyFn()
  const puedeAtender = puede(SUBMODULO, ACCION.confirmar)
  const puedeVerFichas = puede(SUBMODULO_FICHAS, ACCION.ver)

  const panel = useCarga<Movimiento[]>(() => useCases.panelRecepcion.execute(), [useCases], [])

  const [llegando, setLlegando] = useState<{ mov: Movimiento; form: FormCheckIn } | null>(null)
  const [libres, setLibres] = useState<{ cargando: boolean; lista: HabitacionLibre[]; error: string | null }>({
    cargando: false,
    lista: [],
    error: null,
  })
  const [saliendo, setSaliendo] = useState<Movimiento | null>(null)
  const [verFicha, setVerFicha] = useState<{ mov: Movimiento; ficha: Ficha | null; error: string | null } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const lista = panel.datos
  const llegadas = lista.filter((m) => m.fase === 'llegada')
  const enCasa = lista.filter((m) => m.fase === 'en_casa')
  const salenHoy = enCasa.filter((m) => m.checkOut <= hoy)

  async function abrirCheckIn(mov: Movimiento) {
    setErrorForm(null)
    setLlegando({
      mov,
      form: {
        habitacionId: '',
        documentoTipo: 'dni',
        documentoNumero: '',
        nombreCompleto: mov.huesped,
        nacionalidad: 'Peruana',
        domiciliado: true,
        fechaIngresoPais: '',
        telefono: '',
      },
    })
    setLibres({ cargando: true, lista: [], error: null })
    const r = await useCases.habitacionesLibres.execute(mov.reservaId)
    if (r.isLeft()) {
      setLibres({ cargando: false, lista: [], error: describeFailure(r.value) })
      return
    }
    setLibres({ cargando: false, lista: r.value, error: null })
    // Si hay habitaciones, la primera ya queda elegida.
    setLlegando((l) => (l ? { ...l, form: { ...l.form, habitacionId: String(r.value[0]?.id ?? '') } } : l))
  }

  const set = <K extends keyof FormCheckIn>(k: K, v: FormCheckIn[K]) =>
    setLlegando((l) => (l ? { ...l, form: { ...l.form, [k]: v } } : l))

  async function confirmarCheckIn() {
    if (!llegando) return
    const f = llegando.form
    setGuardando(true)
    setErrorForm(null)
    const r = await useCases.checkIn.execute({
      reservaId: llegando.mov.reservaId,
      habitacionId: Number(f.habitacionId),
      ficha: {
        documentoTipo: f.documentoTipo,
        documentoNumero: f.documentoNumero,
        nombreCompleto: f.nombreCompleto,
        nacionalidad: f.nacionalidad,
        domiciliado: f.domiciliado,
        fechaIngresoPais: f.domiciliado || f.fechaIngresoPais === '' ? null : f.fechaIngresoPais,
        telefono: f.telefono,
      },
    })
    setGuardando(false)
    if (r.isLeft()) {
      setErrorForm(describeFailure(r.value))
      return
    }
    toast.exito(`Check-in hecho: habitación ${r.value.habitacionNumero}.`)
    setLlegando(null)
    await panel.recargar()
  }

  async function confirmarCheckOut() {
    if (!saliendo?.estanciaId) return
    setGuardando(true)
    setErrorForm(null)
    const r = await useCases.checkOut.execute(saliendo.estanciaId)
    setGuardando(false)
    if (r.isLeft()) {
      setErrorForm(describeFailure(r.value))
      return
    }
    toast.exito(`Check-out hecho: la habitación ${saliendo.habitacionNumero} quedó sucia.`)
    setSaliendo(null)
    await panel.recargar()
  }

  async function abrirFicha(mov: Movimiento) {
    if (!mov.estanciaId) return
    setVerFicha({ mov, ficha: null, error: null })
    const r = await useCases.verFicha.execute(mov.estanciaId)
    setVerFicha({ mov, ficha: r.isRight() ? r.value : null, error: r.isLeft() ? describeFailure(r.value) : null })
  }

  const columnas: DataTableColumn<Movimiento>[] = [
    {
      key: 'fase',
      label: 'Estado',
      filterType: 'select',
      filterOptions: [
        { value: 'Llegada por atender', label: 'Llegada por atender' },
        { value: 'En casa', label: 'En casa' },
      ],
      value: textoFase,
      render: (m) => <Badge tone={m.fase === 'en_casa' ? 'success' : 'warning'}>{textoFase(m)}</Badge>,
    },
    {
      key: 'huesped',
      label: 'Huésped',
      filterable: false,
      value: (m) => `${m.huesped} ${m.codigo}`,
      render: (m) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{m.huesped}</div>
          <div className="font-mono text-xs text-ink-soft">{m.codigo}</div>
        </div>
      ),
    },
    {
      key: 'hotel',
      label: 'Hotel y tipo',
      filterType: 'select',
      filterOptions: [...new Set(lista.map((m) => m.sedeNombre))].map((s) => ({ value: s, label: s })),
      value: (m) => m.sedeNombre,
      render: (m) => (
        <div className="min-w-0">
          <div>{m.sedeNombre}</div>
          <div className="text-xs text-ink-soft">{m.tipoNombre}</div>
        </div>
      ),
    },
    {
      key: 'habitacion',
      label: 'Habitación',
      filterable: false,
      value: (m) => m.habitacionNumero,
      render: (m) =>
        m.habitacionNumero ? <span className="font-semibold text-ink">{m.habitacionNumero}</span> : <span className="text-ink-soft">Sin asignar</span>,
    },
    {
      key: 'estadia',
      label: 'Estadía',
      filterable: false,
      value: (m) => m.checkIn,
      render: (m) => (
        <div className="whitespace-nowrap">
          <div>{rangoFechas(m.checkIn, m.checkOut)}</div>
          <div className="text-xs text-ink-soft">
            {m.huespedes} {m.huespedes === 1 ? 'huésped' : 'huéspedes'}
            {m.fase === 'en_casa' && m.checkOut <= hoy ? ' · sale hoy' : ''}
          </div>
        </div>
      ),
    },
  ]

  const sinDatosAlojar = llegando && !libres.cargando && libres.lista.length === 0

  return (
    <ListPage
      icon={<DoorOpen size={20} />}
      title="Check-in y check-out"
      description="Las llegadas de hoy y los huéspedes en casa. Al hacer el check-out la habitación queda sucia, a la espera de la limpieza."
      alert={panel.error ? <Alert>{panel.error}</Alert> : undefined}
      stats={
        <>
          <StatCard label="Llegadas por atender" value={String(llegadas.length)} icon={<LogIn size={18} />} tono={llegadas.length > 0 ? 'warning' : 'neutral'} />
          <StatCard label="En casa" value={String(enCasa.length)} icon={<Users size={18} />} />
          <StatCard label="Salen hoy" value={String(salenHoy.length)} icon={<LogOut size={18} />} hint={`al ${fechaCorta(hoy)}`} />
        </>
      }
      columns={columnas}
      rows={lista}
      rowKey="reservaId"
      cardIcon={DoorOpen}
      actionsWidth={puedeAtender || puedeVerFichas ? 150 : 0}
      searchPlaceholder="Buscar por huésped, código o habitación..."
      empty={panel.cargando ? 'Cargando...' : 'No hay llegadas ni huéspedes en casa.'}
      rowActions={(m) => (
        <FilaAcciones>
          {m.fase === 'llegada' && puedeAtender && (
            <BotonFila color="success" titulo={`Check-in de ${m.huesped}`} onClick={() => void abrirCheckIn(m)}>
              <FaRightToBracket />
            </BotonFila>
          )}
          {m.fase === 'en_casa' && puedeAtender && (
            <BotonFila
              color="warning"
              titulo={`Check-out de la ${m.habitacionNumero}`}
              onClick={() => {
                setErrorForm(null)
                setSaliendo(m)
              }}
            >
              <FaRightFromBracket />
            </BotonFila>
          )}
          {m.fase === 'en_casa' && puedeVerFichas && (
            <BotonFila color="info" titulo={`Ver la ficha de ${m.huesped}`} onClick={() => void abrirFicha(m)}>
              <FaIdCard />
            </BotonFila>
          )}
        </FilaAcciones>
      )}
    >
      <Modal
        open={llegando !== null}
        title="Check-in"
        description={llegando ? `${llegando.mov.huesped} · ${llegando.mov.codigo} · ${llegando.mov.tipoNombre} · ${pluralNoches(
          Math.max(1, Math.round((Date.parse(`${llegando.mov.checkOut}T00:00:00Z`) - Date.parse(`${llegando.mov.checkIn}T00:00:00Z`)) / 86_400_000)),
        )}` : undefined}
        size="lg"
        onClose={() => setLlegando(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setLlegando(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} disabled={!!sinDatosAlojar || libres.cargando} onClick={() => void confirmarCheckIn()}>
              Hacer el check-in
            </Button>
          </>
        }
      >
        {llegando && (
          <div className="flex flex-col gap-4">
            {errorForm && <Alert>{errorForm}</Alert>}
            {libres.error && <Alert>{libres.error}</Alert>}
            {sinDatosAlojar && !libres.error && (
              <Alert tone="warning">
                No hay habitaciones limpias de «{llegando.mov.tipoNombre}». Pide a limpieza que libere una, o revisa el
                estado en Habitaciones.
              </Alert>
            )}

            <Desplegable
              label="Habitación a asignar"
              ariaLabel="Habitación a asignar"
              value={llegando.form.habitacionId}
              onChange={(v) => set('habitacionId', String(v))}
              options={libres.lista.map((h) => ({ value: String(h.id), label: `${h.numero} · piso ${h.piso}` }))}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Desplegable
                label="Tipo de documento"
                ariaLabel="Tipo de documento"
                value={llegando.form.documentoTipo}
                onChange={(v) => set('documentoTipo', String(v) as DocumentoTipo)}
                options={DOCUMENTOS.map((d) => ({ value: d.valor, label: d.etiqueta }))}
              />
              <Input label="Número de documento" value={llegando.form.documentoNumero} onChange={(e) => set('documentoNumero', e.target.value)} />
            </div>

            <Input label="Nombre completo" value={llegando.form.nombreCompleto} onChange={(e) => set('nombreCompleto', e.target.value)} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nacionalidad" value={llegando.form.nacionalidad} onChange={(e) => set('nacionalidad', e.target.value)} />
              <Input label="Teléfono" optional type="tel" value={llegando.form.telefono} onChange={(e) => set('telefono', e.target.value)} />
            </div>

            <Checkbox
              label="Domiciliado en el Perú"
              checked={llegando.form.domiciliado}
              onChange={(e) => set('domiciliado', e.target.checked)}
            />
            {!llegando.form.domiciliado && (
              <Input
                label="Fecha de ingreso al país"
                type="date"
                max={hoy}
                value={llegando.form.fechaIngresoPais}
                onChange={(e) => set('fechaIngresoPais', e.target.value)}
              />
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={saliendo !== null}
        title="Check-out"
        description={saliendo ? `${saliendo.huesped} · habitación ${saliendo.habitacionNumero}` : undefined}
        onClose={() => setSaliendo(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setSaliendo(null)}>
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={() => void confirmarCheckOut()}>
              Hacer el check-out
            </Button>
          </>
        }
      >
        {saliendo && (
          <div className="flex flex-col gap-3 text-sm">
            {errorForm && <Alert>{errorForm}</Alert>}
            <p>
              Se cierra la estancia y la reserva <strong>{saliendo.codigo}</strong> pasa a completada. La habitación{' '}
              <strong>{saliendo.habitacionNumero}</strong> queda <strong>sucia</strong> hasta que limpieza la libere.
            </p>
            {saliendo.checkOut > hoy && (
              <Alert tone="warning">La reserva llegaba hasta el {fechaCorta(saliendo.checkOut)}: es una salida anticipada.</Alert>
            )}
          </div>
        )}
      </Modal>

      <Modal open={verFicha !== null} title="Ficha de registro" description={verFicha?.mov.huesped} onClose={() => setVerFicha(null)}>
        {verFicha?.error && <Alert>{verFicha.error}</Alert>}
        {verFicha && !verFicha.ficha && !verFicha.error && <p className="text-sm text-ink-muted">Cargando…</p>}
        {verFicha?.ficha && (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Dato etiqueta="Documento" valor={`${DOCUMENTOS.find((d) => d.valor === verFicha.ficha?.documentoTipo)?.etiqueta ?? ''} ${verFicha.ficha.documentoNumero}`} />
            <Dato etiqueta="Nombre completo" valor={verFicha.ficha.nombreCompleto} />
            <Dato etiqueta="Nacionalidad" valor={verFicha.ficha.nacionalidad} />
            <Dato etiqueta="Domiciliado en el Perú" valor={verFicha.ficha.domiciliado ? 'Sí' : 'No'} />
            {!verFicha.ficha.domiciliado && (
              <Dato etiqueta="Ingresó al país el" valor={verFicha.ficha.fechaIngresoPais ? fechaCorta(verFicha.ficha.fechaIngresoPais) : '—'} />
            )}
            <Dato etiqueta="Teléfono" valor={verFicha.ficha.telefono || '—'} />
          </dl>
        )}
      </Modal>
    </ListPage>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{etiqueta}</dt>
      <dd className="mt-0.5 text-ink">{valor}</dd>
    </div>
  )
}
