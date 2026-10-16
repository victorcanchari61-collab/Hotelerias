import { useEffect, useRef } from 'react'

/** Cierra un popover/panel al hacer clic fuera o con Escape. */
export function useDismiss<E extends HTMLElement = HTMLDivElement>(onDismiss: () => void) {
  const ref = useRef<E>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target)) return

      // Un `<Modal>` o un panel flotante (el listado de un `Desplegable`, el
      // calendario de `DateRangePicker`...) se portan fuera de `ref` — viven
      // en #modal-root o document.body — asi que un clic dentro de uno
      // abierto desde este mismo widget se veria como "de afuera" y lo
      // cerraria de inmediato al tocar cualquier campo.
      if (target instanceof Element && target.closest('[role="dialog"], [data-floating-panel]')) return

      onDismiss()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss()

    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onDismiss])

  return ref
}
