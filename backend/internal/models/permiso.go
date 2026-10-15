package models

// Acciones que se pueden conceder sobre un submódulo. Se mantienen en un solo
// lugar para que el catálogo, la matriz de Accesos y el filtro de permisos
// hablen el mismo idioma.
var Acciones = []string{
	"ver",
	"crear",
	"editar",
	"anular",
	"eliminar",
	"exportar",
	"importar",
	"confirmar",
	"cobrar",
}

// SubmoduloCatalogo es una entrada del catálogo de permisos: qué acciones
// existen sobre un submódulo, agrupadas por módulo.
type SubmoduloCatalogo struct {
	Submodulo string   `json:"submodulo"`
	Modulo    string   `json:"modulo"`
	Acciones  []string `json:"acciones"`
}

// Catalogo describe la estructura de módulos/submódulos del sistema.
// Es el mismo árbol que el menú del frontend (components/layout/navigation.ts).
var Catalogo = []SubmoduloCatalogo{
	// Dashboard
	{Modulo: "dashboard", Submodulo: "dashboard.ventas"},
	{Modulo: "dashboard", Submodulo: "dashboard.rentabilidad"},
	{Modulo: "dashboard", Submodulo: "dashboard.cobranza"},
	{Modulo: "dashboard", Submodulo: "dashboard.inventario"},
	{Modulo: "dashboard", Submodulo: "dashboard.reparto"},
	// Maestros
	{Modulo: "maestros", Submodulo: "maestros.clientes"},
	{Modulo: "maestros", Submodulo: "maestros.proveedores"},
	{Modulo: "maestros", Submodulo: "maestros.productos"},
	// Compras
	{Modulo: "compras", Submodulo: "compras.ordenes"},
	{Modulo: "compras", Submodulo: "compras.compras"},
	{Modulo: "compras", Submodulo: "compras.recepciones"},
	// Inventario
	{Modulo: "inv", Submodulo: "inv.almacenes"},
	{Modulo: "inv", Submodulo: "inv.stock"},
	{Modulo: "inv", Submodulo: "inv.kardex"},
	{Modulo: "inv", Submodulo: "inv.ajustes"},
	{Modulo: "inv", Submodulo: "inv.transferencias"},
	{Modulo: "inv", Submodulo: "inv.prestamos"},
	{Modulo: "inv", Submodulo: "inv.lotes"},
	{Modulo: "inv", Submodulo: "inv.conteos"},
	// Facturación
	{Modulo: "fact", Submodulo: "fact.pedidos"},
	{Modulo: "fact", Submodulo: "fact.notaventa"},
	{Modulo: "fact", Submodulo: "fact.precios"},
	{Modulo: "fact", Submodulo: "fact.comprobantes"},
	{Modulo: "fact", Submodulo: "fact.notas"},
	// Finanzas
	{Modulo: "finanzas", Submodulo: "finanzas.caja"},
	{Modulo: "finanzas", Submodulo: "finanzas.cajas"},
	{Modulo: "finanzas", Submodulo: "finanzas.cierres"},
	{Modulo: "finanzas", Submodulo: "finanzas.bancos"},
	{Modulo: "finanzas", Submodulo: "finanzas.metodospago"},
	{Modulo: "finanzas", Submodulo: "finanzas.cobrar"},
	{Modulo: "finanzas", Submodulo: "finanzas.pagar"},
	{Modulo: "finanzas", Submodulo: "finanzas.ganancias"},
	{Modulo: "finanzas", Submodulo: "finanzas.resultados"},
	{Modulo: "finanzas", Submodulo: "finanzas.movimientos"},
	{Modulo: "finanzas", Submodulo: "finanzas.operativos"},
	{Modulo: "finanzas", Submodulo: "finanzas.financiamiento"},
	// TMS
	{Modulo: "tms", Submodulo: "tms.mercados"},
	{Modulo: "tms", Submodulo: "tms.rutas"},
	{Modulo: "tms", Submodulo: "tms.flota"},
	{Modulo: "tms", Submodulo: "tms.conductores"},
	{Modulo: "tms", Submodulo: "tms.despachos"},
	{Modulo: "tms", Submodulo: "tms.novedades"},
	{Modulo: "tms", Submodulo: "tms.motivos"},
	// DMS
	{Modulo: "dms", Submodulo: "dms.visitas"},
	{Modulo: "dms", Submodulo: "dms.devoluciones"},
	{Modulo: "dms", Submodulo: "dms.evidencias"},
	// RR. HH.
	{Modulo: "rrhh", Submodulo: "rrhh.empleados"},
	{Modulo: "rrhh", Submodulo: "rrhh.asistencia"},
	{Modulo: "rrhh", Submodulo: "rrhh.planilla"},
	{Modulo: "rrhh", Submodulo: "rrhh.adelantos"},
	// Configuración
	{Modulo: "config", Submodulo: "config.usuarios"},
	{Modulo: "config", Submodulo: "config.roles"},
	{Modulo: "config", Submodulo: "config.accesos"},
	{Modulo: "config", Submodulo: "config.empresa"},
	{Modulo: "config", Submodulo: "config.auditoria"},
	{Modulo: "config", Submodulo: "config.series"},
	{Modulo: "config", Submodulo: "config.parametros"},
}

// CatalogoConAcciones devuelve el catálogo con las acciones resueltas para cada
// submódulo. Se construye al vuelo porque la lista de acciones es la misma para
// todos hoy; si mañana un módulo necesita acciones distintas, se cambia aquí.
func CatalogoConAcciones() []SubmoduloCatalogo {
	out := make([]SubmoduloCatalogo, len(Catalogo))
	for i, c := range Catalogo {
		out[i] = SubmoduloCatalogo{
			Submodulo: c.Submodulo,
			Modulo:    c.Modulo,
			Acciones:  Acciones,
		}
	}
	return out
}

// ExisteSubmodulo indica si un submódulo forma parte del catálogo.
func ExisteSubmodulo(submodulo string) bool {
	for _, c := range Catalogo {
		if c.Submodulo == submodulo {
			return true
		}
	}
	return false
}

// TodasLasClaves devuelve "submodulo:accion" para cada acción de cada
// submódulo. Se usa para sembrar el rol Administrador con acceso total.
func TodasLasClaves() []string {
	var claves []string
	for _, c := range Catalogo {
		for _, a := range Acciones {
			claves = append(claves, c.Submodulo+":"+a)
		}
	}
	return claves
}
