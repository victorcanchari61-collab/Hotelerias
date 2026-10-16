import { useEffect, useState } from 'react'
import { idUnico } from '../../lib/ids'
import { presentacionInicial } from '../../lib/presentaciones'
import type { UsoPresentacion } from '../../lib/presentaciones'
import { Plus } from 'lucide-react'
import { BuscadorCampo } from './BuscadorCampo'
import type { OpcionBuscador } from './BuscadorCampo'
import { BuscadorProductoModal } from './BuscadorProductoModal'
import type { ProductoBuscable } from './BuscadorProductoModal'
import { Button } from './Button'
import { SelectorPresentacion } from './SelectorPresentacion'
import { Input } from './Input'

export type { ProductoBuscable }

/** Una línea lista para agregar a la tabla de productos. */
export interface LineaProductoNueva {
  /** Identifica la fila en la tabla de abajo — SysDataTable la necesita para no confundir filas. */
  id: string
  /** Solo al editar un documento existente: el id real de la línea en el servidor. */
  lineaId?: number
  productoId: number
  /** 0 = unidad base. */
  presentacionId: number
  cantidad: string
  costo: string
  lote: string
  fechaVencimiento: string
}

/** Un precio ya resuelto, con de dónde salió: de la lista o de la referencia del producto. */
export interface PrecioResuelto {
  precio: number
  origen: 'LISTA' | 'REFERENCIA'
}

export interface AgregarProductoPanelProps {
  productos: ProductoBuscable[]
  /** Stock actual por producto, en unidad base — para mostrarlo mientras se arma la línea. */
  stock?: Record<number, number>
  /**
   * Lo que ya apartan otros pedidos pendientes, por producto y en unidad base. Es solo informativo:
   * al vendedor le sirve saber que de los 10 sacos que hay, 5 están comprometidos, pero no se le
   * impide pedir más — decide él.
   */
  reservado?: Record<number, number>
  /** Si el motivo/documento pide declarar costo (una entrada) o no (una salida/transferencia). */
  pideCosto?: boolean
  costoLabel?: string
  /** Solo para entradas con seguimiento de vencimiento (ajustes, recepciones). */
  pideLote?: boolean
  /**
   * De dónde sale el precio, cuando lo pone una lista y no el que carga.
   *
   * Recibe la presentación real (nunca 0: la unidad base tiene su propia
   * presentación) y la cantidad, porque el precio depende de cuánto se lleva
   * —el tramo "desde 5 sacos" es más barato—. Devuelve el precio de UNA
   * presentación, o null si esa forma de vender no tiene precio cargado.
   */
  resolverPrecio?: (presentacionId: number, cantidad: number) => Promise<PrecioResuelto | null>
  /** Cambia con la lista de precios elegida: el precio se vuelve a pedir. */
  claveLista?: string | number
  /**
   * Para qué se arma la línea. En una venta solo se ofrecen las presentaciones marcadas "Se vende"
   * (la unidad base incluida); en una compra, las "Se compra". Sin uso (ajustes, transferencias)
   * valen todas.
   */
  uso?: UsoPresentacion
  onAgregar: (linea: LineaProductoNueva) => void
}

const VACIO = { productoId: 0, presentacionId: 0, cantidad: '', costo: '', lote: '', fechaVencimiento: '' }

/**
 * Buscar un producto, armar la línea (unidad, cantidad, costo) y agregarla a
 * la tabla de abajo — en vez de agregar una fila vacía y llenarla adentro de
 * la tabla.
 *
 * El mismo panel sirve para Ajustes, Transferencias, Préstamos y Compras:
 * `pideCosto` oculta el costo cuando el motivo no lo declara (una
 * transferencia hereda el costo, no lo inventa), y `pideLote` solo aparece
 * donde tiene sentido guardar vencimiento.
 *
 * El campo de búsqueda trae también su búsqueda avanzada: un
 * [BuscadorProductoModal] con tarjetas filtrables por categoría y marca,
 * para cuando escribir dos letras no alcanza.
 */
