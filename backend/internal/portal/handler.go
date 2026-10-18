// Package portal es la capa HTTP de lo que ve y usa el huésped en la web
// pública: mirar hoteles y precios, entrar a su cuenta y reservar.
//
// No tiene reglas de negocio: traduce HTTP a las llamadas de hotel, promocion,
// cliente y reserva. Reservar exige haber iniciado sesión; mirar y cotizar no.
package portal

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/cliente"
	"hotelerias/backend/internal/hotel"
	"hotelerias/backend/internal/moneda"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/promocion"
	"hotelerias/backend/internal/reserva"
)

// Lo que el portal consume de cada módulo (interfaces pequeñas, del lado de quien usa).

type Hoteles interface {
	Sedes(ctx context.Context) ([]hotel.Sede, error)
	Sede(ctx context.Context, id int64) (hotel.Sede, []hotel.TipoHabitacion, error)
	Disponibilidad(ctx context.Context, sedeID int64, entrada, salida fecha.Fecha, huespedes int) ([]hotel.Disponible, error)
}

type Ofertas interface {
	Publicas(ctx context.Context, tipoClienteID *int64) ([]promocion.Promocion, error)
}

type Cuentas interface {
	Registrar(ctx context.Context, r cliente.Registro) (cliente.Sesion, error)
	Login(ctx context.Context, origen, email, password string) (cliente.Sesion, error)
	Perfil(ctx context.Context, id int64) (cliente.Cliente, error)
}

// Monedas son las monedas que se ofrecen y el tipo de cambio de hoy.
type Monedas interface {
	Publico(ctx context.Context) (moneda.Publico, error)
}

// Publicos son los parámetros que la web puede mostrar (horarios).
type Publicos interface {
	Publicos(ctx context.Context) map[string]string
}

type Reservas interface {
	Cotizar(ctx context.Context, clienteID int64, sol reserva.Solicitud) (reserva.Cotizacion, error)
	Reservar(ctx context.Context, clienteID int64, sol reserva.Solicitud) (reserva.Reserva, error)
	DeCliente(ctx context.Context, clienteID int64) ([]reserva.Reserva, error)
	Cancelar(ctx context.Context, clienteID int64, codigo string) (reserva.Reserva, error)
}

// Handler monta /api/portal/*.
type Handler struct {
	hoteles  Hoteles
	ofertas  Ofertas
	cuentas  Cuentas
	reservas Reservas
	monedas  Monedas
	params   Publicos
	hoy      func() fecha.Fecha

	// opcional anota al huésped si trae sesión, sin exigirla.
	opcional gin.HandlerFunc
	// altas frena el alta masiva de cuentas desde una misma IP.
	altas *auth.Limitador
}

func NewHandler(h Hoteles, o Ofertas, c Cuentas, r Reservas, m Monedas, hoy func() fecha.Fecha, opcional gin.HandlerFunc) *Handler {
	return &Handler{
		hoteles: h, ofertas: o, cuentas: c, reservas: r, monedas: m, hoy: hoy, opcional: opcional,
		// Cada alta cuesta un bcrypt: sin tope, es una forma barata de tumbar el servidor.
		altas: auth.NuevoLimitador(10, time.Hour),
	}
}

// ConParametros expone los parámetros públicos en /portal/parametros.
func (h *Handler) ConParametros(p Publicos) *Handler {
	h.params = p
	return h
}

type modulo func(r gin.IRouter)

func (m modulo) Register(r gin.IRouter) { m(r) }

// Publico monta lo que no exige sesión (algunas rutas la aprovechan si existe).
func (h *Handler) Publico() interface{ Register(gin.IRouter) } {
	return modulo(func(r gin.IRouter) {
		r.GET("/portal/sedes", h.sedes)
		r.GET("/portal/monedas", h.listarMonedas)
		r.GET("/portal/parametros", h.parametros)
		r.GET("/portal/sedes/:id", h.sede)
		r.GET("/portal/sedes/:id/disponibilidad", h.disponibilidad)
		r.POST("/portal/registro", h.registro)
		r.POST("/portal/login", h.login)

		r.GET("/portal/promociones", h.opcional, h.promociones)
		r.POST("/portal/cotizar", h.opcional, h.cotizar)
	})
}

