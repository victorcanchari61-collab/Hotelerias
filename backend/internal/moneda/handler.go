package moneda

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// Handler es el tipo de cambio para el personal (Finanzas).
type Handler struct {
	svc     *Servicio
	guardas httpx.Guardas
}

func NewHandler(svc *Servicio, g httpx.Guardas) *Handler { return &Handler{svc: svc, guardas: g} }

func (h *Handler) Register(r gin.IRouter) {
	r.GET("/tipo-cambio", httpx.Cadena(h.guardas.Ver, h.listar)...)
	r.POST("/tipo-cambio", httpx.Cadena(h.guardas.Crear, h.guardar)...)
}

type respuesta struct {
	Monedas   []Moneda     `json:"monedas"`
	Historial []TipoCambio `json:"historial"`
}

func (h *Handler) listar(c *gin.Context) {
	limite, _ := strconv.Atoi(c.Query("limite"))
	monedas, err := h.svc.Monedas(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		return
	}
	hist, err := h.svc.Historial(c.Request.Context(), c.Query("moneda"), limite)
	if err != nil {
		_ = c.Error(err)
		return
	}
	c.JSON(http.StatusOK, respuesta{Monedas: monedas, Historial: hist})
}

func (h *Handler) guardar(c *gin.Context) {
	var e Entrada
	if err := c.ShouldBindJSON(&e); err != nil {
		_ = c.Error(httpx.BadRequest("Datos inválidos"))
		return
	}
	t, err := h.svc.Guardar(c.Request.Context(), e, auth.UsuarioID(c))
	if err != nil {
		_ = c.Error(httpx.Traducir(err))
		return
	}
	c.JSON(http.StatusOK, t)
}
