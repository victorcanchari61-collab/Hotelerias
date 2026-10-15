package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/middleware"
	"hotelerias/backend/internal/services"
	"hotelerias/backend/pkg/utils"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Login valida credenciales y devuelve el token junto al usuario.
func (h *Handlers) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "Datos inválidos")
		return
	}

	token, usuario, err := h.Svc.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, services.ErrCredencialesInvalidas) {
			utils.Error(c, http.StatusUnauthorized, "Email o contraseña incorrectos")
			return
		}
		utils.Error(c, http.StatusInternalServerError, "No se pudo iniciar sesión")
		return
	}

	utils.Ok(c, gin.H{"token": token, "usuario": usuario})
}

// Me devuelve el usuario autenticado, para refrescar la sesión.
func (h *Handlers) Me(c *gin.Context) {
	id := middleware.UsuarioID(c)
	if id == 0 {
		utils.Error(c, http.StatusUnauthorized, "No autenticado")
		return
	}

	usuario, err := h.Svc.UsuarioPorID(c.Request.Context(), id)
	if err != nil {
		utils.Error(c, http.StatusNotFound, "Usuario no encontrado")
		return
	}
	utils.Ok(c, usuario)
}
