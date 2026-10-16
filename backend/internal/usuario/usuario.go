// Package usuario son las cuentas que entran al sistema: sus datos, la siembra
// del administrador inicial y el listado. Qué PUEDE hacer cada una vive en
// permiso; cómo se AUTENTICA, en auth.
package usuario

import (
	"context"
	"errors"
	"time"
)

// ErrNoEncontrada: no hay una cuenta con ese correo o ese id.
var ErrNoEncontrada = errors.New("usuario: cuenta no encontrada")

// Cuenta es una persona que entra al sistema, con todo lo que la capa de datos
// sabe de ella — incluido el hash. Por eso NO se serializa: hacia afuera sale
// Perfil, que no tiene el hash y no puede filtrarlo por un descuido.
type Cuenta struct {
	ID       int64
	Nombre   string
	Apellido string
	Email    string
	Telefono string
	Foto     string
	Activo   bool
	CreadoEn time.Time

	// RolID y RolNombre son el rol principal: el de acceso total si lo tiene, y
	// si no, el de menor id. La persona puede tener varios (sus permisos son la
	// unión); esto es solo lo que el frontend muestra en la cabecera.
	RolID     *int64
	RolNombre string

	PasswordHash string
}

// Perfil es la forma pública de una Cuenta: lo que viaja al frontend. Sus
// nombres JSON son los que ya lee frontend/src/data/models/usuario.model.ts.
type Perfil struct {
	ID        int64     `json:"id"`
	RolID     *int64    `json:"rolId"`
	RolNombre string    `json:"rolNombre"`
	Nombre    string    `json:"nombre"`
	Apellido  string    `json:"apellido"`
	Email     string    `json:"email"`
	Telefono  string    `json:"telefono"`
	Foto      string    `json:"foto"`
	Activo    bool      `json:"activo"`
	CreadoEn  time.Time `json:"creadoEn"`
}

func (c Cuenta) Perfil() Perfil {
	return Perfil{
		ID: c.ID, RolID: c.RolID, RolNombre: c.RolNombre,
		Nombre: c.Nombre, Apellido: c.Apellido, Email: c.Email,
		Telefono: c.Telefono, Foto: c.Foto, Activo: c.Activo, CreadoEn: c.CreadoEn,
	}
}

// Lector es lo que el listado necesita de la base.
type Lector interface {
	Listar(ctx context.Context) ([]Cuenta, error)
}
