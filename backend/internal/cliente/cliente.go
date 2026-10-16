// Package cliente es el huésped que reserva por la web y la forma en que el
// hotel lo clasifica (Regular, Frecuente, VIP, Corporativo...).
//
// El huésped es una cuenta APARTE del personal: otra tabla, otro login y otro
// tipo de token. Un huésped no tiene ningún acceso al panel.
package cliente

import (
	"errors"
	"slices"
	"time"
)

var (
	ErrNoEncontrado = errors.New("cliente: no encontrado")
	ErrEmailUsado   = errors.New("cliente: ya existe una cuenta con ese correo")
	ErrTipoUsado    = errors.New("cliente: ya existe un tipo con ese nombre")
	ErrTipoInvalido = errors.New("cliente: el tipo de cliente no existe o está desactivado")
)

// Cliente es un huésped registrado.
type Cliente struct {
	ID       int64  `json:"id"`
	Nombre   string `json:"nombre"`
	Apellido string `json:"apellido"`
	Email    string `json:"email"`
	Telefono string `json:"telefono"`
	Pais     string `json:"pais"`

	// El tipo con el que se le clasifica y el descuento base que eso le da.
	// DescuentoPct es 0 si el tipo fue desactivado.
	TipoClienteID *int64 `json:"tipoClienteId"`
	TipoCliente   string `json:"tipoCliente"`
	DescuentoPct  int    `json:"descuentoPct"`
	// TipoManual: el personal fijó el tipo a mano y la regla automática no lo mueve.
	TipoManual bool `json:"tipoManual"`

	Activo   bool      `json:"activo"`
	CreadoEn time.Time `json:"creadoEn"`
	// Reservas es cuántas tiene vigentes o cumplidas (las que cuentan para subir de tipo).
	Reservas int `json:"reservas"`

	PasswordHash string `json:"-"`
}

// NombreCompleto es el que se muestra en listados.
func (c Cliente) NombreCompleto() string {
	if c.Apellido == "" {
		return c.Nombre
	}
	return c.Nombre + " " + c.Apellido
}

// Tipo es una categoría de huésped que el hotel define.
type Tipo struct {
	ID          int64  `json:"id"`
	Nombre      string `json:"nombre"`
	Descripcion string `json:"descripcion"`
	// DescuentoPct es el beneficio base de pertenecer al tipo (0..100). Compite con
	// las promociones: NO se acumula con ellas (ver promocion.Mejor).
	DescuentoPct int `json:"descuentoPct"`
	// ReservasMinimas: al llegar a esa cantidad de reservas el huésped sube a este
	// tipo solo. nil = únicamente se asigna a mano (Corporativo, por ejemplo).
	ReservasMinimas *int `json:"reservasMinimas"`
	// Orden: el de menor orden es el tipo de ENTRADA (el que recibe un huésped nuevo).
	Orden  int  `json:"orden"`
	Activo bool `json:"activo"`
}

// Clasificar decide el tipo que corresponde a un huésped con `reservas` reservas.
//
//   - Entre los tipos activos con regla automática que ya alcanzó, el de MÁS
//     reservas mínimas (gana el más exigente; empate: el de mayor descuento y
//     después el de menor id).
//   - Si no alcanzó ninguno, el tipo de entrada: el activo de menor orden.
//   - Sin tipos activos devuelve nil.
//
// Es pura: el costo de equivocarse aquí es regalar o negar descuentos.
func Clasificar(tipos []Tipo, reservas int) *Tipo {
	var mejor *Tipo
	for i := range tipos {
		t := &tipos[i]
		if !t.Activo || t.ReservasMinimas == nil || *t.ReservasMinimas > reservas {
			continue
		}
		if mejor == nil || supera(*t, *mejor) {
			mejor = t
		}
	}
	if mejor != nil {
		c := *mejor
		return &c
	}

	activos := slices.DeleteFunc(slices.Clone(tipos), func(t Tipo) bool { return !t.Activo })
	if len(activos) == 0 {
		return nil
	}
	entrada := slices.MinFunc(activos, func(a, b Tipo) int {
		if a.Orden != b.Orden {
			return a.Orden - b.Orden
		}
		return int(a.ID - b.ID)
	})
	return &entrada
}

// supera dice si a es una mejor coincidencia automática que b.
func supera(a, b Tipo) bool {
	if *a.ReservasMinimas != *b.ReservasMinimas {
		return *a.ReservasMinimas > *b.ReservasMinimas
	}
	if a.DescuentoPct != b.DescuentoPct {
		return a.DescuentoPct > b.DescuentoPct
	}
	return a.ID < b.ID
}
