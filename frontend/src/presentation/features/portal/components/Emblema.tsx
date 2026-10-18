import type { ReactNode, SVGProps } from 'react'

/**
 * Los emblemas de cada hotel y las viñetas de cada tipo de habitación: dibujo de
 * trazo, a una sola tinta (la de la etiqueta que los lleva, por `currentColor`).
 * Son de muestra: cuando haya fotos reales entran al lado, sin cambiar estas piezas.
 *
 * Cada emblema nombra algo del destino, no un símbolo genérico de hotel:
 *  - ciudad (Lima): el sol que cae sobre el Pacífico y el acantilado de la costa verde.
 *  - andino (Cusco): el vano trapezoidal inca, con la piedra ensamblada.
 *  - colonial (Arequipa): el volcán Misti con su nieve y el arco del portal de sillar.
 *  - costa (Paracas): el candelabro, el geoglifo de la bahía.
 */

type Props = SVGProps<SVGSVGElement>

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function Lienzo({ children, caja = '0 0 120 120', ...rest }: Props & { children: ReactNode; caja?: string }) {
  return (
    <svg viewBox={caja} role="img" aria-hidden="true" focusable="false" {...base} {...rest}>
      {children}
    </svg>
  )
}

function Lima(props: Props) {
  return (
    <Lienzo {...props}>
      {/* El sol, medio hundido en el horizonte */}
      <path d="M34 62a26 26 0 0 1 52 0" />
      <path d="M60 22v8M33 33l6 6M87 33l-6 6M18 54h8M94 54h8" />
      {/* El horizonte y el mar: tres olas */}
      <path d="M12 62h96" />
      <path d="M14 76c8-8 14-8 22 0s14 8 22 0 14-8 22 0 14 8 22 0" />
      <path d="M14 90c8-8 14-8 22 0s14 8 22 0 14-8 22 0 14 8 22 0" />
      {/* El acantilado de la costa verde */}
      <path d="M12 62v-10l10-6 8 4v12" />
      <path d="M14 104c8-6 14-6 22 0s14 6 22 0 14-6 22 0 14 6 22 0" />
    </Lienzo>
  )
}

function Cusco(props: Props) {
  return (
    <Lienzo {...props}>
      {/* El sol de los Incas */}
      <circle cx="60" cy="22" r="9" />
      <path d="M60 6v5M44 22h-5M81 22h-5M49 11l3 3M71 11l-3 3" />
      {/* El vano trapezoidal: más ancho abajo que arriba */}
      <path d="M32 106 42 44h36l10 62z" />
      <path d="M48 106l6-40h12l6 40" />
      {/* Piedra ensamblada: juntas que no se alinean */}
      <path d="M26 80h12M82 80h14M30 60h8M84 62h10M20 100h14M86 100h16" />
      <path d="M12 106h96" />
    </Lienzo>
  )
}

function Arequipa(props: Props) {
  return (
    <Lienzo {...props}>
      {/* El Misti con su nieve en zigzag */}
      <path d="M10 76 52 20l14 0 44 56" />
      <path d="M40 38l8 8 6-9 8 9 6-8" />
      <path d="M52 20 60 12 66 20" />
      {/* El portal de sillar: arco sobre dos pilares */}
      <path d="M30 108V86a30 30 0 0 1 60 0v22" />
      <path d="M44 108V88a16 16 0 0 1 32 0v20" />
      <path d="M12 108h96" />
    </Lienzo>
  )
}

function Paracas(props: Props) {
  return (
    <Lienzo {...props}>
      {/* El candelabro: un tallo y tres brazos que se abren */}
      <path d="M60 106V28" />
      <path d="M60 52c-14 0-22-8-22-22" />
      <path d="M60 52c14 0 22-8 22-22" />
      <path d="M60 28V14" />
      <path d="M38 30v-8M82 30v-8" />
      <path d="M50 70h20M52 84h16" />
      {/* El mar de la bahía, abajo */}
      <path d="M14 98c8-6 14-6 22 0s14 6 22 0 14-6 22 0 14 6 26 0" />
      <path d="M14 110c8-6 14-6 22 0s14 6 22 0 14-6 22 0 14 6 26 0" />
    </Lienzo>
  )
}

const EMBLEMAS: Record<string, (p: Props) => ReactNode> = {
  ciudad: Lima,
  andino: Cusco,
  colonial: Arequipa,
  costa: Paracas,
}

/** El emblema del hotel (por la clave `imagen` que manda el servidor). */
export function Emblema({ clave, ...rest }: { clave: string } & Props) {
  const Dibujo = EMBLEMAS[clave] ?? Lima
  return <>{Dibujo(rest)}</>
}

/* ---- Viñetas de habitación: un cuarto visto de frente, a trazo ---- */

function Deluxe(props: Props) {
  return (
    <Lienzo caja="0 0 160 110" {...props}>
      {/* Ventana con cortinas */}
      <path d="M104 14h36v34h-36z" />
      <path d="M122 14v34M104 31h36" />
      <path d="M100 12v40M144 12v40" />
      {/* Cama king */}
      <path d="M14 96V52a6 6 0 0 1 6-6h66a6 6 0 0 1 6 6v44" />
      <path d="M14 78h78M14 96h78" />
      <path d="M24 60h24v14H24zM56 60h24v14H56z" />
      {/* Velador */}
      <path d="M100 96V78h22v18M105 78v-8h12v8" />
      <path d="M8 100h144" />
    </Lienzo>
  )
}

function Ejecutiva(props: Props) {
  return (
    <Lienzo caja="0 0 160 110" {...props}>
      <path d="M12 96V50a6 6 0 0 1 6-6h58a6 6 0 0 1 6 6v46" />
      <path d="M12 76h70M12 96h70" />
      <path d="M22 58h22v12H22zM50 58h22v12H50z" />
      {/* Sillón y lámpara de pie */}
      <path d="M100 96V74a8 8 0 0 1 8-8h22a8 8 0 0 1 8 8v22" />
      <path d="M100 84h38M104 96v6M134 96v6" />
      <path d="M150 20v76M142 20h16l-3 14h-10z" />
      <path d="M8 102h144" />
    </Lienzo>
  )
}

function Presidencial(props: Props) {
  return (
    <Lienzo caja="0 0 160 110" {...props}>
      {/* Lámpara de techo */}
      <path d="M80 4v14M62 36c0-10 8-18 18-18s18 8 18 18z" />
      <path d="M66 36v6M80 36v8M94 36v6" />
      {/* Dos camas gemelas */}
      <path d="M8 98V62a5 5 0 0 1 5-5h44a5 5 0 0 1 5 5v36M8 80h54" />
      <path d="M98 98V62a5 5 0 0 1 5-5h44a5 5 0 0 1 5 5v36M98 80h54" />
      <path d="M70 98V82h20v16" />
      {/* Cortinas */}
      <path d="M8 6v34M16 6v30M152 6v34M144 6v30" />
      <path d="M4 104h152" />
    </Lienzo>
  )
}

const VINETAS: Record<string, (p: Props) => ReactNode> = {
  deluxe: Deluxe,
  ejecutiva: Ejecutiva,
  presidencial: Presidencial,
}

/** La viñeta de un tipo de habitación (por la clave `imagen`). */
export function Vineta({ clave, ...rest }: { clave: string } & Props) {
  const Dibujo = VINETAS[clave] ?? Deluxe
  return <>{Dibujo(rest)}</>
}
