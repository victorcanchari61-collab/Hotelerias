/**
 * Estilos del menu lateral. Todo sale de UN solo color (--nav-ink, definido en
 * styles/themes.css): iconos y letras. No hay degradados ni color por modulo.
 */

/** Color de los iconos y las letras del menu. */
export const NAV_INK = 'text-(--nav-ink)'

/**
 * Fila activa: fondo suave del tema y una barra vertical de 4px pegada al
 * borde izquierdo. El texto no cambia de color: se distingue por fondo y barra.
 */
export const ACTIVE_ROW = [
  'relative bg-(--accent-soft) text-(--nav-ink)',
  'before:absolute before:top-1/2 before:-left-2 before:h-6 before:w-1 before:-translate-y-1/2',
  "before:rounded-r-full before:bg-(--accent) before:content-['']",
].join(' ')

/** Fila inactiva: el mismo color, con fondo suave al pasar el mouse. */
export const INACTIVE_ROW = `${NAV_INK} hover:bg-(--accent-soft)`
