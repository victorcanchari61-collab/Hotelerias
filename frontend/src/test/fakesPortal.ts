/**
 * Dobles del portal (web pública). Igual que los de `fakes.ts`: implementan la
 * MISMA interfaz que los reales.
 */
import { AuthenticationFailure, NotFoundFailure, ValidationFailure } from '@/core/errors/failures'
import type { Failure } from '@/core/errors/failures'
import { left, right } from '@/core/utils/either'
import type { Either } from '@/core/utils/either'
import type {
  Cliente,
  CredencialesCliente,
  RegistroCliente,
  SesionCliente,
} from '@/domain/entities/Cliente'
import type {
  BusquedaEstadia,
  Cotizacion,
  DetalleSede,
  Habitacion,
  HabitacionDisponible,
  Promocion,
  Reserva,
  Sede,
  SolicitudReserva,
} from '@/domain/entities/Portal'
import type { ClienteRepository } from '@/domain/repositories/ClienteRepository'
import type { PortalRepository } from '@/domain/repositories/PortalRepository'

export function sedeDe(parcial: Partial<Sede> = {}): Sede {
  return {
    id: 1,
    nombre: 'Velothr Miraflores',
    ciudad: 'Lima',
    direccion: 'Malecón 1200',
    descripcion: 'Frente al Pacífico.',
    estrellas: 5,
    imagen: 'ciudad',
    servicios: ['Spa y bienestar', 'Mayordomo'],
    ...parcial,
  }
}

export function habitacionDe(parcial: Partial<Habitacion> = {}): Habitacion {
  return {
    id: 10,
    sedeId: 1,
    nombre: 'Habitación Deluxe',
    descripcion: 'Luminosa y silenciosa.',
    capacidad: 2,
    camas: '1 cama King',
    areaM2: 32,
    precioNocheCent: 38000,
    cantidad: 12,
    amenidades: ['Menú de almohadas'],
    imagen: 'deluxe',
    ...parcial,
  }
}

export function promocionDe(parcial: Partial<Promocion> = {}): Promocion {
  return {
    id: 1,
    nombre: 'Escapada de 3 noches',
    descripcion: '15% menos desde tres noches.',
    tipo: 'porcentaje',
    porcentaje: 15,
    montoNocheCent: null,
    codigo: null,
    sedeId: null,
    tipoClienteId: null,
    desde: '2026-01-01',
    hasta: '2026-12-31',
    minNoches: 3,
    activo: true,
    ...parcial,
  }
}

export function clienteDe(parcial: Partial<Cliente> = {}): Cliente {
  return {
    id: 7,
    nombre: 'Lucía',
    apellido: 'Vega',
    email: 'lucia@correo.pe',
    telefono: '',
    pais: 'Perú',
    tipoClienteId: 1,
    tipoCliente: 'Regular',
    descuentoPct: 0,
    tipoManual: false,
    activo: true,
    reservas: 0,
    creadoEn: null,
    ...parcial,
  }
}

export function cotizacionDe(parcial: Partial<Cotizacion> = {}): Cotizacion {
  return {
    sedeId: 1,
    sedeNombre: 'Velothr Miraflores',
    tipoHabitacionId: 10,
    habitacion: 'Habitación Deluxe',
    checkIn: '2026-11-10',
    checkOut: '2026-11-12',
    noches: 2,
    huespedes: 2,
    precioNocheCent: 38000,
    subtotalCent: 76000,
    descuento: { origen: '', promocionId: null, nombre: '', totalCent: 0 },
    totalCent: 76000,
    disponibles: 5,
    codigo: '',
    codigoValido: false,
    tipoCliente: '',
    ...parcial,
  }
}

export function reservaDe(parcial: Partial<Reserva> = {}): Reserva {
  return {
    id: 1,
    codigo: 'HV-ABCD-2345',
    clienteId: 7,
    clienteNombre: 'Lucía Vega',
    clienteEmail: 'lucia@correo.pe',
    sedeId: 1,
    sedeNombre: 'Velothr Miraflores',
    tipoHabitacionId: 10,
    habitacion: 'Habitación Deluxe',
    checkIn: '2026-11-10',
    checkOut: '2026-11-12',
    huespedes: 2,
    noches: 2,
    precioNocheCent: 38000,
    subtotalCent: 76000,
    descuentoCent: 0,
    totalCent: 76000,
    descuentoOrigen: '',
    descuentoNombre: '',
    estado: 'confirmada',
    notas: '',
    creadoEn: null,
    ...parcial,
  }
}

export class FakePortalRepository implements PortalRepository {
  sedesLista: Sede[] = [sedeDe()]
  habitaciones: Habitacion[] = [habitacionDe()]
  /** Cuántas quedan por id de habitación; por defecto, 5. */
  disponibles = new Map<number, number>()
  promos: Promocion[] = [promocionDe()]
  /** Lo que cotiza: se parte de la lista y se aplica `descuentoPct` si lo hay. */
  descuentoPct = 0
  nombreDescuento = ''

