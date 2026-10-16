// Package promocion son las ofertas que crea el hotel y la regla que decide qué
// descuento recibe una estadía.
//
// El motor (Aplica, Calcular, Mejor) es PURO: sin base ni red. Es dinero, así
// que es lo más probado del sistema.
package promocion

import (
	"strings"

	"hotelerias/backend/internal/platform/fecha"
)

type Tipo string

const (
	// Porcentaje descuenta un % del total de la estadía.
	Porcentaje Tipo = "porcentaje"
	// MontoNoche descuenta un monto fijo POR NOCHE.
	MontoNoche Tipo = "monto_noche"
)

// Promocion es una oferta del hotel.
type Promocion struct {
	ID          int64  `json:"id"`
	Nombre      string `json:"nombre"`
	Descripcion string `json:"descripcion"`
	Tipo        Tipo   `json:"tipo"`

	// Solo uno de los dos según Tipo.
	Porcentaje     *int   `json:"porcentaje"`
	MontoNocheCent *int64 `json:"montoNocheCent"`

	// Codigo nulo = se aplica sola. Con código, solo si el huésped lo escribe.
	Codigo *string `json:"codigo"`
	// SedeID nulo = todas las sedes. TipoClienteID nulo = todos los huéspedes.
	SedeID        *int64 `json:"sedeId"`
	TipoClienteID *int64 `json:"tipoClienteId"`

	// Desde/Hasta son las fechas de ESTADÍA para las que vale (la estadía entera
	// tiene que caer dentro).
	Desde     fecha.Fecha `json:"desde"`
	Hasta     fecha.Fecha `json:"hasta"`
	MinNoches int         `json:"minNoches"`
	Activo    bool        `json:"activo"`
}

// Estadia es lo que se cotiza.
type Estadia struct {
	SedeID          int64
	TipoClienteID   *int64
	CheckIn         fecha.Fecha
	CheckOut        fecha.Fecha
	PrecioNocheCent int64
	// Codigo es el que el huésped escribió (puede venir vacío).
	Codigo string
}

func (e Estadia) Noches() int { return fecha.Noches(e.CheckIn, e.CheckOut) }

// SubtotalCent es el precio sin descuento.
func (e Estadia) SubtotalCent() int64 { return e.PrecioNocheCent * int64(e.Noches()) }

// Aplica dice si la promoción corresponde a esa estadía.
func (p Promocion) Aplica(e Estadia) bool {
	if !p.Activo {
		return false
	}
	if p.SedeID != nil && *p.SedeID != e.SedeID {
		return false
	}
	if p.TipoClienteID != nil && (e.TipoClienteID == nil || *p.TipoClienteID != *e.TipoClienteID) {
		return false
	}
	if e.Noches() < p.MinNoches || e.Noches() <= 0 {
		return false
	}

	// La estadía entera tiene que caer dentro de la ventana: la primera noche es
	// el check-in y la última, la víspera del check-out.
	ultimaNoche := e.CheckOut.Mas(-1)
	if e.CheckIn.Antes(p.Desde) || ultimaNoche.Despues(p.Hasta) {
		return false
	}

	// Una oferta con código no se aplica sola: es justamente lo que la distingue.
	if p.Codigo != nil && !strings.EqualFold(*p.Codigo, strings.TrimSpace(e.Codigo)) {
		return false
	}
	return true
}

// Calcular es cuánto descuenta, en céntimos. Nunca más que el subtotal ni menos
// que cero. Asume que Aplica ya dio true.
func (p Promocion) Calcular(e Estadia) int64 {
	subtotal := e.SubtotalCent()
	var d int64

	switch p.Tipo {
	case Porcentaje:
		if p.Porcentaje != nil {
			d = porcentajeDe(subtotal, *p.Porcentaje)
		}
	case MontoNoche:
		if p.MontoNocheCent != nil {
			d = *p.MontoNocheCent * int64(e.Noches())
		}
	}

	if d < 0 {
		return 0
	}
	if d > subtotal {
		return subtotal
	}
	return d
}

// porcentajeDe calcula pct% de un monto en céntimos, redondeando al céntimo más
// cercano (mitad hacia arriba) y SIN pasar por float.
func porcentajeDe(centimos int64, pct int) int64 {
	return (centimos*int64(pct) + 50) / 100
}

// Origen dice de dónde salió el descuento aplicado.
type Origen string

const (
	SinDescuento Origen = ""
	DePromocion  Origen = "promocion"
	DeTipo       Origen = "tipo_cliente"
)

// Beneficio es el descuento base que da el tipo de cliente de un huésped.
type Beneficio struct {
	Nombre string // "VIP"
	Pct    int
}

// Descuento es lo que finalmente se aplica a una estadía.
type Descuento struct {
	Origen      Origen `json:"origen"`
	PromocionID *int64 `json:"promocionId"`
	Nombre      string `json:"nombre"`
	TotalCent   int64  `json:"totalCent"`
}

// Mejor elige el descuento de una estadía: el MAYOR entre las promociones que
// aplican y el beneficio del tipo de cliente. NO se acumulan.
//
// No acumular es una decisión de negocio, no un límite técnico: un VIP con 10%
// que además reciba 20% de una oferta pagaría 30% menos sin que nadie lo haya
// decidido. Si el hotel quiere acumular, es un cambio explícito aquí.
//
// Empate: gana la promoción (es la que el hotel puso a propósito para esa
// estadía) y, entre promociones, la de menor id (determinista).
func Mejor(promos []Promocion, e Estadia, beneficio *Beneficio) Descuento {
	mejor := Descuento{Origen: SinDescuento}

	for i := range promos {
		p := promos[i]
		if !p.Aplica(e) {
			continue
		}
		d := p.Calcular(e)
		if d <= 0 {
			continue
		}
		if d > mejor.TotalCent || (d == mejor.TotalCent && mejor.Origen == DePromocion && p.ID < *mejor.PromocionID) {
			id := p.ID
			mejor = Descuento{Origen: DePromocion, PromocionID: &id, Nombre: p.Nombre, TotalCent: d}
		}
	}

	if beneficio != nil && beneficio.Pct > 0 {
		d := porcentajeDe(e.SubtotalCent(), beneficio.Pct)
		if d > e.SubtotalCent() {
			d = e.SubtotalCent()
		}
		// Estrictamente mayor: en empate se queda la promoción.
		if d > mejor.TotalCent {
			mejor = Descuento{Origen: DeTipo, Nombre: "Beneficio " + beneficio.Nombre, TotalCent: d}
		}
	}
	return mejor
}
