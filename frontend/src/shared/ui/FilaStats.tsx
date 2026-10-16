import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * La fila de indicadores de arriba de una pantalla.
 *
 * En movil van en UNA fila que se desliza: apilados uno sobre otro empujaban
 * la tabla fuera de la pantalla y obligaban a hacer scroll antes de ver el
 * primer dato. Desde sm vuelven a ser una grilla. Los margenes negativos hacen
 * que la fila sangre hasta el borde, para que se note que hay mas tarjetas a
 * la derecha.
 *
 * La usan ListPage y las pantallas que arman su propio encabezado (Mi Caja,
 * el estado de resultados): asi todas se ven igual en el telefono.
 */
export function FilaStats({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1',
        // auto-fit: la fila acomoda 3 o 4 tarjetas sin que la vista lo declare.
        'sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] sm:gap-4',
        'sm:overflow-visible sm:px-0 sm:pb-0',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {children}
    </section>
  )
}
