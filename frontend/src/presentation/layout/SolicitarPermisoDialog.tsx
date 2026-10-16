import { useEffect, useState } from 'react'
import type { PermisoNegado } from '@/core/errors/exceptions'
import { describeFailure } from '@/core/errors/failures'
import { Button, Modal, useToast } from '@/shared/ui'
import { ETIQUETA_ACCION, etiquetaSubmodulo } from '../features/accesos/matriz'
import { useDependencies } from '../providers/DependencyProvider'

/**
 * Cuando el servidor niega algo que la persona pulsó, el 403 dice QUÉ permiso
 * faltaba. En vez de un "no autorizado" del que nadie puede hacer nada, se
 * ofrece pedirlo al administrador (que lo ve en Accesos → Solicitudes).
 *
 * Pedir no exige ningún permiso: exigir uno para pedir permisos dejaría fuera
 * justo a quien lo necesita.
 */
export function SolicitarPermisoDialog() {
  const { events, useCases } = useDependencies()
  const toast = useToast()
  const [negado, setNegado] = useState<PermisoNegado | null>(null)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(
    () =>
      events.permissionDenied.subscribe((permiso) => {
        setMotivo('')
        setNegado(permiso)
      }),
    [events],
  )

  async function pedir() {
    if (!negado) return
    setEnviando(true)
    const r = await useCases.solicitarPermiso.execute({
      submodulo: negado.submodulo,
      accion: negado.accion,
      motivo,
      referencia: '',
    })
    setEnviando(false)

    if (r.isLeft()) {
      toast.error(describeFailure(r.value))
      return
    }
    toast.exito('Pedido enviado. Te avisaremos cuando un administrador lo resuelva.')
    setNegado(null)
  }

  const accion = negado ? (ETIQUETA_ACCION[negado.accion as keyof typeof ETIQUETA_ACCION] ?? negado.accion) : ''

  return (
    <Modal
      open={negado !== null}
      size="sm"
      title="No tienes permiso para esto"
      onClose={() => setNegado(null)}
      footer={
        <>
          <Button variant="secondary" onClick={() => setNegado(null)}>
            Cerrar
          </Button>
          <Button loading={enviando} onClick={() => void pedir()}>
            Pedir acceso
          </Button>
        </>
      }
    >
      {negado && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Necesitas poder <strong className="text-ink">{accion.toLowerCase()}</strong> en{' '}
            <strong className="text-ink">{etiquetaSubmodulo(negado.submodulo)}</strong>. Puedes pedírselo a un
            administrador.
          </p>
          <label className="block">
            <span className="ui-label">
              ¿Para qué lo necesitas? <span className="font-normal text-ink-soft">(opcional)</span>
            </span>
            <textarea
              rows={3}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1.5 w-full rounded-field border border-line bg-surface p-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
            />
          </label>
        </div>
      )}
    </Modal>
  )
}
