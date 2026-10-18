/** Doble del inventario de habitaciones. Implementa la MISMA interfaz que el real. */
import { NotFoundFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type {
  EstadoHabitacion,
  HabitacionFisica,
  HabitacionInput,
  LoteHabitaciones,
  OpcionesHabitacion,
} from '@/domain/entities/Inventario'
import type { HabitacionRepository } from '@/domain/repositories/HabitacionRepository'

export function habitacionFisicaDe(parcial: Partial<HabitacionFisica> = {}): HabitacionFisica {
  return {
    id: 1,
    sedeId: 1,
    sedeNombre: 'Velothr Miraflores',
    tipoHabitacionId: 10,
    tipoNombre: 'Habitación Deluxe',
    numero: '101',
    piso: 1,
    estado: 'limpia',
    notas: '',
    activa: true,
    actualizadoEn: null,
    ...parcial,
  }
}

export const OPCIONES_BASE: OpcionesHabitacion = {
  sedes: [{ id: 1, nombre: 'Velothr Miraflores' }],
  tipos: [
    { id: 10, sedeId: 1, nombre: 'Habitación Deluxe', sedeNombre: 'Velothr Miraflores', activo: true },
    { id: 11, sedeId: 1, nombre: 'Suite Ejecutiva', sedeNombre: 'Velothr Miraflores', activo: true },
  ],
}

export class FakeHabitacionRepository implements HabitacionRepository {
  lista: HabitacionFisica[] = [
    habitacionFisicaDe({ id: 1, numero: '101' }),
    habitacionFisicaDe({ id: 2, numero: '102', estado: 'sucia' }),
    habitacionFisicaDe({ id: 3, numero: '103', estado: 'ocupada' }),
    habitacionFisicaDe({ id: 4, numero: '104', estado: 'mantenimiento' }),
    habitacionFisicaDe({ id: 5, numero: '105', activa: false }),
  ]
  opcionesLista: OpcionesHabitacion = OPCIONES_BASE
  /** Lo que responde a la siguiente operación que escribe (null = bien). */
  falla: Failure | null = null

  creadas: HabitacionInput[] = []
  lotes: LoteHabitaciones[] = []
  actualizadas: Array<{ id: number; input: HabitacionInput }> = []
  estados: Array<{ id: number; estado: EstadoHabitacion }> = []

  async listar() {
    return right<HabitacionFisica[], Failure>(this.lista.map((h) => ({ ...h })))
  }

  async opciones() {
    return right<OpcionesHabitacion, Failure>(this.opcionesLista)
  }

  async crear(input: HabitacionInput): Promise<Either<Failure, HabitacionFisica>> {
    if (this.falla) return left(this.falla)
    this.creadas.push(input)
    const nueva = habitacionFisicaDe({ id: this.lista.length + 1, numero: input.numero, piso: input.piso, notas: input.notas, activa: input.activa })
    this.lista = [...this.lista, nueva]
    return right(nueva)
  }

  async crearLote(lote: LoteHabitaciones): Promise<Either<Failure, number>> {
    if (this.falla) return left(this.falla)
    this.lotes.push(lote)
    return right(lote.hasta - lote.desde + 1)
  }

  async actualizar(id: number, input: HabitacionInput): Promise<Either<Failure, HabitacionFisica>> {
    if (this.falla) return left(this.falla)
    this.actualizadas.push({ id, input })
    const actual = this.lista.find((h) => h.id === id)
    if (!actual) return left(new NotFoundFailure('La habitación no existe'))
    const nueva = { ...actual, numero: input.numero, piso: input.piso, notas: input.notas, activa: input.activa }
    this.lista = this.lista.map((h) => (h.id === id ? nueva : h))
    return right(nueva)
  }

  async cambiarEstado(id: number, estado: EstadoHabitacion): Promise<Either<Failure, HabitacionFisica>> {
    if (this.falla) return left(this.falla)
    this.estados.push({ id, estado })
    const actual = this.lista.find((h) => h.id === id)
    if (!actual) return left(new NotFoundFailure('La habitación no existe'))
    const nueva = { ...actual, estado }
    this.lista = this.lista.map((h) => (h.id === id ? nueva : h))
    return right(nueva)
  }
}
