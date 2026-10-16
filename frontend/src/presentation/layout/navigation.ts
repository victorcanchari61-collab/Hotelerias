import type { LucideIcon } from 'lucide-react'
import { PANEL_BASE } from '../routes/paths'
import {
  Armchair,
  Award,
  CircleDollarSign,
  Luggage,
  NotebookText,
  PawPrint,
  Phone,
  Plug,
  Presentation,
  RefreshCw,
  ScanLine,
  BedDouble,
  BedSingle,
  Bell,
  BookOpenText,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Car,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ConciergeBell,
  Contact,
  CreditCard,
  Crown,
  DoorOpen,
  FileBarChart,
  FileMinus,
  FileText,
  Flower2,
  Gift,
  HandCoins,
  HeartHandshake,
  Hotel,
  IdCard,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  MapPin,
  Megaphone,
  MessageSquareHeart,
  Package,
  PackageCheck,
  PackageSearch,
  PartyPopper,
  Receipt,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Sliders,
  SprayCan,
  Sparkles,
  Star,
  Tags,
  TrendingUp,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  Warehouse,
  Wine,
  Wrench,
  Boxes,
  ArrowLeftRight,
  Banknote,
} from 'lucide-react'

/**
 * El sistema usa UN SOLO COLOR (styles/themes.css), así que todos los grupos
 * comparten la misma clave. Se conserva el campo porque el kit de UI lo pide y
 * porque, si un módulo necesitara el suyo, solo hay que ampliar este tipo y
 * agregar un bloque [data-sys] en themes.css.
 */
export type SysKey = 'brand'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  badge?: string
  /** Marca las vistas que todavia no existen. */
  pending?: boolean
  /** No se pinta en el sider (queda reservada para mas adelante, o vive como pestaña de otra). */
  hidden?: boolean
  /**
   * Otros submodulos que viven DENTRO de esta pantalla, como pestañas. Cada uno conserva su
   * permiso, asi que la entrada se muestra y se abre si se puede ver este o cualquiera de esos;
   * la pantalla ensena solo las pestañas que tocan.
   */
  incluye?: string[]
}

export interface NavGroup {
  id: string
  label: string
  sys: SysKey
  icon: LucideIcon
  items: NavItem[]
}

