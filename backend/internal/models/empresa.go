package models

import "time"

// Empresa es el único registro de datos de la compañía (una sola empresa,
// múltiples sedes). Vive en una fila fija con id = 1.
type Empresa struct {
	ID              int64     `json:"id"`
	RUC             string    `json:"ruc"`
	RazonSocial     string    `json:"razonSocial"`
	NombreComercial string    `json:"nombreComercial"`
	Direccion       string    `json:"direccion"`
	Departamento    string    `json:"departamento"`
	Provincia       string    `json:"provincia"`
	Distrito        string    `json:"distrito"`
	Telefono        string    `json:"telefono"`
	Email           string    `json:"email"`
	Web             string    `json:"web"`
	Logo            string    `json:"logo"`
	UpdatedAt       time.Time `json:"updatedAt"`
}
