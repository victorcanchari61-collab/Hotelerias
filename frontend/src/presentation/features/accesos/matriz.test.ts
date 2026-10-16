import { describe, expect, it } from 'vitest'
import type { SubmoduloCatalogo } from '@/domain/entities/Permiso'
import {
  agruparCatalogo,
  alternarFila,
  alternarPermiso,
  columnasDe,
  etiquetaSubmodulo,
  mismosPermisos,
} from './matriz'

const reservas: SubmoduloCatalogo = {
  submodulo: 'reservas.reservas',
  modulo: 'reservas',
  acciones: ['ver', 'crear', 'editar', 'anular'],
}
const auditoria: SubmoduloCatalogo = {
  submodulo: 'config.auditoria',
  modulo: 'config',
  acciones: ['ver', 'exportar', 'eliminar'],
}

describe('alternarPermiso', () => {
  it('marcar una acción marca también "ver"', () => {
    const r = alternarPermiso(new Set(), reservas, 'anular', true)
    expect([...r].sort()).toEqual(['reservas.reservas:anular', 'reservas.reservas:ver'])
  })

  it('quitar "ver" quita todo lo demás del submódulo (y nada de otros)', () => {
    const base = new Set([
      'reservas.reservas:ver',
      'reservas.reservas:crear',
      'reservas.reservas:anular',
      'config.auditoria:ver',
    ])
    const r = alternarPermiso(base, reservas, 'ver', false)
    expect([...r]).toEqual(['config.auditoria:ver'])
  })

  it('quitar otra acción deja "ver"', () => {
    const base = new Set(['reservas.reservas:ver', 'reservas.reservas:crear'])
    const r = alternarPermiso(base, reservas, 'crear', false)
    expect([...r]).toEqual(['reservas.reservas:ver'])
  })

  it('no muta el conjunto que recibe', () => {
    const base = new Set<string>()
    alternarPermiso(base, reservas, 'crear', true)
    expect(base.size).toBe(0)
  })
})

describe('alternarFila', () => {
  it('marca todas y las quita todas', () => {
    const todas = alternarFila(new Set(), reservas, true)
    expect(todas.size).toBe(4)
    expect(alternarFila(todas, reservas, false).size).toBe(0)
  })
})

describe('catálogo', () => {
  it('agrupa por módulo en el orden del menú', () => {
    const grupos = agruparCatalogo([auditoria, reservas])
    expect(grupos.map((g) => g.modulo)).toEqual(['reservas', 'config'])
    expect(grupos[0].etiqueta).toBe('Reservas')
  })

  it('las columnas salen en el orden de la matriz y solo las que existen', () => {
    expect(columnasDe([auditoria, reservas])).toEqual(['ver', 'crear', 'editar', 'anular', 'eliminar', 'exportar'])
  })

  it('un submódulo sin menú se nombra por su clave', () => {
    expect(etiquetaSubmodulo('no.existe')).toBe('no.existe')
    expect(etiquetaSubmodulo('config.usuarios')).toBe('Usuarios')
  })
})

describe('mismosPermisos', () => {
  it('compara contenido, no orden', () => {
    expect(mismosPermisos(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(mismosPermisos(new Set(['a']), new Set(['a', 'b']))).toBe(false)
    expect(mismosPermisos(new Set(['a', 'c']), new Set(['a', 'b']))).toBe(false)
  })
})
