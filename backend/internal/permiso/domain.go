package permiso

import (
	"fmt"
	"strings"
	"time"
)

// Clave es un permiso concreto: una acción sobre un submódulo. Su forma de
// texto, "submodulo:accion", es la que viaja al frontend.
type Clave struct {
	Submodulo string
	Accion    Accion
}

func (c Clave) String() string { return c.Submodulo + ":" + string(c.Accion) }

// ParseClave lee "fact.notaventa:anular". No valida contra el catálogo.
func ParseClave(s string) (Clave, error) {
	i := strings.LastIndexByte(s, ':')
	if i <= 0 || i == len(s)-1 {
		return Clave{}, fmt.Errorf("permiso: clave mal formada %q (se espera submodulo:accion)", s)
	}
	return Clave{Submodulo: s[:i], Accion: Accion(s[i+1:])}, nil
}

// Vigencia es hasta cuándo vale una excepción concedida a una persona suelta.
type Vigencia string

const (
	// UnaVez se gasta al usarla. El caso típico: "necesito anular ESTA nota de
	// venta que emití mal", no "quiero poder anular".
	UnaVez Vigencia = "una_vez"

	// Temporal vale hasta una fecha y hora. Para cubrir un turno o un día.
	Temporal Vigencia = "temporal"

	// Permanente no vence. Es la excepción que en realidad debería acabar en
	// el rol; se deja porque a veces una sola persona hace algo que nadie más.
	Permanente Vigencia = "permanente"
)

// Excepcion es un permiso que una persona tiene y su rol no le da.
//
// Solo suma: no existe la excepción que QUITA algo. Restar por persona
// convertiría cada "¿por qué no puede?" en revisar dos sitios en vez de uno.
type Excepcion struct {
	ID       int64
	Clave    Clave
	Vigencia Vigencia
	ExpiraEn *time.Time
	Usos     int
	Revocado bool
}

// Vigente dice si ahora mismo sirve para algo.
func (e Excepcion) Vigente(ahora time.Time) bool {
	if e.Revocado {
		return false
	}
	switch e.Vigencia {
	case UnaVez:
		return e.Usos == 0
	case Temporal:
		return e.ExpiraEn != nil && e.ExpiraEn.After(ahora)
	case Permanente:
		return true
	default:
		// Una vigencia desconocida no concede nada: ante la duda, se niega.
		return false
	}
}

// Veredicto es la respuesta a "¿puede hacer esto?".
type Veredicto struct {
	Permitido bool

	// GastarID es la excepción de un solo uso que lo autoriza, o 0 si no fue
	// una. Quien ejecute la operación debe reservarla y soltarla si falla.
	GastarID int64
}

// Gasta dice si la autorización depende de una excepción de un solo uso.
func (v Veredicto) Gasta() bool { return v.GastarID != 0 }
