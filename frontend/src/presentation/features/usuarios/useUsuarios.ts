import { useCallback, useEffect, useState } from 'react'
import { describeFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import type { Usuario } from '@/domain/entities/Usuario'
import { useDependencies } from '../../providers/DependencyProvider'

/**
 * El estado de la pantalla de usuarios y sus acciones.
 *
 * Cada acción devuelve el Failure (o null) para que la pantalla decida cómo
 * avisar; el hook no importa Toast ni diálogos: no es su trabajo.
 */
export function useUsuarios() {
  const { useCases } = useDependencies()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const resultado = await useCases.listarUsuarios.execute()
    resultado.fold(
      (failure) => setError(describeFailure(failure)),
      (lista) => {
        setUsuarios(lista)
        setError(null)
      },
    )
    setCargando(false)
  }, [useCases])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const cambiarEstado = useCallback(
    async (usuario: Usuario): Promise<Failure | null> => {
      const resultado = await useCases.cambiarEstadoUsuario.execute({
        id: usuario.id,
        activo: !usuario.activo,
      })
      return resultado.fold(
        (failure) => failure,
        (activo) => {
          setUsuarios((lista) => lista.map((u) => (u.id === usuario.id ? { ...u, activo } : u)))
          return null
        },
      )
    },
    [useCases],
  )

  const eliminar = useCallback(
    async (usuario: Usuario): Promise<Failure | null> => {
      const resultado = await useCases.eliminarUsuario.execute(usuario.id)
      return resultado.fold(
        (failure) => failure,
        () => {
          setUsuarios((lista) => lista.filter((u) => u.id !== usuario.id))
          return null
        },
      )
    },
    [useCases],
  )

  return { usuarios, cargando, error, recargar: cargar, cambiarEstado, eliminar }
}