export function AgregarProductoPanel({
  productos,
  stock,
  reservado,
  pideCosto = true,
  costoLabel = 'Precio',
  pideLote = false,
  resolverPrecio,
  claveLista,
  uso,
  onAgregar,
}: AgregarProductoPanelProps) {
  const [linea, setLinea] = useState(VACIO)
  const [buscadorAbierto, setBuscadorAbierto] = useState(false)
  /** Qué dijo la lista: para avisar cuando no hay precio o cuando se cambió. */
  const [precioLista, setPrecioLista] = useState<PrecioResuelto | null>(null)
  const [buscandoPrecio, setBuscandoPrecio] = useState(false)

  const producto = productos.find((p) => p.id === linea.productoId)
  const presentaciones = producto?.presentaciones.filter((p) => p.activo) ?? []
  const presentacionElegida = presentaciones.find((p) => p.id === linea.presentacionId)
  const factor = presentacionElegida?.factor ?? 1
  // `stock` es lo disponible (ya sin lo apartado); lo que hay en el almacén es eso más lo reservado.
  const disponibleActual = producto ? (stock?.[producto.id] ?? 0) : null
  const reservadoActual = producto ? (reservado?.[producto.id] ?? 0) : 0
  const stockActual = disponibleActual != null ? disponibleActual + reservadoActual : null
  const unidadElegida = presentacionElegida?.nombre ?? producto?.unidadBase ?? ''

  // Un producto que no se vende (o no se compra) en ninguna presentación no se puede ofrecer:
  // no habría con qué unidad armar la línea.
  const usables = uso ? productos.filter((p) => presentacionInicial(p, uso) !== null) : productos

  const opcionesProducto: OpcionBuscador<number>[] = usables.map((p) => ({
    item: p.id,
    label: p.nombre,
    detalle: p.codigo,
  }))

  // Arranca con la unidad base si esa se puede usar; si no, con la primera presentación que sí.
  const elegir = (id: number) => {
    const elegido = productos.find((p) => p.id === id)
    setLinea({ ...VACIO, cantidad: '1', productoId: id, presentacionId: elegido ? (presentacionInicial(elegido, uso) ?? 0) : 0 })
  }

  /*
   * El precio se pide a la lista, no se teclea.
   *
   * Se vuelve a pedir cuando cambia la cantidad y no solo al elegir el
   * producto: el tramo por volumen depende de cuanto se lleva, asi que
   * resolver una sola vez dejaria el descuento de 5 sacos sin aplicarse
   * nunca. Queda editable: un precio especial a un cliente sigue siendo
   * cosa de todos los dias.
   */
  const presentacionReal =
    linea.presentacionId || presentaciones.find((x) => x.esBase)?.id || 0

  useEffect(() => {
    if (!resolverPrecio || !producto || !presentacionReal) return

    const cantidad = Number(linea.cantidad) || 1
    let vigente = true
    setBuscandoPrecio(true)

    void resolverPrecio(presentacionReal, cantidad)
      .then((precio) => {
        if (!vigente) return
        setPrecioLista(precio)
        // Solo escribe el precio: si el que carga ya lo piso a mano, se
        // respeta lo que puso.
        setLinea((l) => (precio == null ? l : { ...l, costo: String(precio.precio) }))
      })
      .finally(() => vigente && setBuscandoPrecio(false))

    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto?.id, presentacionReal, linea.cantidad, claveLista])

  /*
   * Sin lista de precios que resolver —las compras no tienen una—, el costo se autocompleta con el
   * costo de referencia del producto, por el factor de la presentación elegida.
   *
   * Antes solo se mostraba como PLACEHOLDER: un texto gris de fondo que no es el valor del campo, así
   * que el costo parecía vacío y había que teclearlo a mano cada vez, aunque el dato ya existiera.
   *
   * Se vuelve a calcular al elegir el producto o al cambiar de unidad, no en cada tecla de cantidad
   * ni de costo: así lo que la persona corrija a mano no se pisa solo mientras sigue escribiendo.
   */
  useEffect(() => {
    if (resolverPrecio || !producto || producto.costoReferencia == null || !presentacionReal) return
    setLinea((l) => ({ ...l, costo: String(Math.round(producto.costoReferencia! * factor * 100) / 100) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto?.id, presentacionReal, Boolean(resolverPrecio)])

  const agregar = () => {
    if (!producto || !linea.cantidad) return

    onAgregar({
      id: idUnico(),
      productoId: producto.id,
      presentacionId: linea.presentacionId,
      cantidad: linea.cantidad,
      costo: linea.costo,
      lote: linea.lote,
      fechaVencimiento: linea.fechaVencimiento,
    })

    // Vuelve a cero: el siguiente producto se busca de nuevo, no se
    // arrastra nada de la línea anterior.
    setLinea(VACIO)
    setPrecioLista(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <BuscadorCampo
        label="Buscar producto"
        value={linea.productoId || null}
        onChange={(id) => elegir(id ?? 0)}
        opciones={opcionesProducto}
        placeholder="Nombre o código..."
        vacio="Ningún producto coincide"
        onAvanzado={() => setBuscadorAbierto(true)}
        avanzadoLabel="Búsqueda avanzada de productos"
        destacado
      />

      {/* Siempre visible, aunque no haya producto elegido todavía: así el
          panel no "salta" de tamaño al buscar, y se ve de entrada qué datos
          va a pedir (costo incluido) en vez de sorprender después. */}
      <Input label="Descripción" disabled value={producto ? producto.descripcion || producto.nombre : ''} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/*
          El stock, en la unidad que se eligio abajo.
          Decia "1250 KG" con la linea armada en sacos: para saber si alcanzan
          los 3 sacos que se estan vendiendo habia que dividir a mano.
        */}
        <Input
          label="Stock"
          disabled
          value={
            producto && stockActual != null
              ? `${Number((stockActual / factor).toFixed(4))} ${unidadElegida}`
              : ''
          }
          hint={
            producto && reservadoActual > 0 ? (
              <span className="text-xs font-medium text-amber-600">
                {Number((reservadoActual / factor).toFixed(2))} reservados · {Number((disponibleActual! / factor).toFixed(2))} libres
              </span>
            ) : undefined
          }
        />

        <SelectorPresentacion
          label="Unidad"
          value={linea.presentacionId}
          onChange={(v) => setLinea({ ...linea, presentacionId: v })}
          disabled={!producto}
          producto={producto}
          uso={uso}
          resolverPrecio={resolverPrecio}
          claveLista={claveLista}
        />

        <Input
          label="Cantidad"
          type="number"
          step="0.0001"
          disabled={!producto}
          value={linea.cantidad}
          onChange={(e) => setLinea({ ...linea, cantidad: e.target.value })}
        />

        {pideCosto && (
          <Input
            label={costoLabel}
            type="number"
            step="0.01"
            disabled={!producto}
            placeholder={
              producto?.costoReferencia
                ? String(Math.round(producto.costoReferencia * factor * 100) / 100)
                : '0.00'
            }
            value={linea.costo}
            onChange={(e) => setLinea({ ...linea, costo: e.target.value })}
            hint={
              resolverPrecio && producto ? (
                buscandoPrecio ? (
                  <span className="text-xs text-ink-soft">Buscando en la lista...</span>
                ) : precioLista == null ? (
                  // Sin precio cargado la venta saldria en cero sin que nadie
                  // chille: mejor decirlo aqui, antes de agregar la linea.
                  <span className="text-xs font-medium text-amber-600">Sin precio en la lista</span>
                ) : Number(linea.costo) !== precioLista.precio ? (
                  <span className="text-xs font-medium text-amber-600">
                    {precioLista.origen === 'LISTA' ? 'Lista' : 'Referencia'}: S/{' '}
                    {precioLista.precio.toFixed(2)}
                  </span>
                ) : precioLista.origen === 'LISTA' ? (
                  <span className="text-xs text-ink-soft">De la lista</span>
                ) : (
                  /* La lista no tenia esa presentacion y salio el precio del producto: decirlo
                     evita cobrar una referencia vieja creyendo que es el precio de la lista. */
                  <span className="text-xs font-medium text-amber-600">
                    Precio de referencia del producto
                  </span>
                )
              ) : undefined
            }
          />
        )}
      </div>

      {pideLote && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Lote"
            optional
            disabled={!producto}
            placeholder="Opcional"
            value={linea.lote}
            onChange={(e) => setLinea({ ...linea, lote: e.target.value })}
          />
          <Input
            label="Vencimiento"
            optional
            type="date"
            disabled={!producto}
            value={linea.fechaVencimiento}
            onChange={(e) => setLinea({ ...linea, fechaVencimiento: e.target.value })}
          />
        </div>
      )}

      <Button size="sm" onClick={agregar} disabled={!producto || !linea.cantidad} className="self-start">
        <Plus size={15} />
        Agregar producto
      </Button>

      <BuscadorProductoModal
        open={buscadorAbierto}
        onClose={() => setBuscadorAbierto(false)}
        productos={usables}
        stock={stock}
        reservado={reservado}
        uso={uso}
        onAgregar={(selecciones) => {
          /*
           * El precio se pide a la lista igual que al agregar de a uno: sin esto, todo lo que
           * entraba por esta búsqueda quedaba en cero y había que teclear cada precio a mano.
           * Se piden juntos y las líneas se agregan en el orden en que se marcaron.
           */
          void Promise.all(
            selecciones.map(async ({ producto, presentacionId, cantidad }) => {
              const real = presentacionId || producto.presentaciones.find((x) => x.esBase)?.id || 0
              const precio = resolverPrecio && real ? await resolverPrecio(real, cantidad).catch(() => null) : null

              return {
                id: idUnico(),
                productoId: producto.id,
                presentacionId,
                cantidad: String(cantidad),
                costo: precio == null ? '' : String(precio.precio),
                lote: '',
                fechaVencimiento: '',
              }
            }),
          ).then((lineas) => lineas.forEach(onAgregar))
        }}
      />
    </div>
  )
}
