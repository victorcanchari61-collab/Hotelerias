package permiso

import "slices"

// Accion es lo que se puede hacer sobre un submódulo.
//
// No es la lista de siempre (crear/editar/borrar): el negocio tiene acciones
// propias — anular una venta, confirmar un pedido, exportar el padrón.
type Accion string

const (
	// Ver es entrar a la pantalla. Sin esto no aplica ninguna otra.
	Ver Accion = "ver"

	Crear  Accion = "crear"
	Editar Accion = "editar"

	// Anular deja sin efecto un documento ya emitido, conservándolo.
	Anular Accion = "anular"

	// Eliminar es el borrado definitivo. Solo donde de verdad se puede borrar.
	Eliminar Accion = "eliminar"

	Exportar Accion = "exportar"
	Importar Accion = "importar"

	// Confirmar cierra el documento y hace que surta efecto: despachar, recibir.
	Confirmar Accion = "confirmar"

	// Cobrar registra o anula un pago o un cobro.
	Cobrar Accion = "cobrar"
)

// Submodulo es una pantalla con permiso propio y las acciones que admite.
// Su clave es la misma del menú del frontend ("reservas.reservas").
type Submodulo struct {
	Clave    string   `json:"submodulo"`
	Modulo   string   `json:"modulo"`
	Acciones []Accion `json:"acciones"`
}

// Admite dice si la acción existe en este submódulo.
func (s Submodulo) Admite(a Accion) bool { return slices.Contains(s.Acciones, a) }

// Catalogo es la fuente de verdad: qué submódulos existen y qué admite cada uno.
// El backend valida contra esto y la pantalla de Accesos dibuja su matriz con
// lo que devuelve /permiso/catalogo; duplicarlo en el front los separaría con
// el primer submódulo nuevo.
//
// Es una lista y no un mapa porque el orden es el del menú. Es de solo lectura
// después de construirse.
type Catalogo struct {
	submodulos []Submodulo
	porClave   map[string]Submodulo
}

func nuevoCatalogo(subs []Submodulo) *Catalogo {
	c := &Catalogo{submodulos: subs, porClave: make(map[string]Submodulo, len(subs))}
	for _, s := range subs {
		if _, dup := c.porClave[s.Clave]; dup {
			panic("permiso: submódulo duplicado en el catálogo: " + s.Clave)
		}
		c.porClave[s.Clave] = s
	}
	return c
}

// Submodulos devuelve los submódulos en orden de menú. No modificar.
func (c *Catalogo) Submodulos() []Submodulo { return c.submodulos }

// Submodulo busca uno por clave.
func (c *Catalogo) Submodulo(clave string) (Submodulo, bool) {
	s, ok := c.porClave[clave]
	return s, ok
}

// EsValido dice si ese permiso puede existir. Sirve para no guardar basura: un
// submódulo mal escrito o una acción que ese submódulo no admite.
func (c *Catalogo) EsValido(cl Clave) bool {
	s, ok := c.porClave[cl.Submodulo]
	return ok && s.Admite(cl.Accion)
}

// Claves son todas las combinaciones válidas: lo que tiene un acceso total.
func (c *Catalogo) Claves() []Clave {
	var out []Clave
	for _, s := range c.submodulos {
		for _, a := range s.Acciones {
			out = append(out, Clave{s.Clave, a})
		}
	}
	return out
}

// Formas comunes. Cada submódulo declara SOLO lo que tiene sentido en él: la
// auditoría no se crea, el kardex no se anula. Sin ese recorte la matriz serían
// cientos de casillas, la mayoría sin significado, y nadie la configuraría bien.
var (
	// Un listado que además se exporta, pero no se edita desde aquí.
	consulta = []Accion{Ver, Exportar}
	// Un catálogo común: se ve, se crea, se edita y se borra.
	catalogo = []Accion{Ver, Crear, Editar, Eliminar}
	// Un catálogo que solo se desactiva: tiene historial detrás (una habitación
	// con estancias, una tarifa con reservas), borrarlo dejaría huérfanos.
	catalogoSinBorrado = []Accion{Ver, Crear, Editar}
	// Un catálogo grande, con carga masiva desde archivo.
	catalogoImportable = []Accion{Ver, Crear, Editar, Eliminar, Exportar, Importar}
	// Un documento que se emite, se corrige y se anula.
	documento = []Accion{Ver, Crear, Editar, Anular, Exportar}
	// Un documento que además se confirma (se despacha, se recibe, se hace check-in).
	documentoConfirmable = []Accion{Ver, Crear, Editar, Anular, Confirmar, Exportar}
)

