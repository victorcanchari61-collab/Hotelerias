package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"
<<<<<<< HEAD
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
=======
	"hotelerias/backend/config"
	"hotelerias/backend/internal/db"
	"hotelerias/backend/internal/handlers"
	"hotelerias/backend/internal/middleware"
	"hotelerias/backend/internal/services"
)

func SetupRoutes(r *gin.Engine, databases *db.Databases, cfg *config.Config) {
	svc := services.New(databases, cfg)
	h := handlers.New(svc)

	// Archivos subidos (logo de la empresa, fotos). Se sirven desde la raíz,
	// fuera de /api, igual que espera urlImagen en el frontend.
	r.Static("/uploads", cfg.Server.UploadsDir)

	api := r.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"status":  "ok",
				"message": "Hoteleria API is running",
			})
		})

		// --- Autenticación ---
		api.POST("/auth/login", h.Login)
		api.GET("/auth/me", middleware.RequiereAuth(cfg.JwtSettings), h.Me)

		// --- Permisos (solo requieren sesión: los lee toda la app) ---
		permiso := api.Group("/permiso", middleware.RequiereAuth(cfg.JwtSettings))
		permiso.GET("/catalogo", h.CatalogoPermisos)
		permiso.GET("/mios", h.MisPermisos)

		// --- Usuarios ---
		usuario := api.Group("/usuario", middleware.RequiereAuth(cfg.JwtSettings))
		usuario.GET("", middleware.RequierePermiso(svc, "config.usuarios", "ver"), h.ListarUsuarios)
		usuario.POST("", middleware.RequierePermiso(svc, "config.usuarios", "crear"), h.CrearUsuario)
		usuario.PUT("/:id", middleware.RequierePermiso(svc, "config.usuarios", "editar"), h.ActualizarUsuario)
		usuario.PATCH("/:id/estado", middleware.RequierePermiso(svc, "config.usuarios", "editar"), h.CambiarEstado)
		usuario.DELETE("/:id", middleware.RequierePermiso(svc, "config.usuarios", "eliminar"), h.EliminarUsuario)

		// --- Roles ---
		rol := api.Group("/rol", middleware.RequiereAuth(cfg.JwtSettings))
		rol.GET("", middleware.RequierePermiso(svc, "config.roles", "ver"), h.ListarRoles)
		rol.POST("", middleware.RequierePermiso(svc, "config.roles", "crear"), h.CrearRol)
		rol.PUT("/:id", middleware.RequierePermiso(svc, "config.roles", "editar"), h.ActualizarRol)
		rol.DELETE("/:id", middleware.RequierePermiso(svc, "config.roles", "eliminar"), h.EliminarRol)

		// --- Empresa ---
		empresa := api.Group("/empresa", middleware.RequiereAuth(cfg.JwtSettings))
		empresa.GET("", middleware.RequierePermiso(svc, "config.empresa", "ver"), h.ObtenerEmpresa)
		empresa.PUT("", middleware.RequierePermiso(svc, "config.empresa", "editar"), h.ActualizarEmpresa)
		empresa.POST("/logo", middleware.RequierePermiso(svc, "config.empresa", "editar"), h.SubirLogo)
>>>>>>> b68c3e61192092d61a613dd53006379ece524134
	}
}
