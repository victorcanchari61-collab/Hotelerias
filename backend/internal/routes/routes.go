package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Module es un módulo de negocio que sabe colgar sus propias rutas. Agregar
// uno nuevo es sumarlo a Deps.Modules en main: este paquete no se toca.
type Module interface {
	Register(r gin.IRouter)
}

// Deps es lo que hace falta para armar las rutas. Cada campo es lo mínimo que
// se necesita; nada de bases de datos ni config aquí.
type Deps struct {
	// Authenticate exige sesión válida. Corre antes que cualquier módulo.
	Authenticate gin.HandlerFunc

	// Modules son los módulos que viven detrás de la sesión.
	Modules []Module
}

func Register(r gin.IRouter, d Deps) {
	api := r.Group("/api")

	// Público: sin sesión.
	api.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"message": "Hoteleria API is running",
		})
	})

	// Todo lo demás exige sesión; el permiso concreto lo declara cada ruta.
	protegido := api.Group("", d.Authenticate)
	for _, m := range d.Modules {
		m.Register(protegido)
	}
}
