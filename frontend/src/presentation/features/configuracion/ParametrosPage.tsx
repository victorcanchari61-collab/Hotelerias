import { useMemo, useState } from 'react'
import { RotateCcw, Sliders } from 'lucide-react'
import { describeFailure } from '@/core/errors/failures'
import { ACCION } from '@/domain/entities/Permiso'
import type { Parametro } from '@/domain/entities/Parametro'
import { errorDeParametro } from '@/domain/usecases/parametro.usecases'
import { Alert, Button, Input, PageHeader, PageSection, useToast } from '@/shared/ui'
import { useCarga } from '../../hooks/useCarga'
import { useDependencies } from '../../providers/DependencyProvider'
import { usePermisos } from '../../providers/PermisosProvider'

const SUBMODULO = 'config.parametros'

/** Agrupa conservando el orden en que el servidor los lista. */
function porGrupo(lista: readonly Parametro[]): Array<[string, Parametro[]]> {
  const grupos = new Map<string, Parametro[]>()
  for (const p of lista) grupos.set(p.grupo, [...(grupos.get(p.grupo) ?? []), p])
  return [...grupos.entries()]
}

/**
 * Los ajustes del sistema. La pantalla se arma sola con lo que el servidor
 * lista (tipos, límites y valores por defecto): un parámetro nuevo en el
 * backend aparece aquí sin tocar esta pantalla.
 */
export function ParametrosPage() {
  const { useCases } = useDependencies()
  const { puede } = usePermisos()
  const toast = useToast()
  const puedeEditar = puede(SUBMODULO, ACCION.editar)

  const carga = useCarga<Parametro[]>(() => useCases.listarParametros.execute(), [useCases], [])
  // SOLO lo que la persona escribió: el valor mostrado sale de aquí o, si no tocó nada, del servidor.
  // (Antes se copiaba todo a un estado al llegar los datos, y esa copia podía pisar lo que
  // se estaba escribiendo si los datos llegaban justo después.)
  const [ediciones, setEdiciones] = useState<Record<string, string>>({})
  const valores = useMemo(
    () => Object.fromEntries(carga.datos.map((p) => [p.clave, ediciones[p.clave] ?? p.valor])),
    [carga.datos, ediciones],
  )
  const setValores = (fn: (v: Record<string, string>) => Record<string, string>) =>
    setEdiciones((e) => ({ ...e, ...fn({ ...valores, ...e }) }))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errores = useMemo(() => {
    const out: Record<string, string> = {}
    for (const p of carga.datos) {
      const e = errorDeParametro(p, valores[p.clave] ?? p.valor)
      if (e) out[p.clave] = e
    }
    return out
  }, [carga.datos, valores])

  const cambiados = carga.datos.filter((p) => (valores[p.clave] ?? p.valor).trim() !== p.valor)
  const hayErrores = Object.keys(errores).length > 0

  async function guardar() {
    setGuardando(true)
    setError(null)
    const resultado = await useCases.guardarParametros.execute({ parametros: carga.datos, valores })
    setGuardando(false)
    if (resultado.isLeft()) {
      setError(describeFailure(resultado.value))
      return
    }
    toast.exito('Parámetros guardados.')
    setEdiciones({})
    await carga.recargar()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Parámetros"
        description="Ajustes del sistema que se cambian sin tocar código. Rigen desde que se guardan."
        icon={<Sliders size={20} />}
      />

      {carga.error && <Alert>{carga.error}</Alert>}
      {error && <Alert>{error}</Alert>}

      {porGrupo(carga.datos).map(([grupo, lista]) => (
        <PageSection key={grupo} title={grupo}>
          <div className="grid gap-5 sm:grid-cols-2">
            {lista.map((p) => {
              const valor = valores[p.clave] ?? p.valor
              const distinto = valor.trim() !== p.defecto
              return (
                <div key={p.clave} className="space-y-1.5">
                  <Input
                    label={p.etiqueta}
                    type={p.tipo === 'hora' ? 'time' : 'text'}
                    inputMode={p.tipo === 'entero' ? 'numeric' : undefined}
                    value={valor}
                    error={errores[p.clave]}
                    disabled={!puedeEditar || guardando || carga.cargando}
                    onChange={(e) => setValores((v) => ({ ...v, [p.clave]: e.target.value }))}
                    hint={p.unidad ? <span className="text-xs text-ink-soft">{p.unidad}</span> : undefined}
                  />
                  <p className="text-xs text-ink-soft">{p.descripcion}</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-xs text-ink-soft">
                    <span>
                      Por defecto: <strong className="font-medium text-ink-muted">{p.defecto}</strong>
                    </span>
                    {puedeEditar && distinto && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline"
                        onClick={() => setValores((v) => ({ ...v, [p.clave]: p.defecto }))}
                      >
                        <RotateCcw size={11} /> Restablecer
                      </button>
                    )}
                    {p.modificado && p.actualizadoEn && (
                      <span>
                        Cambiado el {p.actualizadoEn.toLocaleDateString('es-PE')}
                        {p.actualizadoPor ? ` por ${p.actualizadoPor}` : ''}
                      </span>
                    )}
                  </p>
                </div>
              )
            })}
          </div>
        </PageSection>
      ))}

      {puedeEditar && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-soft">
            {cambiados.length === 0
              ? 'Sin cambios.'
              : `${cambiados.length} ${cambiados.length === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}.`}
          </p>
          <Button
            size="sm"
            loading={guardando}
            disabled={cambiados.length === 0 || hayErrores}
            onClick={() => void guardar()}
          >
            Guardar cambios
          </Button>
        </div>
      )}
    </div>
  )
}