  reservaResult: Either<Failure, Reserva> | null = null
  misReservasLista: Reserva[] = []

  // Registros de lo que se llamó, para verificar el orden y la cantidad.
  cotizaciones: SolicitudReserva[] = []
  reservas: SolicitudReserva[] = []
  cancelaciones: string[] = []
  disponibilidades: BusquedaEstadia[] = []

  async sedes() {
    return right<Sede[], Failure>([...this.sedesLista])
  }

  async sede(id: number): Promise<Either<Failure, DetalleSede>> {
    const sede = this.sedesLista.find((s) => s.id === id)
    if (!sede) return left(new NotFoundFailure('Ese hotel no existe'))
    return right({ sede, habitaciones: this.habitaciones.filter((h) => h.sedeId === id) })
  }

  async disponibilidad(sedeId: number, b: BusquedaEstadia) {
    this.disponibilidades.push(b)
    const lista: HabitacionDisponible[] = this.habitaciones
      .filter((h) => h.sedeId === sedeId && h.capacidad >= b.huespedes)
      .map((h) => ({ ...h, disponibles: this.disponibles.get(h.id) ?? 5 }))
    return right<HabitacionDisponible[], Failure>(lista)
  }

  async promociones() {
    return right<Promocion[], Failure>([...this.promos])
  }

  async cotizar(s: SolicitudReserva) {
    this.cotizaciones.push(s)
    const h = this.habitaciones.find((x) => x.id === s.tipoHabitacionId)
    if (!h) return left<Failure, Cotizacion>(new NotFoundFailure('Esa habitación no está disponible'))

    const noches = Math.round(
      (Date.parse(`${s.checkOut}T00:00:00Z`) - Date.parse(`${s.checkIn}T00:00:00Z`)) / 86_400_000,
    )
    const subtotal = h.precioNocheCent * noches
    const desc = Math.round((subtotal * this.descuentoPct) / 100)
    return right(
      cotizacionDe({
        sedeId: h.sedeId,
        tipoHabitacionId: h.id,
        habitacion: h.nombre,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        noches,
        huespedes: s.huespedes,
        precioNocheCent: h.precioNocheCent,
        subtotalCent: subtotal,
        descuento: {
          origen: desc > 0 ? 'tipo_cliente' : '',
          promocionId: null,
          nombre: desc > 0 ? this.nombreDescuento : '',
          totalCent: desc,
        },
        totalCent: subtotal - desc,
        disponibles: this.disponibles.get(h.id) ?? 5,
        codigo: s.codigo,
      }),
    )
  }

  async reservar(s: SolicitudReserva) {
    this.reservas.push(s)
    if (this.reservaResult) return this.reservaResult
    return right<Reserva, Failure>(
      reservaDe({ tipoHabitacionId: s.tipoHabitacionId, checkIn: s.checkIn, checkOut: s.checkOut }),
    )
  }

  async misReservas() {
    return right<Reserva[], Failure>([...this.misReservasLista])
  }

  async cancelar(codigo: string) {
    this.cancelaciones.push(codigo)
    const r = this.misReservasLista.find((x) => x.codigo === codigo)
    if (!r) return left<Failure, Reserva>(new NotFoundFailure('La reserva no existe'))
    const cancelada = { ...r, estado: 'cancelada' as const }
    this.misReservasLista = this.misReservasLista.map((x) => (x.codigo === codigo ? cancelada : x))
    return right<Reserva, Failure>(cancelada)
  }
}

export class FakeClienteRepository implements ClienteRepository {
  cliente: Cliente = clienteDe()
  loginResult: Either<Failure, SesionCliente> | null = null
  loginCalls: CredencialesCliente[] = []
  registroCalls: RegistroCliente[] = []
  meCalls = 0

  async registrar(r: RegistroCliente) {
    this.registroCalls.push(r)
    return right<SesionCliente, Failure>({
      token: 'tok-cliente',
      cliente: clienteDe({ nombre: r.nombre, email: r.email }),
    })
  }

  async login(c: CredencialesCliente) {
    this.loginCalls.push(c)
    if (this.loginResult) return this.loginResult
    if (c.password !== 'clave-correcta') {
      return left<Failure, SesionCliente>(new AuthenticationFailure('Email o contraseña incorrectos'))
    }
    return right<SesionCliente, Failure>({ token: 'tok-cliente', cliente: this.cliente })
  }

  async me() {
    this.meCalls++
    return right<Cliente, Failure>(this.cliente)
  }
}

export const conflicto = (mensaje: string) => left<Failure, Reserva>(new ValidationFailure(mensaje))
