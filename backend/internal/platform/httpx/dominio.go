package httpx

import "errors"

// Los módulos de negocio no conocen códigos HTTP: devuelven estos dos tipos
// (o sus propios errores) y el handler los traduce con Traducir.

// Validacion es un error de datos que quien lo envió puede corregir: el
// mensaje es para mostrárselo tal cual. Se traduce a 400.
type Validacion string

func (v Validacion) Error() string { return string(v) }

// Conflicto es una operación que choca con el estado actual (un nombre
// repetido, algo que está en uso). El mensaje es para la persona. Se traduce a 409.
type Conflicto string

func (c Conflicto) Error() string { return string(c) }

// Traducir pasa Validacion → 400 y Conflicto → 409. Cualquier otro error sale
// igual: el middleware lo vuelve un 500 sin filtrar su detalle.
func Traducir(err error) error {
	var v Validacion
	var c Conflicto
	switch {
	case errors.As(err, &v):
		return BadRequest(v.Error())
	case errors.As(err, &c):
		return Conflict(c.Error())
	}
	return err
}
