import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { parsearTextoRico } from '@/domain/textoRico'
import type { Bloque, Trozo } from '@/domain/textoRico'
import { cn } from '@/shared/ui'

/**
 * Dibuja un texto con el formato simple del blog (ver domain/textoRico.ts).
 * Todo sale de elementos de React: no hay `dangerouslySetInnerHTML` en ningún lado.
 */
function Linea({ trozos }: { trozos: Trozo[] }) {
  return (
    <>
      {trozos.map((t, i) => {
        switch (t.tipo) {
          case 'negrita':
            return <strong key={i}>{t.texto}</strong>
          case 'cursiva':
            return <em key={i}>{t.texto}</em>
          case 'enlace':
            // Una ruta propia navega sin recargar; una dirección externa se abre aparte y sin dar pistas al destino.
            return t.url.startsWith('/') ? (
              <Link key={i} to={t.url} className="underline underline-offset-4">
                {t.texto}
              </Link>
            ) : (
              <a key={i} href={t.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">
                {t.texto}
              </a>
            )
          default:
            return <Fragment key={i}>{t.texto}</Fragment>
        }
      })}
    </>
  )
}

function Bloque({ bloque }: { bloque: Bloque }) {
  switch (bloque.tipo) {
    case 'titulo':
      return bloque.nivel === 2 ? (
        <h2 className="v-etq mt-10 text-3xl">
          <Linea trozos={bloque.trozos} />
        </h2>
      ) : (
        <h3 className="v-etq mt-8 text-2xl">
          <Linea trozos={bloque.trozos} />
        </h3>
      )
    case 'lista':
      return (
        <ul className="my-4 list-disc space-y-1.5 pl-6">
          {bloque.elementos.map((e, i) => (
            <li key={i}>
              <Linea trozos={e} />
            </li>
          ))}
        </ul>
      )
    default:
      return (
        <p className="my-4">
          {bloque.lineas.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              <Linea trozos={l} />
            </Fragment>
          ))}
        </p>
      )
  }
}

export function TextoRico({ texto, className }: { texto: string; className?: string }) {
  const bloques = parsearTextoRico(texto)
  if (bloques.length === 0) return null
  return (
    <div className={cn('max-w-[68ch] leading-relaxed', className)}>
      {bloques.map((b, i) => (
        <Bloque key={i} bloque={b} />
      ))}
    </div>
  )
}
