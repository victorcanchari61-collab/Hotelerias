package handlers

import "hotelerias/backend/internal/services"

// Handlers agrupa todos los endpoints de la API. Cada método recibe la capa de
// servicios ya conectada a las bases de datos.
type Handlers struct {
	Svc *services.Service
}

func New(svc *services.Service) *Handlers {
	return &Handlers{Svc: svc}
}
