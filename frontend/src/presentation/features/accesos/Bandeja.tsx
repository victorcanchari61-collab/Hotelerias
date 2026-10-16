import { useState } from 'react'
import { describeFailure } from '@/core/errors/failures'
import type { SolicitudPermiso, Vigencia } from '@/domain/entities/Configuracion'
import { Alert, Badge, Button, Card, Checkbox, Input, Modal, Select, useToast } from '@/shared/ui'
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

const TONO = { pendiente: 'warning', aprobada: 'success', rechazada: 'neutral' } as const

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

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-alt text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Persona</th>
                <th className="px-4 py-3 font-semibold">Pide</th>
                <th className="px-4 py-3 font-semibold">Motivo</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                {puedeResolver && <th className="px-4 py-3 text-right font-semibold">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!solicitudes.cargando && solicitudes.datos.length === 0 && !solicitudes.error && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-ink-muted">
                    {soloPendientes ? 'No hay solicitudes pendientes.' : 'No hay solicitudes.'}
                  </td>
                </tr>
              )}
              {solicitudes.datos.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium text-ink">{s.usuario}</td>
                  <td className="px-4 py-3">
                    {ETIQUETA_ACCION[s.accion as keyof typeof ETIQUETA_ACCION] ?? s.accion} en{' '}
                    <strong>{etiquetaSubmodulo(s.submodulo)}</strong>
                    {s.referencia && <p className="text-xs text-ink-muted">{s.referencia}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {s.motivo || '—'}
                    {s.respuesta && <p className="text-xs">Respuesta: {s.respuesta}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                    {s.fechaSolicitud?.toLocaleString('es-PE') ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={TONO[s.estado]}>
                      {s.estado === 'pendiente' ? 'Pendiente' : s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                    </Badge>
                  </td>
                  {puedeResolver && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {s.estado === 'pendiente' && (
                          <>
                            <Button variant="ghost" onClick={() => abrir(s, 'aprobar')}>Aprobar</Button>
                            <Button variant="ghost" onClick={() => abrir(s, 'rechazar')}>Rechazar</Button>
                          </>
                        )}
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
