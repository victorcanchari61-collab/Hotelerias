import { useEffect, useRef, useState } from 'react'

/**
 * Visor de PDF para el celular.
 *
 * Ningun navegador movil dibuja un PDF dentro de un <iframe>: ni Chrome de
 * Android ni Safari de iOS. Queda el recuadro vacio con un boton "Abrir" que
 * pone el propio navegador, y ese boton intenta ir a la URL `blob:`, que el
 * movil bloquea — por eso el visor se veia en blanco en el telefono y en el
 * escritorio no.
 *
 * Aqui se dibuja cada pagina sobre un <canvas> con pdf.js, que es la misma
 * libreria que usa Firefox como visor. Se importa dinamicamente porque pesa y
 * solo hace falta cuando de verdad se abre un PDF en un telefono.
 */
export function VisorPdfMovil({ url, onError }: { url: string; onError: () => void }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [cargando, setCargando] = useState(true)

  // En un ref para que redefinir la funcion no vuelva a lanzar el dibujado.
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    let cancelado = false
    let tarea: { destroy: () => Promise<void> } | null = null

    const dibujar = async () => {
      setCargando(true)
      try {
        const pdfjs = await import('pdfjs-dist')

        /*
         * El worker se sirve como archivo fijo desde la raiz.
         *
         * Las formas "de bundler" andan en desarrollo y fallan compiladas:
         * `new URL('pdfjs-dist/...', import.meta.url)` apunta a un archivo que
         * no existe en el build, y ?url lo deja suelto como .mjs, que segun el
         * servidor llega con el tipo equivocado y la carga se queda colgada.
         * Un estatico en /pdf.worker.min.js se comporta igual en los dos
         * lados; lo copia scripts/copiar-worker-pdf.mjs al instalar.
         *
         * Con extension .js y no .mjs a proposito: pdf.js lo arranca como
         * worker de modulo, y para eso el navegador exige que el servidor lo
         * mande con un tipo de JavaScript. Nginx no conoce .mjs y lo servia
         * como application/octet-stream, asi que en produccion el worker no
         * cargaba y el visor caia a su respaldo.
         */
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

        const carga = pdfjs.getDocument({ url })
        tarea = carga
        const doc = await carga.promise
        if (cancelado) return

        const caja = contenedor.current
        if (!caja) return
        caja.innerHTML = ''

        const ancho = caja.clientWidth || 320
        // En pantallas retina hay que dibujar a mas resolucion o el texto sale
        // borroso. Se topa en 2x para no agotar la memoria del telefono.
        const densidad = Math.min(window.devicePixelRatio || 1, 2)

        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelado) return

          const pagina = await doc.getPage(n)
          const base = pagina.getViewport({ scale: 1 })
          const vista = pagina.getViewport({ scale: (ancho / base.width) * densidad })

          const lienzo = document.createElement('canvas')
          lienzo.width = vista.width
          lienzo.height = vista.height
          lienzo.className = 'mb-2 block h-auto w-full rounded bg-white'

          const ctx = lienzo.getContext('2d')
          if (!ctx) continue

          // El lienzo se cuelga del DOM ANTES de dibujar: pdf.js no termina de
          // pintar sobre un canvas suelto en memoria, y la promesa del render
          // se quedaba esperando para siempre.
          caja.appendChild(lienzo)
          await pagina.render({ canvas: lienzo, canvasContext: ctx, viewport: vista }).promise
          if (cancelado) return
        }
      } catch {
        if (!cancelado) onErrorRef.current()
      } finally {
        if (!cancelado) setCargando(false)
      }
    }

    void dibujar()

    return () => {
      cancelado = true
      void tarea?.destroy()
    }
  }, [url])

  return (
    <div className="h-full overflow-y-auto p-2">
      {cargando && (
        <p className="py-10 text-center text-sm text-ink-soft">Dibujando el documento...</p>
      )}
      <div ref={contenedor} />
    </div>
  )
}