// ConSesion monta lo que SOLO puede usar un huésped con sesión.
func (h *Handler) ConSesion() interface{ Register(gin.IRouter) } {
	return modulo(func(r gin.IRouter) {
		r.GET("/portal/me", h.me)
		r.POST("/portal/reservas", h.reservar)
		r.GET("/portal/reservas", h.misReservas)
		r.POST("/portal/reservas/:codigo/cancelar", h.cancelar)
	})
}

func fail(c *gin.Context, err error) {
	_ = c.Error(reserva.Traducir(cliente.Traducir(err)))
}

func (h *Handler) sedes(c *gin.Context) {
	out, err := h.hoteles.Sedes(c.Request.Context())
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// parametros: solo los que la web puede mostrar. Sin parámetros configurados, vacío.
func (h *Handler) parametros(c *gin.Context) {
	out := map[string]string{}
	if h.params != nil {
		out = h.params.Publicos(c.Request.Context())
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) listarMonedas(c *gin.Context) {
	out, err := h.monedas.Publico(c.Request.Context())
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func idParam(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		_ = c.Error(httpx.BadRequest("Identificador inválido"))
		return 0, false
	}
	return id, true
}

func (h *Handler) sede(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	sede, tipos, err := h.hoteles.Sede(c.Request.Context(), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"sede": sede, "habitaciones": tipos})
}

func (h *Handler) disponibilidad(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	entrada, err1 := fecha.Parse(c.Query("entrada"))
	salida, err2 := fecha.Parse(c.Query("salida"))
	huespedes, err3 := strconv.Atoi(c.DefaultQuery("huespedes", "1"))
	if err1 != nil || err2 != nil || err3 != nil {
		_ = c.Error(httpx.BadRequest("Indica entrada y salida (AAAA-MM-DD) y la cantidad de huéspedes"))
		return
	}

	out, err := h.hoteles.Disponibilidad(c.Request.Context(), id, entrada, salida, huespedes)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) promociones(c *gin.Context) {
	// El visitante ve las abiertas a todos; el huésped, además las de su tipo.
	var tipo *int64
	if id := auth.ClienteID(c); id != 0 {
		if perfil, err := h.cuentas.Perfil(c.Request.Context(), id); err == nil {
			tipo = perfil.TipoClienteID
		}
	}
	out, err := h.ofertas.Publicas(c.Request.Context(), tipo)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) cotizar(c *gin.Context) {
	var sol reserva.Solicitud
	if err := c.ShouldBindJSON(&sol); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.reservas.Cotizar(c.Request.Context(), auth.ClienteID(c), sol)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) registro(c *gin.Context) {
	var req cliente.Registro
	if err := c.ShouldBindJSON(&req); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	clave := c.ClientIP()
	if !h.altas.Permitir(clave) {
		_ = c.Error(httpx.TooManyRequests("Demasiados registros desde tu conexión. Intenta más tarde."))
		return
	}
	h.altas.Fallo(clave) // cada intento cuenta, salga bien o mal

	sesion, err := h.cuentas.Registrar(c.Request.Context(), req)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, sesion)
}

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
	sesion, err := h.cuentas.Login(c.Request.Context(), c.ClientIP(), req.Email, req.Password)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, sesion)
}

func (h *Handler) me(c *gin.Context) {
	perfil, err := h.cuentas.Perfil(c.Request.Context(), auth.ClienteID(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, perfil)
}

func (h *Handler) reservar(c *gin.Context) {
	var sol reserva.Solicitud
	if err := c.ShouldBindJSON(&sol); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	out, err := h.reservas.Reservar(c.Request.Context(), auth.ClienteID(c), sol)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (h *Handler) misReservas(c *gin.Context) {
	out, err := h.reservas.DeCliente(c.Request.Context(), auth.ClienteID(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) cancelar(c *gin.Context) {
	out, err := h.reservas.Cancelar(c.Request.Context(), auth.ClienteID(c), c.Param("codigo"))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
