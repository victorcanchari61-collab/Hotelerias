package reserva

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/hotel"
	"hotelerias/backend/internal/platform/httpx"
)

// Alcance dice qué sedes alcanza a ver una persona en esta pantalla. nil = todas.
// Una lista vacía es "ninguna": quien tiene "mis sedes" y ninguna asignada no
// ve nada (nunca "todas" por descuido).
type Alcance interface {
	SedesVisibles(ctx context.Context, usuarioID int64) ([]int64, error)
}

// AdminHandler es lo que usa el personal para ver y anular reservas.
type AdminHandler struct {
	svc       *Servicio
	guardas   httpx.Guardas
	alcance   Alcance
	auditoria auditoria.Registrador
}

func NewAdminHandler(svc *Servicio, g httpx.Guardas, alcance Alcance, aud auditoria.Registrador) *AdminHandler {
	return &AdminHandler{svc: svc, guardas: g, alcance: alcance, auditoria: aud}
}

// SinRestriccion es el Alcance de quien ve todas las sedes (y el de las pruebas).
type SinRestriccion struct{}

func (SinRestriccion) SedesVisibles(context.Context, int64) ([]int64, error) { return nil, nil }

func (h *AdminHandler) Register(r gin.IRouter) {
	r.GET("/reserva", httpx.Cadena(h.guardas.Ver, h.listar)...)
	r.POST("/reserva/:id/cancelar", httpx.Cadena(h.guardas.Anular, h.cancelar)...)
}

func (h *AdminHandler) listar(c *gin.Context) {
	sedes, err := h.alcance.SedesVisibles(c.Request.Context(), auth.UsuarioID(c))
	if err != nil {
		_ = c.Error(err)
		return
	}
	out, err := h.svc.Listar(c.Request.Context(), Estado(c.Query("estado")), sedes)
	if err != nil {
		_ = c.Error(Traducir(err))
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *AdminHandler) cancelar(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return
	}
	sedes, err := h.alcance.SedesVisibles(c.Request.Context(), auth.UsuarioID(c))
	if err != nil {
		_ = c.Error(err)
		return
	}
	r, err := h.svc.CancelarPorPersonal(c.Request.Context(), id, sedes)
	if err != nil {
		_ = c.Error(Traducir(err))
		return
	}
	h.auditoria.Registrar(c.Request.Context(), auditoria.Evento{
		UsuarioID: auth.UsuarioID(c), Entidad: "Reserva", EntidadID: r.Codigo, Accion: auditoria.Actualizado,
		Antes:   map[string]any{"estado": string(Confirmada)},
		Despues: map[string]any{"estado": string(Cancelada), "cancelada por": "personal"},
	})
	c.JSON(http.StatusOK, r)
}

// Traducir pasa un error de este paquete a su respuesta HTTP. Lo que no se
// reconoce sigue como error sin tipo: el middleware lo vuelve un 500 sin
// filtrar el detalle.
func Traducir(err error) error {
	var v httpx.Validacion
	switch {
	case errors.As(err, &v):
		return httpx.BadRequest(v.Error())
	case errors.Is(err, ErrNoEncontrada):
		return httpx.NotFound("La reserva no existe")
	case errors.Is(err, hotel.ErrNoEncontrada):
		return httpx.NotFound("Ese hotel o habitación no está disponible")
	case errors.Is(err, ErrSinDisponibilidad):
		return httpx.Conflict("Ya no quedan habitaciones de ese tipo para esas fechas")
	case errors.Is(err, ErrPrecioCambio):
		return httpx.Conflict("El precio cambió. Vuelve a cotizar para ver el nuevo total.")
	case errors.Is(err, ErrNoCancelable):
		return httpx.Conflict("Esta reserva ya no se puede cancelar por la web. Comunícate con el hotel.")
	case errors.Is(err, auth.ErrSesionInvalida):
		return httpx.Unauthorized(auth.ErrSesionInvalida.Error())
	case errors.Is(err, auth.ErrCuentaInactiva):
		return httpx.Forbidden(auth.ErrCuentaInactiva.Error())
	}
	return err
}
