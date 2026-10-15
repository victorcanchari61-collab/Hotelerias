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
// Su clave es la misma del menú del frontend ("fact.notaventa").
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
	// Un catálogo que solo se desactiva: tiene historial detrás.
	catalogoSinBorrado = []Accion{Ver, Crear, Editar}
	// Un catálogo grande, con carga masiva desde archivo.
	catalogoImportable = []Accion{Ver, Crear, Editar, Eliminar, Exportar, Importar}
	// Un documento que se emite, se corrige y se anula.
	documento = []Accion{Ver, Crear, Editar, Anular, Exportar}
	// Un documento que además se confirma (se despacha o se recibe).
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
// contradictorios ("Facturación denegado" pero "Pedidos permitido").
func ModuloDe(submodulo string) string {
	for i := 0; i < len(submodulo); i++ {
		if submodulo[i] == '.' {
			return submodulo[:i]
		}
	}
	return submodulo
}

// Permisos es el catálogo del sistema.
var Permisos = nuevoCatalogo([]Submodulo{
	// --- Dashboard ---
	// Un tablero por área, cada uno con su propio permiso: quien maneja el
	// almacén ve Inventario sin que eso le abra las ganancias. Solo lectura.
	sub("dashboard.ventas", []Accion{Ver}),
	sub("dashboard.rentabilidad", []Accion{Ver}),
	sub("dashboard.cobranza", []Accion{Ver}),
	sub("dashboard.inventario", []Accion{Ver}),
	sub("dashboard.reparto", []Accion{Ver}),

	// --- Maestros ---
	sub("maestros.clientes", catalogoImportable),
	sub("maestros.proveedores", catalogoImportable),
	sub("maestros.productos", catalogoImportable),

	// --- Compras ---
	sub("compras.ordenes", documentoConfirmable),
	sub("compras.compras", con(documento, Cobrar)),
	sub("compras.recepciones", documento),

	// --- Inventario ---
	sub("inv.almacenes", catalogo),
	sub("inv.stock", consulta),
	sub("inv.kardex", consulta),
	sub("inv.ajustes", documento),
	sub("inv.transferencias", documento),
	sub("inv.prestamos", documentoConfirmable),
	sub("inv.lotes", consulta),
	sub("inv.conteos", documento),

	// --- Facturación ---
	sub("fact.pedidos", documentoConfirmable),
	sub("fact.notaventa", con(documento, Cobrar)),
	sub("fact.precios", catalogo),
	sub("fact.comprobantes", documento),

	// --- Finanzas ---
	sub("finanzas.metodospago", catalogo),
	sub("finanzas.cobrar", []Accion{Ver, Cobrar, Exportar}),
	sub("finanzas.pagar", []Accion{Ver, Cobrar, Exportar}),
	// Cuánto se ganó con cada producto: ventas menos lo que costó la
	// mercadería. Es un dato del negocio, no de cualquiera.
	sub("finanzas.ganancias", []Accion{Ver}),
	// Ver el saldo y los movimientos de las cajas. "Mi Caja" (la propia) es
	// autoservicio y no pasa por este permiso.
	sub("finanzas.caja", []Accion{Ver}),
	// Alta de una Caja para un vendedor/repartidor y a quién se le asigna.
	sub("finanzas.cajas", []Accion{Ver, Crear, Editar}),
	// Ver los cierres de todos y anular uno mal contado. Confirmar es
	// verificar en el banco los cobros por Yape, Plin o transferencia.
	sub("finanzas.cierres", []Accion{Ver, Confirmar, Anular}),
	// Cuentas bancarias (sin eliminar: con movimientos no se pueden borrar sin
	// dejar huérfano su historial) más la conciliación contra el extracto.
	sub("finanzas.bancos", []Accion{Ver, Crear, Editar}),
	// Ingresos y egresos: categorías y plantillas recurrentes.
	sub("finanzas.operativos", []Accion{Ver, Crear, Editar, Anular, Eliminar}),
	// El kardex del dinero. Crear y anular son los registrados a mano.
	sub("finanzas.movimientos", []Accion{Ver, Crear, Anular, Exportar}),
	// Préstamos recibidos: registrarlos, pagarlos (crear) y anular.
	sub("finanzas.financiamiento", []Accion{Ver, Crear, Anular}),
	// Estado de resultados: si el negocio gana, en un rango de fechas.
	sub("finanzas.resultados", []Accion{Ver, Exportar}),

	// --- TMS ---
	// TMS no declara "eliminar" a propósito: detrás de un mercado, una ruta, un
	// vehículo o un conductor hay clientes, repartos e historial. Se desactivan.
	sub("tms.mercados", catalogoSinBorrado),
	sub("tms.rutas", catalogoSinBorrado),
	sub("tms.flota", catalogoSinBorrado),
	sub("tms.conductores", catalogoSinBorrado),
	// Un despacho no se borra: se anula, y sus pedidos vuelven a quedar libres.
	sub("tms.despachos", documento),
	// Por qué no se entregó algo. Se desactivan, no se borran.
	sub("tms.motivos", catalogoSinBorrado),
	// Lo que no se entregó. "Confirmar" es contar y dar por recibida o faltante.
	sub("tms.novedades", []Accion{Ver, Confirmar, Exportar}),

	// --- DMS ---
	// Una lista de trabajo, no un documento: no se crea ni se anula una visita.
	sub("dms.visitas", consulta),
	// Sin "crear": una devolución nace de editar una nota de venta. Confirmar
	// es aprobar o rechazar, separado de ver para que no las apruebe cualquiera.
	sub("dms.devoluciones", []Accion{Ver, Confirmar, Exportar}),
	sub("dms.evidencias", consulta),

	// --- RR. HH. ---
	sub("rrhh.empleados", catalogo),
	// Un registro por empleado y día. Lleva "eliminar" porque desde la misma
	// pantalla se administran los feriados, que sí se borran sin más.
	sub("rrhh.asistencia", con(documento, Eliminar)),
	// El pago semanal: armarla y pagarla (crear), ajustar (editar), anular.
	sub("rrhh.planilla", []Accion{Ver, Crear, Editar, Anular, Exportar}),
	// Plata a cuenta del sueldo: se da (crear), se cambia (editar) o se anula.
	sub("rrhh.adelantos", []Accion{Ver, Crear, Editar, Anular}),

	// --- Configuración ---
	sub("config.usuarios", catalogo),
	sub("config.roles", catalogo),
	sub("config.accesos", []Accion{Ver, Editar}),
	sub("config.empresa", catalogo),
	// La bitácora crece con cada cambio: eliminar es la depuración masiva por
	// filtros, no el borrado de un registro.
	sub("config.auditoria", []Accion{Ver, Exportar, Eliminar}),
	sub("config.series", catalogo),
	sub("config.parametros", []Accion{Ver, Editar}),
})
