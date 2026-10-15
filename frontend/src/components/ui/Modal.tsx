import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from './cn'

export interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  /** Botones del pie. */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  /** Clases extra en el fondo fijo, ej. "sm:hidden" para una variante que solo se ve en movil. */
  className?: string
  children: ReactNode
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl', '3xl': 'max-w-[90rem]' }

export function Modal({
  open,
  title,
  description,
  onClose,
  footer,
  size = 'md',
  className,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  /*
    Se monta en #modal-root y no donde se declara.

    Como hijo de la vista heredaba lo que el contenedor dijera de sus hijos: en
    ListPage, que separa sus bloques con space-y-5, el fondo oscuro recibia un
    margen superior y quedaba 20px mas corto que la pantalla, dejando una franja
    blanca abajo. Fuera del flujo, inset-0 siempre es la ventana completa, y de
    paso ningun overflow ni z-index de la vista puede recortarlo.

    #modal-root vive DENTRO del data-sys del modulo abierto (lo pone
    DashboardLayout): portar a document.body directo sacaria al modal de esa
    rama y el encabezado saldria siempre azul, sin importar el modulo. Cuando
    no existe (pantalla de login, sin DashboardLayout) cae a document.body.
  */
  const destino = document.getElementById('modal-root') ?? document.body

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4',
        className,
      )}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-panel bg-white shadow-panel sm:rounded-panel',
          SIZES[size],
        )}
      >
        <div className="flex items-center justify-between gap-3 bg-[rgb(var(--sys-rgb))] px-4 py-2.5">
          <div className="min-w-0 leading-tight">
            <h2 className="truncate text-sm font-bold text-white">{title}</h2>
            {description && <p className="truncate text-[11px] text-white/80">{description}</p>}
          </div>

          {/*
            La X solo aparece cuando NO hay pie: si el pie ya trae "Cancelar",
            dos formas de cerrar lo mismo en la misma ventana sobran. Escape y
            el clic fuera siguen cerrando en ambos casos.
          */}
          {!footer && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="cursor-pointer rounded-lg p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    destino,
  )
}
