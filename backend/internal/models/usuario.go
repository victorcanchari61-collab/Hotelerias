package models

import "time"

// Usuario es una cuenta que entra al sistema. Pertenece a un único rol.
type Usuario struct {
	ID        int64     `json:"id"`
	RolID     *int64    `json:"rolId"`
	RolNombre string    `json:"rolNombre,omitempty"`
	Nombre    string    `json:"nombre"`
	Apellido  string    `json:"apellido"`
	Email     string    `json:"email"`
	Telefono  string    `json:"telefono"`
	Foto      string    `json:"foto"`
	Activo    bool      `json:"activo"`
	CreadoEn  time.Time `json:"creadoEn"`
	// Password solo se usa al crear/actualizar; nunca se serializa hacia fuera.
	Password string `json:"password,omitempty"`
}

// NombreCompleto junta nombre y apellido para mostrar en la cabecera.
func (u Usuario) NombreCompleto() string {
	if u.Apellido == "" {
		return u.Nombre
	}
	return u.Nombre + " " + u.Apellido
}
