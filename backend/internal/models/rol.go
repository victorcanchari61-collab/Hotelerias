package models

import "time"

// Rol agrupa permisos y se asigna a los usuarios.
type Rol struct {
	ID          int64     `json:"id"`
	Nombre      string    `json:"nombre"`
	Descripcion string    `json:"descripcion"`
	EsSistema   bool      `json:"esSistema"`
	CreadoEn    time.Time `json:"creadoEn"`
	// Permisos es la lista "submodulo:accion" concedida a este rol. Se rellena
	// en consultas y se envía al guardar.
	Permisos []string `json:"permisos,omitempty"`
}
