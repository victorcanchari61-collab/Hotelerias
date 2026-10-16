import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { cn } from './cn'
import { Modal } from './Modal'

export type ConfirmTono = 'danger' | 'warning' | 'pregunta'

const TONOS: Record<ConfirmTono, { icono: ReactNode; caja: string }> = {
  danger: {
    icono: <Trash2 size={20} />,
    caja: 'bg-red-50 text-red-600',
  },
  warning: {
    icono: <AlertTriangle size={20} />,
    caja: 'bg-amber-50 text-amber-600',
  },
  pregunta: {
    icono: <HelpCircle size={20} />,
    caja: 'bg-slate-100 text-slate-600',
  },
}

export interface ConfirmOpciones {
  titulo: string
  /** Que va a pasar, en una linea. */
  mensaje: ReactNode
  /** Texto del boton que confirma. Por defecto "Aceptar". */
  confirmar?: string
  cancelar?: string
  tono?: ConfirmTono
}

export interface ConfirmDialogProps extends ConfirmOpciones {
  open: boolean
  cargando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/**
 * Dialogo de confirmacion. No se usa directo: normalmente se pide con el hook
 * useConfirmacion, que se encarga del estado.
 */
export function ConfirmDialog({
  open,
  titulo,
  mensaje,
  confirmar = 'Aceptar',
  cancelar = 'Cancelar',
  tono = 'pregunta',
  cargando = false,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  const { icono, caja } = TONOS[tono]

  return (
    <Modal
      open={open}
      title={titulo}
      size="sm"
      onClose={onCancelar}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancelar}>
            {cancelar}
          </Button>
          <Button
            size="sm"
            loading={cargando}
            onClick={onConfirmar}
            className={cn(
              tono === 'danger' && 'bg-red-600 hover:not-disabled:bg-red-700',
              tono === 'warning' && 'bg-amber-600 hover:not-disabled:bg-amber-700',
            )}
          >
            {confirmar}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-field', caja)}
        >
          {icono}
        </span>
        <p className="pt-2 text-sm text-ink-muted">{mensaje}</p>
      </div>
    </Modal>
  )
}

interface EstadoConfirmacion extends ConfirmOpciones {
  accion: () => Promise<void> | void
}

/**
 * Pide confirmacion antes de una accion.
 *
 *   const { confirmar, dialogo } = useConfirmacion()
 *   ...
 *   confirmar({ titulo: 'Eliminar', mensaje: '...', tono: 'danger', accion: () => borrar(x) })
 *   ...
 *   return <>{dialogo}</>
 *
 * El hook se encarga del estado y del "cargando" mientras la accion corre, asi
 * ninguna pantalla tiene que declarar tres useState para lo mismo.
 */
export function useConfirmacion() {
  const [estado, setEstado] = useState<EstadoConfirmacion | null>(null)
  const [cargando, setCargando] = useState(false)

  const confirmar = useCallback((opciones: EstadoConfirmacion) => setEstado(opciones), [])

  const aceptar = useCallback(async () => {
    if (!estado) return
    setCargando(true)
    try {
      await estado.accion()
      setEstado(null)
    } finally {
      setCargando(false)
    }
  }, [estado])

  const dialogo = (
    <ConfirmDialog
      open={estado !== null}
      titulo={estado?.titulo ?? ''}
      mensaje={estado?.mensaje ?? ''}
      confirmar={estado?.confirmar}
      cancelar={estado?.cancelar}
      tono={estado?.tono}
      cargando={cargando}
      onConfirmar={() => void aceptar()}
      onCancelar={() => setEstado(null)}
    />
  )

  return { confirmar, dialogo }
}
