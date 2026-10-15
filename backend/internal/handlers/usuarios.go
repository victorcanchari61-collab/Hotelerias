package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/middleware"
	"hotelerias/backend/internal/services"
	"hotelerias/backend/pkg/utils"
)

// ListarUsuarios devuelve todos los usuarios.
func (h *Handlers) ListarUsuarios(c *gin.Context) {
	list, err := h.Svc.ListarUsuarios(c.Request.Context())
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "No se pudieron cargar los usuarios")
		return
	}
	utils.Ok(c, list)
}

// CrearUsuario crea un usuario.
func (h *Handlers) CrearUsuario(c *gin.Context) {
	var input services.UsuarioInput
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, "Datos inválidos")
		return
	}

	u, err := h.Svc.CrearUsuario(c.Request.Context(), input)
	if err != nil {
		if errors.Is(err, services.ErrEmailDuplicado) {
			utils.Error(c, http.StatusConflict, err.Error())
			return
		}
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.Creado(c, u)
}

// ActualizarUsuario modifica un usuario.
func (h *Handlers) ActualizarUsuario(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "Id inválido")
		return
	}

	var input services.UsuarioInput
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.Error(c, http.StatusBadRequest, "Datos inválidos")
		return
	}

	u, err := h.Svc.ActualizarUsuario(c.Request.Context(), id, input)
	if err != nil {
		if errors.Is(err, services.ErrEmailDuplicado) {
			utils.Error(c, http.StatusConflict, err.Error())
			return
		}
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.Ok(c, u)
}

type estadoRequest struct {
	Activo bool `json:"activo"`
}

// CambiarEstado activa o desactiva un usuario.
func (h *Handlers) CambiarEstado(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "Id inválido")
		return
	}
	var req estadoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "Datos inválidos")
		return
	}

	if err := h.Svc.CambiarEstado(c.Request.Context(), id, req.Activo); err != nil {
		utils.Error(c, http.StatusInternalServerError, "No se pudo cambiar el estado")
		return
	}
	utils.Ok(c, gin.H{"activo": req.Activo})
}

// EliminarUsuario borra un usuario.
func (h *Handlers) EliminarUsuario(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "Id inválido")
		return
	}

	if err := h.Svc.EliminarUsuario(c.Request.Context(), id, middleware.UsuarioID(c)); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.Ok(c, gin.H{"eliminado": true})
}
