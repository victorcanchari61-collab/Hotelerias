/**
 * Lo que jsdom no trae y los componentes del kit sí usan.
 *
 * SysDataTable mide su contenedor con ResizeObserver para decidir cuántas
 * columnas caben; en jsdom no existe y la pantalla se caería al montarse. Aquí
 * se declara un observador que no observa nada: las pruebas no miden píxeles.
 */
class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverFalso as unknown as typeof ResizeObserver
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  window.matchMedia = (consulta: string) =>
    ({
      matches: false,
      media: consulta,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// El panel de los desplegables hace scrollIntoView sobre la opción elegida; jsdom no lo implementa.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
