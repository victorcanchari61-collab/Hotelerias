// Package fecha es una fecha de calendario: año, mes y día, sin hora ni zona.
//
// Una estadía de hotel es "del 10 al 13 de noviembre", no "del 10 a las 00:00
// UTC". Con time.Time la zona horaria se cuela y una reserva puede correrse un
// día según dónde corra el servidor. Aquí no existe esa posibilidad.
package fecha

import (
	"encoding/json"
	"fmt"
	"time"
)

const formato = "2006-01-02"

// Fecha es una fecha sin hora. El valor cero es "sin fecha".
type Fecha struct{ t time.Time }

// Nueva arma una fecha. Un día fuera de rango rueda al mes siguiente (como time.Date).
func Nueva(anio int, mes time.Month, dia int) Fecha {
	return Fecha{time.Date(anio, mes, dia, 0, 0, 0, 0, time.UTC)}
}

// DeTiempo toma solo el año/mes/día de un instante, tal como se ven en SU zona.
func DeTiempo(t time.Time) Fecha {
	y, m, d := t.Date()
	return Nueva(y, m, d)
}

// Hoy es la fecha de hoy en la zona dada (la del hotel, no la del servidor).
func Hoy(loc *time.Location) Fecha { return DeTiempo(time.Now().In(loc)) }

// Parse lee "2026-11-10". Es estricto: no acepta horas ni otros formatos.
func Parse(s string) (Fecha, error) {
	t, err := time.Parse(formato, s)
	if err != nil {
		return Fecha{}, fmt.Errorf("fecha %q inválida (se espera AAAA-MM-DD)", s)
	}
	return Fecha{t}, nil
}

func (f Fecha) IsZero() bool { return f.t.IsZero() }
func (f Fecha) String() string {
	if f.IsZero() {
		return ""
	}
	return f.t.Format(formato)
}
func (f Fecha) Time() time.Time { return f.t }

func (f Fecha) Antes(o Fecha) bool   { return f.t.Before(o.t) }
func (f Fecha) Despues(o Fecha) bool { return f.t.After(o.t) }
func (f Fecha) Igual(o Fecha) bool   { return f.t.Equal(o.t) }

// Mas suma (o resta, si es negativo) días.
func (f Fecha) Mas(dias int) Fecha { return Fecha{f.t.AddDate(0, 0, dias)} }

// Noches es cuántas noches hay entre dos fechas (check-in → check-out).
// Negativo si `hasta` es anterior.
func Noches(desde, hasta Fecha) int {
	return int(hasta.t.Sub(desde.t).Hours() / 24)
}

func (f Fecha) MarshalJSON() ([]byte, error) {
	if f.IsZero() {
		return []byte("null"), nil
	}
	return json.Marshal(f.String())
}

func (f *Fecha) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		*f = Fecha{}
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("la fecha debe ser un texto AAAA-MM-DD")
	}
	v, err := Parse(s)
	if err != nil {
		return err
	}
	*f = v
	return nil
}
