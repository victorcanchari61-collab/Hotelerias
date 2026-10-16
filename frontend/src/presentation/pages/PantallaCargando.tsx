/** Lo que se ve mientras se restaura la sesión o se carga una pantalla. */
export function PantallaCargando() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] items-center justify-center text-ink-muted"
    >
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-2 border-current border-r-transparent"
      />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
