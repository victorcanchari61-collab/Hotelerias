import { useEffect, useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import type { Alcance, Alcances, CatalogoAlcances, Rol } from '@/domain/entities/Configuracion'
import { clavePermiso } from '@/domain/entities/Permiso'
import type { SubmoduloCatalogo } from '@/domain/entities/Permiso'
import { Alert, Button, Card, Select, useToast } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'
import {
  ETIQUETA_ACCION,
  agruparCatalogo,
  alternarFila,
  alternarPermiso,
  columnasDe,
  etiquetaSubmodulo,
  mismosPermisos,
} from './matriz'

const ETIQUETA_ALCANCE: Record<Alcance, string> = {
  todas: 'Todas las sedes',
  mis_sedes: 'Solo sus sedes',
}

/**
 * La matriz de un rol: qué acciones puede hacer sobre cada pantalla, y sobre qué
 * sedes. Se dibuja con el catálogo del servidor (no con una lista propia): un
 * submódulo nuevo aparece aquí solo.
 */
export function MatrizRol({ roles, onCambioRoles }: { roles: Rol[]; onCambioRoles: () => void }) {
  const { useCases } = useDependencies()
  const { refrescar } = usePermisos()
  const toast = useToast()

  const catalogo = useCarga<SubmoduloCatalogo[]>(() => useCases.getCatalogoPermisos.execute(), [useCases], [])
  const catAlcances = useCarga<CatalogoAlcances>(
    () => useCases.catalogoAlcances.execute(),
    [useCases],
    { submodulos: [], niveles: [] },
  )

  const [rolId, setRolId] = useState<number | null>(null)
  const rol = roles.find((r) => r.id === rolId) ?? null

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [alcances, setAlcances] = useState<Alcances>({})
  const [alcancesOriginales, setAlcancesOriginales] = useState<Alcances>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al elegir un rol (o cuando la lista se refresca) se cargan su matriz y su alcance.
  useEffect(() => {
    setSeleccion(new Set(rol?.permisos ?? []))
    setError(null)
    if (rolId === null || rol?.accesoTotal) {
      setAlcances({})
      setAlcancesOriginales({})
      return
    }
    let vigente = true
    void useCases.alcancesDeRol.execute(rolId).then((r) =>
      r.fold(
        (f) => vigente && setError(describeFailure(f)),
        (a) => {
          if (!vigente) return
          setAlcances(a)
          setAlcancesOriginales(a)
        },
      ),
    )
    return () => {
      vigente = false
    }
  }, [rolId, rol?.permisos, rol?.accesoTotal, useCases])

  const grupos = useMemo(() => agruparCatalogo(catalogo.datos), [catalogo.datos])
  const columnas = useMemo(() => columnasDe(catalogo.datos), [catalogo.datos])

  const sinCambios = rol ? mismosPermisos(seleccion, new Set(rol.permisos)) : true
  const alcanceSinCambios = JSON.stringify(alcances) === JSON.stringify(alcancesOriginales)

  async function guardar() {
    if (!rol) return
    setGuardando(true)
    setError(null)

    if (!sinCambios) {
      const r = await useCases.guardarPermisosRol.execute({ id: rol.id, permisos: [...seleccion] })
      if (r.isLeft()) {
        setError(describeFailure(r.value))
        setGuardando(false)
        return
      }
    }
    if (!alcanceSinCambios) {
      const r = await useCases.guardarAlcancesRol.execute({ rolId: rol.id, alcances })
      if (r.isLeft()) {
        setError(describeFailure(r.value))
        setGuardando(false)
        return
      }
      setAlcancesOriginales(alcances)
    }

    setGuardando(false)
    toast.exito(`Accesos del rol «${rol.nombre}» guardados.`)
    onCambioRoles()
    // Si el admin tiene ese rol, su propio menú cambia.
    void refrescar()
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <Select
            label="Rol"
            value={rolId === null ? '' : String(rolId)}
            onChange={(e) => setRolId(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">Elige un rol…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
                {r.usuarios > 0 ? ` · ${r.usuarios} persona(s)` : ''}
              </option>
            ))}
          </Select>
        </div>
        {rol && !rol.accesoTotal && (
          <Button loading={guardando} disabled={sinCambios && alcanceSinCambios} onClick={() => void guardar()}>
            Guardar accesos
          </Button>
        )}
      </Card>

      {error && <Alert>{error}</Alert>}
      {catalogo.error && <Alert>{catalogo.error}</Alert>}

      {rol?.accesoTotal && (
        <Alert tone="info">
          <span className="inline-flex items-center gap-2">
            <Lock size={14} /> Este rol tiene acceso total: puede todo y su matriz no se configura.
          </span>
        </Alert>
      )}

      {rol && !rol.accesoTotal && (
        <>
          <Card className="overflow-hidden p-0 sm:p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-surface-alt text-xs uppercase text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Pantalla</th>
                    {columnas.map((a) => (
                      <th key={a} className="px-2 py-3 text-center font-semibold">
                        {ETIQUETA_ACCION[a]}
                      </th>
                    ))}
                    <th className="px-2 py-3 text-center font-semibold">Todo</th>
                  </tr>
                </thead>
                {grupos.map((g) => (
                  <tbody key={g.modulo} className="divide-y divide-line border-b border-line">
                    <tr className="bg-surface-alt/60">
                      <th colSpan={columnas.length + 2} className="px-4 py-2 text-left text-xs font-bold tracking-wide text-ink-muted uppercase">
                        {g.etiqueta}
                      </th>
                    </tr>
                    {g.filas.map((fila) => {
                      const completa = fila.acciones.every((a) => seleccion.has(clavePermiso(fila.submodulo, a)))
                      return (
                        <tr key={fila.submodulo}>
                          <td className="px-4 py-2 text-ink">{etiquetaSubmodulo(fila.submodulo)}</td>
                          {columnas.map((a) => (
                            <td key={a} className="px-2 py-2 text-center">
                              {fila.acciones.includes(a) ? (
                                <input
                                  type="checkbox"
                                  className="size-4 cursor-pointer accent-[var(--accent)]"
                                  aria-label={`${etiquetaSubmodulo(fila.submodulo)}: ${ETIQUETA_ACCION[a]}`}
                                  checked={seleccion.has(clavePermiso(fila.submodulo, a))}
                                  onChange={(e) => setSeleccion((s) => alternarPermiso(s, fila, a, e.target.checked))}
                                />
                              ) : (
                                <span className="text-ink-soft">·</span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              className="size-4 cursor-pointer accent-[var(--accent)]"
                              aria-label={`${etiquetaSubmodulo(fila.submodulo)}: todo`}
                              checked={completa}
                              onChange={(e) => setSeleccion((s) => alternarFila(s, fila, e.target.checked))}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          </Card>

          {catAlcances.datos.submodulos.length > 0 && (
            <Card className="space-y-3">
              <div>
                <h3 className="font-bold text-ink">Qué sedes ve</h3>
                <p className="text-sm text-ink-muted">
                  Limita sobre qué datos actúan sus permisos. «Solo sus sedes» usa las sedes asignadas a
                  cada persona (se asignan en Usuarios).
                </p>
              </div>
              {catAlcances.datos.submodulos.map((sub) => (
                <div key={sub} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
                  <span className="text-sm text-ink">{etiquetaSubmodulo(sub)}</span>
                  <Select
                    size="sm"
                    aria-label={`Alcance de ${etiquetaSubmodulo(sub)}`}
                    value={alcances[sub] ?? 'todas'}
                    onChange={(e) => {
                      const nivel = e.target.value as Alcance
                      setAlcances((a) => {
                        const next = { ...a }
                        if (nivel === 'todas') delete next[sub]
                        else next[sub] = nivel
                        return next
                      })
                    }}
                  >
                    {catAlcances.datos.niveles.map((n) => (
                      <option key={n} value={n}>{ETIQUETA_ALCANCE[n]}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
