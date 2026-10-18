/** Doble de recepción. Implementa la MISMA interfaz que el real. */
import { NotFoundFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type {
  CheckInInput,
  EstanciaRegistrada,
  Ficha,
  HabitacionLibre,
  Movimiento,
} from '@/domain/entities/Recepcion'
import type { EstanciaRepository } from '@/domain/repositories/EstanciaRepository'

export function movimientoDe(parcial: Partial<Movimiento> = {}): Movimiento {
  return {
    fase: 'llegada',
    estanciaId: null,
    reservaId: 1,
    codigo: 'HV-AAAA-0001',
    huesped: 'Lucía Vega',
    sedeId: 1,
    sedeNombre: 'Velothr Miraflores',
    tipoHabitacionId: 10,
    tipoNombre: 'Habitación Deluxe',
    habitacionId: null,
    habitacionNumero: '',
    checkIn: '2026-11-01',
    checkOut: '2026-11-03',
    huespedes: 2,
    notas: '',
    ...parcial,
  }
}

export function fichaDe(parcial: Partial<Ficha> = {}): Ficha {
  return {
    documentoTipo: 'dni',
    documentoNumero: '12345678',
    nombreCompleto: 'Lucía Vega',
    nacionalidad: 'Peruana',
    domiciliado: true,
    fechaIngresoPais: null,
    telefono: '',
    ...parcial,
  }
}

export class FakeEstanciaRepository implements EstanciaRepository {
  movimientos: Movimiento[] = [
    movimientoDe({ reservaId: 1, codigo: 'HV-AAAA-0001', huesped: 'Lucía Vega' }),
    movimientoDe({
      fase: 'en_casa', estanciaId: 7, reservaId: 2, codigo: 'HV-BBBB-0002', huesped: 'John Smith',
      habitacionId: 5, habitacionNumero: '102', checkIn: '2026-10-30', checkOut: '2026-11-01',
    }),
    movimientoDe({
      fase: 'en_casa', estanciaId: 8, reservaId: 3, codigo: 'HV-CCCC-0003', huesped: 'Marta Díaz',
      habitacionId: 6, habitacionNumero: '103', checkIn: '2026-10-31', checkOut: '2026-11-05',
    }),
  ]
  libresLista: HabitacionLibre[] = [
    { id: 11, numero: '101', piso: 1 },
    { id: 12, numero: '104', piso: 1 },
  ]
  fichaLista: Ficha = fichaDe({ nombreCompleto: 'John Smith', documentoTipo: 'pasaporte', documentoNumero: 'X1234567', domiciliado: false, fechaIngresoPais: '2026-10-28' })
  /** Lo que responde a la siguiente operación que escribe (null = bien). */
  falla: Failure | null = null

  checkIns: CheckInInput[] = []
  checkOuts: number[] = []
  fichasPedidas: number[] = []

  async panel() {
    return right<Movimiento[], Failure>(this.movimientos.map((m) => ({ ...m })))
  }

  async libres() {
    return right<HabitacionLibre[], Failure>(this.libresLista.map((h) => ({ ...h })))
  }

  async checkIn(input: CheckInInput): Promise<Either<Failure, EstanciaRegistrada>> {
    if (this.falla) return left(this.falla)
    this.checkIns.push(input)
    const hab = this.libresLista.find((h) => h.id === input.habitacionId)
    this.movimientos = this.movimientos.map((m) =>
      m.reservaId === input.reservaId
        ? { ...m, fase: 'en_casa' as const, estanciaId: 99, habitacionId: input.habitacionId, habitacionNumero: hab?.numero ?? '' }
        : m,
    )
    return right({ id: 99, reservaId: input.reservaId, codigo: 'HV-AAAA-0001', habitacionNumero: hab?.numero ?? '', estado: 'en_casa' })
  }

  async checkOut(id: number): Promise<Either<Failure, EstanciaRegistrada>> {
    if (this.falla) return left(this.falla)
    this.checkOuts.push(id)
    const m = this.movimientos.find((x) => x.estanciaId === id)
    if (!m) return left(new NotFoundFailure('La estancia no existe'))
    this.movimientos = this.movimientos.filter((x) => x.estanciaId !== id)
    return right({ id, reservaId: m.reservaId, codigo: m.codigo, habitacionNumero: m.habitacionNumero, estado: 'finalizada' })
  }

  async ficha(id: number): Promise<Either<Failure, Ficha>> {
    this.fichasPedidas.push(id)
    if (this.falla) return left(this.falla)
    return right(this.fichaLista)
  }
}