/**
 * Módulos y submódulos de una CADENA HOTELERA: una sola empresa, varias sedes,
 * con alojamiento, restaurantes, servicios exclusivos y productos, más el ERP
 * (inventario, compras, finanzas, RR. HH.) y el CRM.
 *
 * Cada id es "modulo.vista" y de él salen la URL (`/reservas/tarifas`) y el
 * permiso (`reservas.tarifas:ver`). Tiene que coincidir con el catálogo del
 * backend (internal/permiso/catalogo.go): ahí está la lista de acciones de cada
 * submódulo. Una entrada sin pantalla construida aparece con un punto tenue
 * ("pendiente") y abre "en construcción".
 *
 * El orden es el del día a día de un hotel: primero lo que se mira (tableros) y
 * lo que se opera con el huésped, después el ERP y al final la configuración.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    sys: 'brand',
    icon: LayoutDashboard,
    items: [
      { id: 'dashboard.ocupacion', label: 'Ocupación', icon: BedSingle },
      { id: 'dashboard.ingresos', label: 'Ingresos', icon: TrendingUp },
      { id: 'dashboard.restaurantes', label: 'Restaurantes', icon: ChefHat },
    ],
  },
  {
    id: 'recepcion',
    label: 'Recepción',
    sys: 'brand',
    icon: ConciergeBell,
    items: [
      { id: 'recepcion.panel', label: 'Panel de habitaciones', icon: LayoutGrid },
      { id: 'recepcion.estancias', label: 'Check-in y check-out', icon: DoorOpen },
      { id: 'recepcion.cargos', label: 'Cargos a la habitación', icon: Receipt },
      { id: 'recepcion.fichas', label: 'Fichas de registro', icon: ScanLine },
    ],
  },
  {
    id: 'reservas',
    label: 'Reservas',
    sys: 'brand',
    icon: CalendarCheck,
    items: [
      { id: 'reservas.reservas', label: 'Reservas', icon: CalendarDays },
      { id: 'reservas.disponibilidad', label: 'Disponibilidad', icon: CalendarRange },
      { id: 'reservas.tarifas', label: 'Tarifas y temporadas', icon: Tags },
      { id: 'reservas.paquetes', label: 'Paquetes y promociones', icon: Package },
    ],
  },
  {
    id: 'habitaciones',
    label: 'Habitaciones',
    sys: 'brand',
    icon: BedDouble,
    items: [
      { id: 'habitaciones.habitaciones', label: 'Habitaciones', icon: Hotel },
      { id: 'habitaciones.tipos', label: 'Tipos de habitación', icon: KeyRound },
      { id: 'habitaciones.housekeeping', label: 'Limpieza (housekeeping)', icon: SprayCan },
      { id: 'habitaciones.mantenimiento', label: 'Mantenimiento', icon: Wrench },
      { id: 'habitaciones.objetos', label: 'Objetos olvidados', icon: Luggage },
      { id: 'habitaciones.lenceria', label: 'Lencería y lavandería', icon: Shirt },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    sys: 'brand',
    icon: HeartHandshake,
    items: [
      { id: 'crm.huespedes', label: 'Huéspedes', icon: Contact },
      { id: 'crm.fidelizacion', label: 'Fidelización y VIP', icon: Crown },
      { id: 'crm.lealtad', label: 'Puntos y membresías', icon: Award },
      { id: 'crm.campanas', label: 'Campañas', icon: Megaphone },
      { id: 'crm.opiniones', label: 'Opiniones', icon: MessageSquareHeart },
    ],
  },
  {
    id: 'restaurantes',
    label: 'Restaurantes',
    sys: 'brand',
    icon: UtensilsCrossed,
    items: [
      { id: 'restaurantes.pos', label: 'Punto de venta', icon: CreditCard },
      { id: 'restaurantes.comandas', label: 'Comandas y cocina', icon: ClipboardList },
      { id: 'restaurantes.carta', label: 'Carta y menús', icon: BookOpenText },
      { id: 'restaurantes.recetas', label: 'Recetas y escandallo', icon: NotebookText },
      { id: 'restaurantes.mesas', label: 'Mesas y salones', icon: Armchair },
      { id: 'restaurantes.roomservice', label: 'Room service 24/7', icon: Bell },
    ],
  },
  {
    id: 'servicios',
    label: 'Servicios exclusivos',
    sys: 'brand',
    icon: Sparkles,
    items: [
      { id: 'servicios.catalogo', label: 'Catálogo de servicios', icon: ListChecks },
      { id: 'servicios.pedidos', label: 'Pedidos del huésped', icon: ConciergeBell },
      { id: 'servicios.mayordomia', label: 'Mayordomía y concierge', icon: KeyRound },
      { id: 'servicios.mascotas', label: 'Mascotas (pet concierge)', icon: PawPrint },
      { id: 'servicios.spa', label: 'Wellness y spa', icon: Flower2 },
      { id: 'servicios.transporte', label: 'Traslados y transporte', icon: Car },
      { id: 'servicios.eventos', label: 'Eventos y experiencias', icon: PartyPopper },
      { id: 'servicios.salones', label: 'Salones y banquetes', icon: Presentation },
    ],
  },
  {
    id: 'productos',
    label: 'Productos y amenidades',
    sys: 'brand',
    icon: Gift,
    items: [
      { id: 'productos.catalogo', label: 'Productos y amenidades', icon: Shirt },
      { id: 'productos.bienvenida', label: 'Regalos de bienvenida', icon: Gift },
      { id: 'productos.minibar', label: 'Minibar', icon: Wine },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    sys: 'brand',
    icon: Boxes,
    items: [
      { id: 'inventario.almacenes', label: 'Almacenes', icon: Warehouse },
      { id: 'inventario.stock', label: 'Stock por almacén', icon: PackageSearch },
      { id: 'inventario.kardex', label: 'Kardex', icon: ClipboardCheck },
      { id: 'inventario.ajustes', label: 'Ajustes de inventario', icon: Sliders },
      { id: 'inventario.transferencias', label: 'Transferencias', icon: ArrowLeftRight },
    ],
  },
  {
    id: 'compras',
    label: 'Compras',
    sys: 'brand',
    icon: ShoppingCart,
    // El flujo manda el orden: se emite una orden al proveedor, cuando este la
    // confirma se convierte en compra, y al llegar la mercaderia se recepciona.
    items: [
      { id: 'compras.proveedores', label: 'Proveedores', icon: Building2 },
      { id: 'compras.ordenes', label: 'Órdenes de compra', icon: ClipboardList },
      { id: 'compras.compras', label: 'Mis compras', icon: ShoppingBag },
      { id: 'compras.recepciones', label: 'Recepciones', icon: PackageCheck },
    ],
  },
  {
    id: 'facturacion',
    label: 'Facturación',
    sys: 'brand',
    icon: ReceiptText,
    items: [
      { id: 'facturacion.comprobantes', label: 'Comprobantes electrónicos', icon: FileText },
      { id: 'facturacion.notas', label: 'Notas de crédito y débito', icon: FileMinus },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    sys: 'brand',
    icon: Landmark,
    items: [
      { id: 'finanzas.cajas', label: 'Cajas', icon: HandCoins },
      { id: 'finanzas.cierres', label: 'Cierres de caja', icon: ClipboardCheck },
      { id: 'finanzas.bancos', label: 'Bancos', icon: Landmark },
      { id: 'finanzas.cobrar', label: 'Cuentas por cobrar', icon: Wallet },
      { id: 'finanzas.pagar', label: 'Cuentas por pagar', icon: CreditCard },
      { id: 'finanzas.resultados', label: 'Estado de resultados', icon: FileBarChart },
      { id: 'finanzas.tipocambio', label: 'Tipo de cambio', icon: CircleDollarSign },
    ],
  },
  {
    id: 'rrhh',
    label: 'RR. HH.',
    sys: 'brand',
    icon: Users,
    items: [
      { id: 'rrhh.empleados', label: 'Empleados', icon: Users },
      { id: 'rrhh.asistencia', label: 'Asistencia', icon: Clock },
      { id: 'rrhh.turnos', label: 'Turnos y horarios', icon: CalendarClock },
      { id: 'rrhh.planilla', label: 'Planilla', icon: Banknote },
    ],
  },
  {
    id: 'integraciones',
    label: 'Integraciones',
    sys: 'brand',
    icon: Plug,
    items: [
      { id: 'integraciones.channel', label: 'Channel manager', icon: RefreshCw },
      { id: 'integraciones.pagos', label: 'Pasarelas de pago', icon: CreditCard },
      { id: 'integraciones.dispositivos', label: 'Telefonía y cerraduras', icon: Phone },
    ],
  },
  {
    id: 'config',
    label: 'Configuración',
    sys: 'brand',
    icon: Settings,
    items: [
      { id: 'config.empresa', label: 'Empresa', icon: Building2 },
      { id: 'config.sedes', label: 'Sedes', icon: MapPin },
      { id: 'config.usuarios', label: 'Usuarios', icon: UserCog },
      { id: 'config.roles', label: 'Roles', icon: IdCard },
      { id: 'config.accesos', label: 'Accesos', icon: ShieldCheck },
      { id: 'config.auditoria', label: 'Auditoría', icon: ScrollText },
      { id: 'config.parametros', label: 'Parámetros', icon: Sliders },
    ],
  },
]

/** Color de sistema y titulo de una entrada del menu. */
export function resolveNav(itemId: string): { sys: SysKey; group?: NavGroup; item?: NavItem } {
  const group = NAV_GROUPS.find((g) => g.items.some((i) => i.id === itemId))
  if (!group) return { sys: 'brand' }
  return { sys: group.sys, group, item: group.items.find((i) => i.id === itemId) }
}

/**
 * Si una entrada se puede abrir: porque se puede ver ella, o alguno de los submodulos que lleva
 * dentro como pestañas.
 */
export function puedeAbrir(itemId: string, puedeVer: (submodulo: string) => boolean): boolean {
  if (puedeVer(itemId)) return true
  return (resolveNav(itemId).item?.incluye ?? []).some(puedeVer)
}

/** Primera vista del menu: la que se abre al entrar. */
export const NAV_DEFAULT = NAV_GROUPS[0].items[0].id

/**
 * Ruta de una entrada del menu. El id ya tiene la forma modulo.vista, asi que
 * 'config.usuarios' se convierte en '/admin/config/usuarios' sin declarar nada mas.
 */
export function navPath(itemId: string) {
  return `${PANEL_BASE}/${itemId.split('.').join('/')}`
}

/** Id del menu a partir de la ruta del navegador (la raíz del panel es ''). */
export function navIdFromPath(pathname: string) {
  const dentro = pathname.startsWith(`${PANEL_BASE}/`) || pathname === PANEL_BASE
    ? pathname.slice(PANEL_BASE.length)
    : pathname
  return dentro.replace(/^\/+|\/+$/g, '').split('/').join('.')
}
