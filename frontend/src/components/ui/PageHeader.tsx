import type { ReactNode } from 'react'
import { cn } from './cn'
import { useCabeceraGlobal } from './cabeceraGlobal'
import { usePestanasVista } from './contextoPestanas'

export interface PageHeaderProps {
  title: string
  description?: string
  /** Icono a la izquierda del titulo, con el color del sistema activo. */
  icon?: ReactNode
  /** Botones a la derecha del titulo. */
  actions?: ReactNode
  className?: string
}

/**
 * Cabecera de la vista: va suelta sobre el fondo gris, antes de las tarjetas.
 * No se pone dentro de la tabla ni de un bloque blanco.
 */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  // La cuenta y la campana van en esta misma fila: ya no hay barra superior.
  const { izquierda, derecha } = useCabeceraGlobal()
  const pestanas = usePestanasVista()

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/*
        Titulo y botones SIEMPRE en la misma fila, tambien en movil: apilados
        gastaban tres alturas antes del primer dato y empujaban la tabla fuera
        de la pantalla. La descripcion baja a su propia linea, que es texto de
        apoyo y puede esperar.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* flex-1 con un minimo: el titulo se lleva el ancho sobrante y nunca
            se recorta a dos letras para dejarle sitio a los botones. */}
        <div className="order-1 flex min-w-[7rem] flex-1 items-center gap-3">
          {izquierda}
          {icon && (
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-field bg-[rgb(var(--sys-rgb)/0.1)] text-[rgb(var(--sys-ink-rgb))]">
              {icon}
            </span>
          )}
          <h1 className="truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {title}
          </h1>
        </div>

        {/*
          Con tres o cuatro botones (Editar lista, Eliminar lista, Nueva
          lista, Agregar precio...) ni su propia linea entera alcanza en un
          telefono angosto. En vez de partirlos en filas impredecibles, se
          desliza como una fila propia —igual que las tarjetas de stats de
          ListPage—: se ve que hay mas a la derecha y no empuja el titulo.
          Desde sm vuelven a compartir la fila del titulo, envolviendo si
          hace falta.
        */}
        {/*
          La cuenta, a la derecha de todo. En el celular sube a la fila del
          título (order-2) y los botones de la vista bajan a la suya; desde sm
          los botones van antes y la cuenta cierra la fila, como en el diseño.
        */}
        {derecha && <div className="order-2 flex shrink-0 items-center gap-2 sm:order-3">{derecha}</div>}

        {actions && (
          <div
            className={cn(
              'order-3 sm:order-2',
              '-mx-4 flex w-full shrink-0 snap-x snap-mandatory items-center gap-2 overflow-x-auto px-4 pb-1',
              // Sin esto un boton de texto largo (Eliminar lista) se
              // encogia hasta partir el texto en vez de dejar que la fila
              // se deslice, que es justo lo que el scroll esta para evitar.
              '[&>*]:shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
              'sm:mr-0 sm:ml-auto sm:w-auto sm:flex-wrap sm:justify-end sm:overflow-visible sm:px-0 sm:pb-0',
            )}
          >
            {actions}
          </div>
        )}
      </div>

      {description && <p className="text-sm text-ink-muted">{description}</p>}

      {/* Las pestañas de la vista, bajo el título y la descripción (ver PestanasVista). */}
      {pestanas && <div className="mt-1">{pestanas}</div>}
    </div>
  )
}
