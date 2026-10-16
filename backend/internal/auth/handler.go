package auth

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/usuario"
)

// Autenticador es lo que el handler necesita del servicio.
type Autenticador interface {
	Login(ctx context.Context, origen, email, password string) (Sesion, error)
	Me(ctx context.Context, usuarioID int64) (usuario.Perfil, error)
}

// Handler expone /auth/login y /auth/me.
type Handler struct{ svc Autenticador }

func NewHandler(svc Autenticador) *Handler { return &Handler{svc: svc} }

// Publico monta lo que NO exige sesión (el login). Privado, lo que sí.
// Son dos módulos porque routes los cuelga de grupos distintos.
func (h *Handler) Publico() Modulo {
	return modulo(func(r gin.IRouter) { r.POST("/auth/login", h.login) })
}
func (h *Handler) Privado() Modulo { return modulo(func(r gin.IRouter) { r.GET("/auth/me", h.me) }) }

// Modulo es lo que routes.Module espera, sin importar ese paquete.
type Modulo interface{ Register(r gin.IRouter) }

type modulo func(r gin.IRouter)

func (m modulo) Register(r gin.IRouter) { m(r) }

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}

	sesion, err := h.svc.Login(c.Request.Context(), c.ClientIP(), req.Email, req.Password)
	if err != nil {
		_ = c.Error(traducir(err))
		return
	}
	c.JSON(http.StatusOK, sesion)
}

func (h *Handler) me(c *gin.Context) {
	id := UsuarioID(c)
	if id == 0 {
		_ = c.Error(httpx.Unauthorized(ErrSesionInvalida.Error()))
		return
	}

	perfil, err := h.svc.Me(c.Request.Context(), id)
	if err != nil {
		_ = c.Error(traducir(err))
		return
	}
	c.JSON(http.StatusOK, perfil)
}

// traducir pasa un error del servicio a su respuesta HTTP. Lo que no se
// reconoce sigue como error sin tipo: ErrorMiddleware lo vuelve un 500 sin
// filtrar el detalle al cliente.
func traducir(err error) error {
	switch {
	case errors.Is(err, ErrCredenciales):
		return httpx.Unauthorized(ErrCredenciales.Error())
	case errors.Is(err, ErrSesionInvalida):
		return httpx.Unauthorized(ErrSesionInvalida.Error())
	case errors.Is(err, ErrCuentaInactiva):
		return httpx.Forbidden(ErrCuentaInactiva.Error())
	case errors.Is(err, ErrDemasiadosIntentos):
		return httpx.TooManyRequests(ErrDemasiadosIntentos.Error())
	default:
		return err
	}
}
