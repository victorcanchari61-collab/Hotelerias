package permiso

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// Autorizador es lo que el Guard necesita para conocer el acceso de alguien.
type Autorizador interface {
	AccesoDe(ctx context.Context, usuarioID int64) (Acceso, error)
}

// UsoUnico es lo que el Guard necesita para gastar una excepción de un solo uso.
type UsoUnico interface {
	Reservar(ctx context.Context, id int64) (bool, error)
	Liberar(ctx context.Context, id int64) error
}

const (
	accesoKey    = "permiso.acceso"
	reservadoKey = "permiso.reservados"
)

// Guard protege rutas exigiendo permisos. Se declara en la ruta, no dentro del
// handler:
//
//	g.POST("/notasventa", guard.Require("fact.notaventa", permiso.Anular), h.Anular)
//
// Reemplaza al [Authorize(Roles = "Administrador")] a mano: aquello ataba el
// permiso al nombre de un rol, así que crear uno nuevo no servía de nada.
type Guard struct {
	catalogo *Catalogo
	aut      Autorizador
	uso      UsoUnico
	now      func() time.Time
}

func NewGuard(cat *Catalogo, aut Autorizador, uso UsoUnico) *Guard {
	return &Guard{catalogo: cat, aut: aut, uso: uso, now: time.Now}
}

// denegado es el 403 del filtro. Lleva QUÉ se pidió, no solo que se negó: con
// eso el front abre el modal para solicitar ese permiso exacto a un admin, en
// vez de un "no autorizado" del que nadie puede hacer nada.
type denegado struct {
	StatusCode int    `json:"statusCode"`
	Message    string `json:"message"`
	Submodulo  string `json:"submodulo"`
	Accion     string `json:"accion"`
}

func (g *Guard) denegar(c *gin.Context, cl Clave) {
	c.AbortWithStatusJSON(http.StatusForbidden, denegado{
		StatusCode: http.StatusForbidden,
		Message:    "No tienes permiso para esta acción.",
		Submodulo:  cl.Submodulo,
		Accion:     string(cl.Accion),
	})
}

// acceso carga el Acceso una sola vez por petición: dos guards en la misma
// ruta (el del grupo y el del endpoint) no repiten las consultas.
func (g *Guard) acceso(c *gin.Context, usuarioID int64) (Acceso, error) {
	if v, ok := c.Get(accesoKey); ok {
		return v.(Acceso), nil
	}
	a, err := g.aut.AccesoDe(c.Request.Context(), usuarioID)
	if err != nil {
		return Acceso{}, err
	}
	c.Set(accesoKey, a)
	return a, nil
}

// Require exige submodulo:accion. Si el permiso no existe en el catálogo
// entra en pánico al registrar la ruta: un permiso mal escrito no debe
// descubrirse en producción como un 403 que nadie puede arreglar.
func (g *Guard) Require(submodulo string, accion Accion) gin.HandlerFunc {
	cl := Clave{Submodulo: submodulo, Accion: accion}
	g.mustValid(cl)

	return func(c *gin.Context) {
		usuarioID := auth.UsuarioID(c)
		if usuarioID == 0 {
			httpx.Abort(c, http.StatusUnauthorized, "Debes iniciar sesión.")
			return
		}

		acceso, err := g.acceso(c, usuarioID)
		if err != nil {
			_ = c.Error(err)
			c.Abort()
			return
		}

		v := acceso.Resolver(cl, g.now())
		if !v.Permitido {
			g.denegar(c, cl)
			return
		}
		if !v.Gasta() {
			c.Next()
			return
		}
		g.conPermisoUnico(c, cl, v.GastarID)
	}
}

// conPermisoUnico ejecuta la operación gastando una excepción de un solo uso.
//
// Se RESERVA antes y se SUELTA si la operación falla, en vez de gastar al
// final: así dos peticiones en paralelo con el mismo permiso no entran las
// dos (gana la que lo reserva), y si el proceso muere a medias el permiso
// queda gastado — falla del lado seguro. Quien pidió "anular esta nota" y se
// topa con un error de validación no se queda sin el permiso por algo que
// nunca llegó a hacer.
func (g *Guard) conPermisoUnico(c *gin.Context, cl Clave, id int64) {
	reservados, _ := c.Get(reservadoKey)
	mapa, _ := reservados.(map[int64]bool)
	if mapa == nil {
		mapa = map[int64]bool{}
		c.Set(reservadoKey, mapa)
	}

	// Ya reservado por otro guard de esta misma petición: no se gasta dos veces.
	if mapa[id] {
		c.Next()
		return
	}

	ok, err := g.uso.Reservar(c.Request.Context(), id)
	if err != nil {
		_ = c.Error(err)
		c.Abort()
		return
	}
	if !ok {
		// Otra petición se lo llevó entre que se resolvió y se reservó.
		g.denegar(c, cl)
		return
	}
	mapa[id] = true

	exito := false
	defer func() {
		if exito {
			return
		}
		// Falló o hubo pánico: se devuelve. Contexto propio, porque el de la
		// petición puede estar ya cancelado justo cuando más hace falta.
		ctx, cancel := context.WithTimeout(context.WithoutCancel(c.Request.Context()), 5*time.Second)
		defer cancel()
		if err := g.uso.Liberar(ctx, id); err != nil {
			log.Printf("permiso: no se pudo liberar la excepción %d: %v", id, err)
		}
	}()

	c.Next()

	// Una excepción sin manejar deja c.Errors y el middleware la convertirá en
	// un 500: tampoco cuenta como usado.
	exito = c.Writer.Status() < 400 && len(c.Errors) == 0 && !c.IsAborted()
}

// RequireAny deja entrar a quien tenga CUALQUIERA de los permisos
// ("submodulo:accion"). Existe para las consultas que varias pantallas
// necesitan de otro módulo: quien toma un pedido tiene que ver el stock, y
// darle Inventario entero le abriría los costos y los ajustes.
//
// Solo para lecturas: no gasta excepciones de un solo uso — mirar cuánto hay
// no debe quemar el permiso que alguien pidió para anular algo. En el 403 se
// pide el primero de la lista, que es el natural para esa consulta.
func (g *Guard) RequireAny(claves ...string) gin.HandlerFunc {
	if len(claves) == 0 {
		panic("permiso: RequireAny necesita al menos una clave")
	}
	cls := make([]Clave, len(claves))
	for i, s := range claves {
		cl, err := ParseClave(s)
		if err != nil {
			panic(err)
		}
		g.mustValid(cl)
		cls[i] = cl
	}

	return func(c *gin.Context) {
		usuarioID := auth.UsuarioID(c)
		if usuarioID == 0 {
			httpx.Abort(c, http.StatusUnauthorized, "Debes iniciar sesión.")
			return
		}

		acceso, err := g.acceso(c, usuarioID)
		if err != nil {
			_ = c.Error(err)
			c.Abort()
			return
		}

		ahora := g.now()
		for _, cl := range cls {
			if acceso.Resolver(cl, ahora).Permitido {
				c.Next()
				return
			}
		}
		g.denegar(c, cls[0])
	}
}

func (g *Guard) mustValid(cl Clave) {
	if !g.catalogo.EsValido(cl) {
		panic(fmt.Sprintf("permiso: %q no está en el catálogo (submódulo inexistente o acción que no admite)", cl))
	}
}
