package reserva

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/hotel"
	"hotelerias/backend/internal/platform/httpx"
)

// AdminHandler es lo que usa el personal para ver y anular reservas.
type AdminHandler struct {
	svc     *Servicio
	guardas httpx.Guardas
}

func NewAdminHandler(svc *Servicio, g httpx.Guardas) *AdminHandler {
	return &AdminHandler{svc: svc, guardas: g}
}

func (h *AdminHandler) Register(r gin.IRouter) {
	r.GET("/reserva", httpx.Cadena(h.guardas.Ver, h.listar)...)
	r.POST("/reserva/:id/cancelar", httpx.Cadena(h.guardas.Anular, h.cancelar)...)
}

func (h *AdminHandler) listar(c *gin.Context) {
	out, err := h.svc.Listar(c.Request.Context(), Estado(c.Query("estado")))
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
	r, err := h.svc.CancelarPorPersonal(c.Request.Context(), id)
	if err != nil {
		_ = c.Error(Traducir(err))
		return
	}
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