// con devuelve base + extra sin tocar base (las formas comunes se comparten).
func con(base []Accion, extra ...Accion) []Accion {
	return append(slices.Clone(base), extra...)
}

func sub(clave string, acciones []Accion) Submodulo {
	return Submodulo{Clave: clave, Modulo: ModuloDe(clave), Acciones: acciones}
}

// ModuloDe devuelve el módulo de un submódulo: el prefijo de su clave. No se
// guarda como permiso aparte: tenerlo en dos niveles permitiría estados
// contradictorios ("Reservas denegado" pero "Tarifas permitido").
func ModuloDe(submodulo string) string {
	for i := 0; i < len(submodulo); i++ {
		if submodulo[i] == '.' {
			return submodulo[:i]
		}
	}
	return submodulo
}

// Permisos es el catálogo del sistema: una CADENA HOTELERA (una sola empresa,
// varias sedes) con alojamiento, restaurantes, servicios exclusivos, productos
// y su ERP/CRM. El orden es el del menú.
//
// La clave es la misma del menú del frontend (presentation/layout/navigation.ts):
// "modulo.vista" → la URL es /modulo/vista. Agregar o renombrar un submódulo se
// hace en los DOS archivos.
var Permisos = nuevoCatalogo([]Submodulo{
	// --- Dashboard: un tablero por área, cada uno con su propio permiso ---
	sub("dashboard.ocupacion", []Accion{Ver}),
	sub("dashboard.ingresos", []Accion{Ver}),
	sub("dashboard.restaurantes", []Accion{Ver}),

	// --- Recepción (PMS / Front Desk) ---
	// El tablero de habitaciones en vivo; cambiar el estado de una es "editar".
	sub("recepcion.panel", []Accion{Ver, Editar}),
	// La estancia: check-in y check-out son "confirmar"; el depósito y el saldo, "cobrar".
	sub("recepcion.estancias", con(documentoConfirmable, Cobrar)),
	// Consumos y servicios cargados a la habitación.
	sub("recepcion.cargos", con(documento, Cobrar)),
	// La ficha de registro del huésped: documento de identidad o pasaporte, nacionalidad y
	// fecha de ingreso al país (lo que luego sustenta la exoneración del IGV a no domiciliados).
	sub("recepcion.fichas", documento),

	// --- Reservas ---
	sub("reservas.reservas", con(documentoConfirmable, Cobrar)),
	sub("reservas.disponibilidad", consulta),
	// Una tarifa con reservas detrás no se borra: se desactiva.
	sub("reservas.tarifas", catalogoSinBorrado),
	sub("reservas.paquetes", catalogoSinBorrado),

	// --- Habitaciones ---
	sub("habitaciones.habitaciones", catalogoSinBorrado),
	sub("habitaciones.tipos", catalogoSinBorrado),
	// Asignar la limpieza y confirmarla (la habitación pasa a disponible).
	sub("habitaciones.housekeeping", []Accion{Ver, Crear, Editar, Confirmar}),
	sub("habitaciones.mantenimiento", documentoConfirmable),
	// Objetos olvidados (lost & found): "confirmar" es registrar la devolución al huésped.
	sub("habitaciones.objetos", documentoConfirmable),
	// Lavado, rotación de sábanas y toallas, y stock de lencería por piso.
	sub("habitaciones.lenceria", documento),

	// --- CRM ---
	sub("crm.huespedes", catalogoImportable),
	sub("crm.fidelizacion", catalogoSinBorrado),
	// Programa de puntos y niveles (Silver, Gold, Platinum). "Confirmar" es canjear o ajustar puntos.
	sub("crm.lealtad", con(catalogoSinBorrado, Confirmar)),
	// "Confirmar" es enviar la campaña.
	sub("crm.campanas", documentoConfirmable),
	// Se leen, se responden (editar) y se exportan; no se crean a mano.
	sub("crm.opiniones", []Accion{Ver, Editar, Exportar}),

	// --- Restaurantes (alimentos y bebidas) ---
	sub("restaurantes.pos", con(documento, Cobrar)),
	// Lo que sale de la cocina: "confirmar" es marcarla como servida.
	sub("restaurantes.comandas", []Accion{Ver, Crear, Editar, Anular, Confirmar}),
	sub("restaurantes.carta", catalogoSinBorrado),
	// Recetas con escandallo: cuánto insumo descuenta cada plato o coctel vendido.
	sub("restaurantes.recetas", catalogoSinBorrado),
	sub("restaurantes.mesas", catalogoSinBorrado),
	// Servicio a la habitación 24/7: se cobra a la habitación o en el momento.
	sub("restaurantes.roomservice", con(documentoConfirmable, Cobrar)),

	// --- Servicios exclusivos y experiencias ---
	// Qué se ofrece: mayordomía, concierge, traslados, mascotas, spa...
	sub("servicios.catalogo", catalogoSinBorrado),
	// Lo que el huésped pide: confirmar es asignarlo y darlo por atendido.
	sub("servicios.pedidos", documentoConfirmable),
	// Mayordomía y concierge: traslados de lujo, reservas en restaurantes, tours privados.
	sub("servicios.mayordomia", documentoConfirmable),
	// Pet concierge: perfil de la mascota, dieta y servicios contratados.
	sub("servicios.mascotas", catalogoSinBorrado),
	sub("servicios.spa", documentoConfirmable),
	sub("servicios.transporte", documentoConfirmable),
	sub("servicios.eventos", con(documentoConfirmable, Cobrar)),
	// Separación de salones, armado de menús y facturación consolidada de banquetes.
	sub("servicios.salones", con(documentoConfirmable, Cobrar)),

	// --- Productos y amenidades ---
	sub("productos.catalogo", catalogoImportable),
	// Los regalos de bienvenida y sus arreglos por tipo de huésped.
	sub("productos.bienvenida", catalogoSinBorrado),
	sub("productos.minibar", documento),

	// --- Inventario ---
	sub("inventario.almacenes", catalogo),
	sub("inventario.stock", consulta),
	sub("inventario.kardex", consulta),
	sub("inventario.ajustes", documento),
	sub("inventario.transferencias", documentoConfirmable),

	// --- Compras ---
	sub("compras.proveedores", catalogoImportable),
	sub("compras.ordenes", documentoConfirmable),
	// "Cobrar" aquí es registrar el pago al proveedor.
	sub("compras.compras", con(documento, Cobrar)),
	sub("compras.recepciones", documento),

	// --- Facturación (comprobantes electrónicos) ---
	sub("facturacion.comprobantes", documento),
	sub("facturacion.notas", documento),

	// --- Finanzas ---
	sub("finanzas.cajas", []Accion{Ver, Crear, Editar}),
	// Ver los cierres de todos y anular uno mal contado. Confirmar es verificar
	// en el banco los cobros por transferencia o billetera.
	sub("finanzas.cierres", []Accion{Ver, Confirmar, Anular}),
	sub("finanzas.bancos", []Accion{Ver, Crear, Editar}),
	sub("finanzas.cobrar", []Accion{Ver, Cobrar, Exportar}),
	sub("finanzas.pagar", []Accion{Ver, Cobrar, Exportar}),
	sub("finanzas.resultados", []Accion{Ver, Exportar}),
	// El tipo de cambio PEN/USD de cada día: de él salen los importes en dólares.
	sub("finanzas.tipocambio", catalogoSinBorrado),

	// --- RR. HH. ---
	sub("rrhh.empleados", catalogo),
	sub("rrhh.asistencia", documento),
	// Un hotel opera 24/7: los turnos y su rotación son parte del día a día.
	sub("rrhh.turnos", catalogoSinBorrado),
	sub("rrhh.planilla", []Accion{Ver, Crear, Editar, Anular, Exportar}),

	// --- Integraciones (conectividad con plataformas externas) ---
	// "Confirmar" es sincronizar a mano disponibilidad y tarifas con las OTAs.
	sub("integraciones.channel", []Accion{Ver, Editar, Confirmar}),
	// Niubiz, Izipay, Stripe, PayPal: las credenciales se editan, nunca se ven.
	sub("integraciones.pagos", []Accion{Ver, Editar}),
	// Central telefónica (cargo de llamadas a la habitación) y cerraduras electrónicas.
	sub("integraciones.dispositivos", []Accion{Ver, Editar}),

	// --- Configuración ---
	sub("config.empresa", catalogo),
	// Una sola empresa con varias sedes: una sede con historial se desactiva.
	sub("config.sedes", catalogoSinBorrado),
	sub("config.usuarios", catalogo),
	sub("config.roles", catalogo),
	sub("config.accesos", []Accion{Ver, Editar}),
	// Eliminar = depurar los registros viejos (nunca los de los últimos 30 días).
	sub("config.auditoria", []Accion{Ver, Exportar, Eliminar}),
	sub("config.parametros", []Accion{Ver, Editar}),
})
