package cliente

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// AdminHandler es lo que usa el personal: clasificar huéspedes y definir los
// tipos de cliente. Los tipos no se borran (los huéspedes los referencian): se
// desactivan.
type AdminHandler struct {
	svc      *Servicio
	clientes httpx.Guardas
	tipos    httpx.Guardas
}

func NewAdminHandler(svc *Servicio, clientes, tipos httpx.Guardas) *AdminHandler {
	return &AdminHandler{svc: svc, clientes: clientes, tipos: tipos}
}

func (h *AdminHandler) Register(r gin.IRouter) {
	r.GET("/cliente", httpx.Cadena(h.clientes.Ver, h.listar)...)
	r.PUT("/cliente/:id/tipo", httpx.Cadena(h.clientes.Editar, h.asignarTipo)...)

	r.GET("/tipo-cliente", httpx.Cadena(h.tipos.Ver, h.listarTipos)...)
	r.POST("/tipo-cliente", httpx.Cadena(h.tipos.Crear, h.crearTipo)...)
	r.PUT("/tipo-cliente/:id", httpx.Cadena(h.tipos.Editar, h.actualizarTipo)...)
}

func (h *AdminHandler) listar(c *gin.Context) {
	out, err := h.svc.Listar(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, out)
}

type asignarRequest struct {
	// null = volver a la clasificación automática.
	TipoClienteID *int64 `json:"tipoClienteId"`
}

func (h *AdminHandler) asignarTipo(c *gin.Context) {
	id, ok := idDe(c)
	if !ok {
		return
	}
	var req asignarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.svc.AsignarTipo(c.Request.Context(), id, req.TipoClienteID)
	if err != nil {
		_ = c.Error(Traducir(err))
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *AdminHandler) listarTipos(c *gin.Context) {
	out, err := h.svc.Tipos(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *AdminHandler) crearTipo(c *gin.Context) {
	var t Tipo
	if err := c.ShouldBindJSON(&t); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	t.ID = 0
	out, err := h.svc.CrearTipo(c.Request.Context(), t)
	if err != nil {
		_ = c.Error(Traducir(err))
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (h *AdminHandler) actualizarTipo(c *gin.Context) {
	id, ok := idDe(c)
	if !ok {
		return
	}
	var t Tipo
	if err := c.ShouldBindJSON(&t); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	t.ID = id
	out, err := h.svc.ActualizarTipo(c.Request.Context(), t)
	if err != nil {
		_ = c.Error(Traducir(err))
		return
	}
	c.JSON(http.StatusOK, out)
}

func idDe(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return 0, false
	}
	return id, true
}

// Traducir pasa un error de este paquete (o del login compartido) a su
// respuesta HTTP. Lo que no se reconoce sigue como error sin tipo: el
// middleware lo vuelve un 500 sin filtrar el detalle.
func Traducir(err error) error {
	var v httpx.Validacion
	switch {
	case errors.As(err, &v):
		return httpx.BadRequest(v.Error())
	case errors.Is(err, ErrNoEncontrado):
		return httpx.NotFound("El huésped no existe")
	case errors.Is(err, ErrEmailUsado):
		return httpx.Conflict("Ya existe una cuenta con ese correo. Inicia sesión.")
	case errors.Is(err, ErrTipoUsado):
		return httpx.Conflict("Ya existe un tipo de cliente con ese nombre")
	case errors.Is(err, ErrTipoInvalido):
		return httpx.BadRequest("El tipo de cliente no existe o está desactivado")
	case errors.Is(err, auth.ErrCredenciales):
		return httpx.Unauthorized(auth.ErrCredenciales.Error())
	case errors.Is(err, auth.ErrSesionInvalida):
		return httpx.Unauthorized(auth.ErrSesionInvalida.Error())
	case errors.Is(err, auth.ErrCuentaInactiva):
		return httpx.Forbidden(auth.ErrCuentaInactiva.Error())
	case errors.Is(err, auth.ErrDemasiadosIntentos):
		return httpx.TooManyRequests(auth.ErrDemasiadosIntentos.Error())
	}
	return err
}
