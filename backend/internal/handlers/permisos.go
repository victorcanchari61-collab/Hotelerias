package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/middleware"
	"hotelerias/backend/pkg/utils"
)

// CatalogoPermisos devuelve módulos, submódulos y acciones para la matriz de Accesos.
func (h *Handlers) CatalogoPermisos(c *gin.Context) {
	utils.Ok(c, h.Svc.Catalogo())
}

// MisPermisos devuelve las claves "submodulo:accion" del usuario autenticado.
func (h *Handlers) MisPermisos(c *gin.Context) {
	id := middleware.UsuarioID(c)
	if id == 0 {
		utils.Error(c, http.StatusUnauthorized, "No autenticado")
		return
	}

	claves, err := h.Svc.PermisosDeUsuario(c.Request.Context(), id)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "No se pudieron leer los permisos")
		return
	}
	if claves == nil {
		claves = []string{}
	}
	utils.Ok(c, claves)
}
