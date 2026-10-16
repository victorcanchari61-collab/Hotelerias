import { useState } from 'react'
import { Inbox } from 'lucide-react'
import { FaBan, FaCircleCheck } from 'react-icons/fa6'
import { describeFailure } from '@/core/errors/failures'
import type { SolicitudPermiso, Vigencia } from '@/domain/entities/Configuracion'
import { Alert, Badge, Button, Checkbox, Input, Modal, Select, SysDataTable, useToast } from '@/shared/ui'
import type { DataTableColumn } from '@/shared/ui'
import { BotonFila, FilaAcciones } from '../../components/BotonesFila'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import { ETIQUETA_ACCION, etiquetaSubmodulo } from './matriz'

type Decision = { solicitud: SolicitudPermiso; tipo: 'aprobar' | 'rechazar' }

function aIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const TONO = { pendiente: 'warning', aprobada: 'sys', rechazada: 'neutral' } as const

/**
 * La bandeja del administrador: lo que la gente pidió al toparse con una acción
 * bloqueada. Aprobar crea la excepción; la decisión es una transacción: dos
 * administradores con la bandeja abierta no conceden dos veces.
 */
export function Bandeja({ puedeResolver }: { puedeResolver: boolean }) {
  const { useCases } = useDependencies()
  const toast = useToast()
  const { refrescar } = usePermisos()

  const [soloPendientes, setSoloPendientes] = useState(true)
  const solicitudes = useCarga<SolicitudPermiso[]>(
    () => useCases.bandejaSolicitudes.execute(soloPendientes),
    [useCases, soloPendientes],
    [],
  )

  const [decision, setDecision] = useState<Decision | null>(null)
  const [vigencia, setVigencia] = useState<Vigencia>('una_vez')
  const [expira, setExpira] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function abrir(solicitud: SolicitudPermiso, tipo: Decision['tipo']) {
    setDecision({ solicitud, tipo })
    setVigencia('una_vez')
    setExpira('')
    setRespuesta('')
    setError(null)
  }

  async function resolver() {
    if (!decision) return
    setEnviando(true)
    setError(null)

    const r =
      decision.tipo === 'aprobar'
        ? await useCases.aprobarSolicitud.execute({
            id: decision.solicitud.id,
            vigencia,
            expiraEn: aIso(expira),
            respuesta,
          })
        : await useCases.rechazarSolicitud.execute({ id: decision.solicitud.id, respuesta })
    setEnviando(false)

    if (r.isLeft()) {
      setError(describeFailure(r.value))
      // Otro administrador la resolvió antes: se refresca para mostrar cómo quedó.
      if (r.value.kind === 'validation') void solicitudes.recargar()
      return
    }
    toast.exito(decision.tipo === 'aprobar' ? 'Solicitud aprobada.' : 'Solicitud rechazada.')
    setDecision(null)
    await solicitudes.recargar()
    void refrescar()
  }

  const columnas: DataTableColumn<SolicitudPermiso>[] = [
    {
      key: 'usuario',
      label: 'Persona',
      filterable: false,
      render: (s) => <span className="font-medium text-ink">{s.usuario}</span>,
    },
    {
      key: 'pide',
      label: 'Pide',
      filterable: false,
      value: (s) => `${etiquetaSubmodulo(s.submodulo)} ${s.accion}`,
      render: (s) => (
        <div className="min-w-0">
          <div>
            {ETIQUETA_ACCION[s.accion as keyof typeof ETIQUETA_ACCION] ?? s.accion} en{' '}
            <strong>{etiquetaSubmodulo(s.submodulo)}</strong>
          </div>
          {s.referencia && <div className="text-xs text-ink-soft">{s.referencia}</div>}
        </div>
      ),
    },
    {
      key: 'motivo',
      label: 'Motivo',
      filterable: false,
      render: (s) => (
        <div className="min-w-0">
          <div>{s.motivo || '—'}</div>
          {s.respuesta && <div className="text-xs text-ink-soft">Respuesta: {s.respuesta}</div>}
        </div>
      ),
    },
    {
      key: 'fecha',
      label: 'Fecha',
      filterType: 'date',
      value: (s) => s.fechaSolicitud?.getTime() ?? 0,
      render: (s) => <span className="whitespace-nowrap">{s.fechaSolicitud?.toLocaleString('es-PE') ?? '—'}</span>,
    },
    {
      key: 'estado',
      label: 'Estado',
      filterType: 'select',
      filterOptions: [
        { value: 'Pendiente', label: 'Pendiente' },
        { value: 'Aprobada', label: 'Aprobada' },
        { value: 'Rechazada', label: 'Rechazada' },
      ],
      value: (s) => (s.estado === 'pendiente' ? 'Pendiente' : s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'),
      render: (s) => (
        <Badge tone={TONO[s.estado]}>
          {s.estado === 'pendiente' ? 'Pendiente' : s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Checkbox
          label="Solo pendientes"
          checked={soloPendientes}
          onChange={(e) => setSoloPendientes(e.target.checked)}
        />
        <Button variant="secondary" size="sm" onClick={() => void solicitudes.recargar()}>
          Actualizar
        </Button>
      </div>

      {solicitudes.error && <Alert>{solicitudes.error}</Alert>}

      <SysDataTable
        columns={columnas}
        rows={solicitudes.datos}
        rowKey="id"
        cardIcon={Inbox}
        actionsWidth={puedeResolver ? 120 : 0}
        searchPlaceholder="Buscar por persona o permiso..."
        empty={
          solicitudes.cargando
            ? 'Cargando solicitudes...'
            : soloPendientes
              ? 'No hay solicitudes pendientes.'
              : 'No hay solicitudes.'
        }
        actions={
          puedeResolver
            ? (s) => (
                <FilaAcciones>
                  <BotonFila
                    color="success"
                    titulo={`Aprobar la solicitud de ${s.usuario}`}
                    disabled={s.estado !== 'pendiente'}
                    onClick={() => abrir(s, 'aprobar')}
                  >
                    <FaCircleCheck />
                  </BotonFila>
                  <BotonFila
                    color="danger"
                    titulo={`Rechazar la solicitud de ${s.usuario}`}
                    disabled={s.estado !== 'pendiente'}
                    onClick={() => abrir(s, 'rechazar')}
                  >
                    <FaBan />
                  </BotonFila>
                </FilaAcciones>
              )
            : undefined
        }
      />

      <Modal
        open={decision !== null}
        title={decision?.tipo === 'aprobar' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
        onClose={() => setDecision(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)}>Cancelar</Button>
            <Button loading={enviando} onClick={() => void resolver()}>
              {decision?.tipo === 'aprobar' ? 'Aprobar' : 'Rechazar'}
            </Button>
          </>
        }
      >
        {decision && (
          <div className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <p className="text-sm text-ink-muted">
              {decision.solicitud.usuario} pide{' '}
              <strong className="text-ink">
                {ETIQUETA_ACCION[decision.solicitud.accion as keyof typeof ETIQUETA_ACCION] ?? decision.solicitud.accion}
              </strong>{' '}
              en <strong className="text-ink">{etiquetaSubmodulo(decision.solicitud.submodulo)}</strong>.
            </p>

            {decision.tipo === 'aprobar' && (
              <>
                <Select label="Vigencia" value={vigencia} onChange={(e) => setVigencia(e.target.value as Vigencia)}>
                  <option value="una_vez">Una sola vez</option>
                  <option value="temporal">Hasta una fecha</option>
                  <option value="permanente">Permanente</option>
                </Select>
                {vigencia === 'temporal' && (
                  <Input label="Vence" type="datetime-local" value={expira} onChange={(e) => setExpira(e.target.value)} />
                )}
              </>
            )}

            <Input
              label="Respuesta"
              optional
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              placeholder="Se la mostramos a quien pidió"
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
