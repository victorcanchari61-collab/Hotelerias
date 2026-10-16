import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La regla de dependencias, comprobada por una prueba y no por disciplina.
 *
 *   core ◄── domain ◄── data
 *                ▲         ▲
 *                └─ presentation ──► di ──► data
 *
 * Las dependencias apuntan hacia adentro. `presentation` NO importa `data`
 * directamente: solo ve interfaces del dominio y recibe las implementaciones
 * por `di`. Si alguien rompe esto, esta prueba falla en CI en vez de que el
 * acoplamiento se descubra seis meses después.
 */

const SRC = resolve(__dirname)

/** Qué capas puede importar cada capa (además de sí misma). */
const PERMITIDO: Record<string, string[]> = {
  core: [],
  domain: ['core'],
  data: ['core', 'domain'],
  di: ['core', 'domain', 'data'],
  // shared es el kit de UI (copia del de Ecommerce): sin reglas de negocio, así
  // que no conoce domain/data/presentation/di. 'lib' son las fachadas heredadas
  // que algunos componentes propios (AccionPdf, VisorReportePdf) todavía usan.
  shared: ['core', 'lib'],
  presentation: ['core', 'domain', 'di', 'shared', 'lib'],
}

/** Paquetes que una capa interna NO puede conocer: el dominio no sabe qué es React. */
const PAQUETES_PROHIBIDOS: Record<string, RegExp> = {
  core: /^(react|react-dom|react-router-dom|lucide-react)(\/|$)/,
  domain: /^(react|react-dom|react-router-dom|lucide-react)(\/|$)/,
  data: /^(react|react-dom|react-router-dom|lucide-react)(\/|$)/,
}

/** Globales del navegador que el dominio no puede tocar: es lo que lo hace puro. */
const GLOBALES_DEL_NAVEGADOR = /\b(window|document|localStorage|sessionStorage|fetch|XMLHttpRequest)\b/

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivos(ruta)
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : []
  })
}

function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function importsDe(codigo: string): string[] {
  const out: string[] = []
  const re = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g
  for (const m of codigo.matchAll(re)) out.push(m[1])
  return out
}

/** A qué carpeta de primer nivel de src/ apunta un import, o null si es un paquete externo. */
function capaDestino(origen: string, especificador: string): string | null {
  let destino: string
  if (especificador.startsWith('@/')) {
    destino = join(SRC, especificador.slice(2))
  } else if (especificador.startsWith('.')) {
    destino = resolve(dirname(origen), especificador)
  } else {
    return null
  }
  return relative(SRC, destino).split(sep)[0]
}

describe('regla de dependencias entre capas', () => {
  for (const [capa, permitidas] of Object.entries(PERMITIDO)) {
    const dir = join(SRC, capa)
    const lista = archivos(dir)

    it(`${capa}: tiene archivos (la prueba no es vacía)`, () => {
      expect(lista.length).toBeGreaterThan(0)
    })

    it(`${capa}: solo importa de [${[capa, ...permitidas].join(', ')}]`, () => {
      const violaciones: string[] = []

      for (const archivo of lista) {
        const codigo = sinComentarios(readFileSync(archivo, 'utf-8'))
        for (const especificador of importsDe(codigo)) {
          const destino = capaDestino(archivo, especificador)
          if (destino !== null && destino !== capa && !permitidas.includes(destino)) {
            violaciones.push(`${relative(SRC, archivo)} → ${especificador} (${destino})`)
          }
        }
      }

      expect(violaciones, `\n${violaciones.join('\n')}`).toEqual([])
    })
  }

  for (const [capa, prohibido] of Object.entries(PAQUETES_PROHIBIDOS)) {
    it(`${capa}: no depende de React ni del router`, () => {
      const violaciones: string[] = []
      for (const archivo of archivos(join(SRC, capa))) {
        for (const especificador of importsDe(sinComentarios(readFileSync(archivo, 'utf-8')))) {
          if (prohibido.test(especificador)) {
            violaciones.push(`${relative(SRC, archivo)} → ${especificador}`)
          }
        }
      }
      expect(violaciones, `\n${violaciones.join('\n')}`).toEqual([])
    })
  }

  it('domain: no toca globales del navegador (es lo que lo hace puro)', () => {
    const violaciones: string[] = []
    for (const archivo of archivos(join(SRC, 'domain'))) {
      const codigo = sinComentarios(readFileSync(archivo, 'utf-8'))
      // Se ignoran los strings: "fetch" dentro de un mensaje no es una llamada.
      const sinStrings = codigo.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""')
      const m = GLOBALES_DEL_NAVEGADOR.exec(sinStrings)
      if (m) violaciones.push(`${relative(SRC, archivo)} usa ${m[1]}`)
    }
    expect(violaciones, `\n${violaciones.join('\n')}`).toEqual([])
  })

  it('presentation nunca importa data (solo recibe implementaciones por di)', () => {
    const directos: string[] = []
    for (const archivo of archivos(join(SRC, 'presentation'))) {
      for (const especificador of importsDe(sinComentarios(readFileSync(archivo, 'utf-8')))) {
        if (capaDestino(archivo, especificador) === 'data') {
          directos.push(`${relative(SRC, archivo)} → ${especificador}`)
        }
      }
    }
    expect(directos).toEqual([])
  })
})
