package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/services"
	"hotelerias/backend/pkg/utils"
)

// ListarRoles devuelve los roles con sus permisos.
func (h *Handlers) ListarRoles(c *gin.Context) {
	list, err := h.Svc.ListarRoles(c.Request.Context())
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "No se pudieron cargar los roles")
		return
	}
	utils.Ok(c, list)
}

// CrearRol crea un rol con sus permisos.
func (h *Handlers) CrearRol(c *gin.Context) {
	var input services.RolInput
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, "Datos inválidos")
		return
	}

	r, err := h.Svc.CrearRol(c.Request.Context(), input)
	if err != nil {
		if errors.Is(err, services.ErrNombreRolDuplicado) {
			utils.Error(c, http.StatusConflict, err.Error())
			return
		}
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.Creado(c, r)
}

// ActualizarRol modifica un rol y sus permisos.
func (h *Handlers) ActualizarRol(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "Id inválido")
		return
	}

	var input services.RolInput
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, "Datos inválidos")
		return
	}

	r, err := h.Svc.ActualizarRol(c.Request.Context(), id, input)
	if err != nil {
		if errors.Is(err, services.ErrNombreRolDuplicado) {
			utils.Error(c, http.StatusConflict, err.Error())
			return
		}
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.Ok(c, r)
}

// EliminarRol borra un rol no protegido.
func (h *Handlers) EliminarRol(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "Id inválido")
		return
	}

	if err := h.Svc.EliminarRol(c.Request.Context(), id); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.Ok(c, gin.H{"eliminado": true})
}
