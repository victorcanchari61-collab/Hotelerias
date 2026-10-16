package permiso

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/platform/httpx"
)

func init() { gin.SetMode(gin.TestMode) }

// --- fakes ---

type fakeAut struct {
	acceso Acceso
	err    error
	llamas int
}

func (f *fakeAut) AccesoDe(context.Context, int64) (Acceso, error) {
	f.llamas++
	return f.acceso, f.err
}

// fakeUso emula el gasto atómico: de dos que lo piden gana el primero.
type fakeUso struct {
	gastada  map[int64]bool
	reservas int
	sueltas  int
	errRes   error
}

func nuevoUso() *fakeUso { return &fakeUso{gastada: map[int64]bool{}} }

func (f *fakeUso) Reservar(_ context.Context, id int64) (bool, error) {
	f.reservas++
	if f.errRes != nil {
		return false, f.errRes
	}
	if f.gastada[id] {
		return false, nil
	}
	f.gastada[id] = true
	return true, nil
}

func (f *fakeUso) Liberar(_ context.Context, id int64) error {
	f.sueltas++
	delete(f.gastada, id)
	return nil
}

// montar arma un router con el usuario ya "autenticado" como usuarioID.
func montar(t *testing.T, usuarioID int64, rutas func(r *gin.Engine)) *gin.Engine {
	t.Helper()
	r := gin.New()
	r.Use(httpx.Recovery(), httpx.ErrorMiddleware())
	r.Use(func(c *gin.Context) {
		if usuarioID != 0 {
			c.Set("auth.usuarioID", usuarioID)
		}
		c.Next()
	})
	rutas(r)
	return r
}

func llamar(r *gin.Engine) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/x", nil))
	return w
}

func ok(c *gin.Context)  { c.Status(http.StatusNoContent) }
func mal(c *gin.Context) { c.JSON(http.StatusBadRequest, gin.H{"message": "validación"}) }

// --- Require ---

func TestRequirePermiteYNiega(t *testing.T) {
	anular := k("reservas.reservas", Anular)
	aut := &fakeAut{acceso: Acceso{DeRoles: rol(anular)}}
	g := NewGuard(Permisos, aut, nuevoUso())

	r := montar(t, 5, func(r *gin.Engine) {
		r.POST("/x", g.Require("reservas.reservas", Anular), ok)
	})
	if w := llamar(r); w.Code != http.StatusNoContent {
		t.Fatalf("con permiso: %d", w.Code)
	}

	aut.acceso = Acceso{} // sin permisos
	w := llamar(r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("sin permiso: %d", w.Code)
	}

	// El 403 debe traer QUÉ faltaba: de ahí abre el front el modal de pedirlo.
	var body denegado
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.StatusCode != 403 || body.Submodulo != "reservas.reservas" || body.Accion != "anular" || body.Message == "" {
		t.Fatalf("cuerpo del 403 incorrecto: %+v", body)
	}
}

func TestRequireSinSesionEs401(t *testing.T) {
	g := NewGuard(Permisos, &fakeAut{}, nuevoUso())
	r := montar(t, 0, func(r *gin.Engine) { r.POST("/x", g.Require("reservas.reservas", Ver), ok) })
	if w := llamar(r); w.Code != http.StatusUnauthorized {
		t.Fatalf("esperaba 401, fue %d", w.Code)
	}
}

func TestRequireErrorDeInfraEs500NoFailOpen(t *testing.T) {
	// Si la base falla NO se deja pasar: ante la duda, se niega.
	aut := &fakeAut{err: errors.New("postgres caído")}
	g := NewGuard(Permisos, aut, nuevoUso())
	llegó := false
	r := montar(t, 5, func(r *gin.Engine) {
		r.POST("/x", g.Require("reservas.reservas", Ver), func(c *gin.Context) { llegó = true; ok(c) })
	})
	w := llamar(r)
	if w.Code != http.StatusInternalServerError || llegó {
		t.Fatalf("code=%d handlerEjecutado=%v", w.Code, llegó)
	}
}

func TestRequirePanicSiElPermisoNoExiste(t *testing.T) {
	g := NewGuard(Permisos, &fakeAut{}, nuevoUso())
	casos := map[string]func(){
		"submódulo inexistente": func() { g.Require("no.existe", Ver) },
		"acción no admitida":    func() { g.Require("inventario.kardex", Anular) },
		"any vacío":             func() { g.RequireAny() },
		"any mal formado":       func() { g.RequireAny("sin-dos-puntos") },
		"any inexistente":       func() { g.RequireAny("inventario.stock:ver", "no.existe:ver") },
	}
	for nombre, f := range casos {
		t.Run(nombre, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("debía hacer pánico al registrar la ruta")
				}
			}()
			f()
		})
	}
}

// --- permiso de un solo uso ---

func TestUnaVezSeGastaSoloSiSaleBien(t *testing.T) {
	anular := k("reservas.reservas", Anular)
	acceso := Acceso{Excepciones: []Excepcion{{ID: 7, Clave: anular, Vigencia: UnaVez}}}

	casos := []struct {
		nombre  string
		handler gin.HandlerFunc
		gastado bool
	}{
		{"éxito la gasta", ok, true},
		{"validación 400 no la gasta", mal, false},
		{"error no controlado no la gasta", func(c *gin.Context) { _ = c.Error(errors.New("boom")) }, false},
		{"pánico no la gasta", func(c *gin.Context) { panic("boom") }, false},
		{"handler que aborta no la gasta", func(c *gin.Context) { c.AbortWithStatus(http.StatusConflict) }, false},
	}
	for _, tc := range casos {
		t.Run(tc.nombre, func(t *testing.T) {
			uso := nuevoUso()
			g := NewGuard(Permisos, &fakeAut{acceso: acceso}, uso)
			r := montar(t, 5, func(r *gin.Engine) { r.POST("/x", g.Require("reservas.reservas", Anular), tc.handler) })
			llamar(r)

			if got := uso.gastada[7]; got != tc.gastado {
				t.Fatalf("gastada=%v, esperaba %v", got, tc.gastado)
			}
			if uso.reservas != 1 {
				t.Fatalf("reservas=%d", uso.reservas)
			}
			if !tc.gastado && uso.sueltas != 1 {
				t.Fatalf("debía soltarla: sueltas=%d", uso.sueltas)
			}
		})
	}
}

func TestUnaVezCarreraLaSegundaPeticionPierde(t *testing.T) {
	anular := k("reservas.reservas", Anular)
	acceso := Acceso{Excepciones: []Excepcion{{ID: 7, Clave: anular, Vigencia: UnaVez}}}
	uso := nuevoUso()
	g := NewGuard(Permisos, &fakeAut{acceso: acceso}, uso)

	ejecuciones := 0
	r := montar(t, 5, func(r *gin.Engine) {
		r.POST("/x", g.Require("reservas.reservas", Anular), func(c *gin.Context) { ejecuciones++; ok(c) })
	})

	// Las dos peticiones resolvieron "permitido" con la misma excepción sin
	// gastar; la segunda llega a reservar cuando la primera ya la tomó.
	if w := llamar(r); w.Code != http.StatusNoContent {
		t.Fatalf("primera: %d", w.Code)
	}
	w := llamar(r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("segunda debía perder con 403, fue %d", w.Code)
	}
	if ejecuciones != 1 {
		t.Fatalf("la operación se ejecutó %d veces con un permiso de un solo uso", ejecuciones)
	}
}

func TestUnaVezDosGuardsEnLaMismaPeticionNoLaGastaDosVeces(t *testing.T) {
	anular := k("reservas.reservas", Anular)
	acceso := Acceso{Excepciones: []Excepcion{{ID: 7, Clave: anular, Vigencia: UnaVez}}}
	uso := nuevoUso()
	aut := &fakeAut{acceso: acceso}
	g := NewGuard(Permisos, aut, uso)

	r := montar(t, 5, func(r *gin.Engine) {
		grupo := r.Group("", g.Require("reservas.reservas", Anular)) // guard de grupo
		grupo.POST("/x", g.Require("reservas.reservas", Anular), ok) // y el del endpoint
	})
	if w := llamar(r); w.Code != http.StatusNoContent {
		t.Fatalf("code=%d", w.Code)
	}
	if uso.reservas != 1 {
		t.Fatalf("reservas=%d, esperaba 1", uso.reservas)
	}
	if aut.llamas != 1 {
		t.Fatalf("el acceso se cargó %d veces en una petición", aut.llamas)
	}
}

func TestRolCubreNoGastaLaDeUnaVez(t *testing.T) {
	anular := k("reservas.reservas", Anular)
	uso := nuevoUso()
	g := NewGuard(Permisos, &fakeAut{acceso: Acceso{
		DeRoles:     rol(anular),
		Excepciones: []Excepcion{{ID: 7, Clave: anular, Vigencia: UnaVez}},
	}}, uso)
	r := montar(t, 5, func(r *gin.Engine) { r.POST("/x", g.Require("reservas.reservas", Anular), ok) })

	if w := llamar(r); w.Code != http.StatusNoContent {
		t.Fatalf("code=%d", w.Code)
	}
	if uso.reservas != 0 {
		t.Fatal("no debía tocarse la excepción: el rol ya lo cubría")
	}
}

func TestReservarConErrorDeInfraNoDejaPasar(t *testing.T) {
	anular := k("reservas.reservas", Anular)
	uso := nuevoUso()
	uso.errRes = errors.New("postgres caído")
	g := NewGuard(Permisos, &fakeAut{acceso: Acceso{
		Excepciones: []Excepcion{{ID: 7, Clave: anular, Vigencia: UnaVez}},
	}}, uso)

	llegó := false
	r := montar(t, 5, func(r *gin.Engine) {
		r.POST("/x", g.Require("reservas.reservas", Anular), func(c *gin.Context) { llegó = true; ok(c) })
	})
	if w := llamar(r); w.Code != http.StatusInternalServerError || llegó {
		t.Fatalf("code=%d handlerEjecutado=%v", w.Code, llegó)
	}
}

// --- RequireAny ---

func TestRequireAny(t *testing.T) {
	uso := nuevoUso()
	aut := &fakeAut{}
	g := NewGuard(Permisos, aut, uso)
	r := montar(t, 5, func(r *gin.Engine) {
		r.POST("/x", g.RequireAny("inventario.stock:ver", "restaurantes.comandas:ver"), ok)
	})

	aut.acceso = Acceso{DeRoles: rol(k("restaurantes.comandas", Ver))} // tiene la segunda
	if w := llamar(r); w.Code != http.StatusNoContent {
		t.Fatalf("con la segunda: %d", w.Code)
	}

	aut.acceso = Acceso{}
	w := llamar(r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("sin ninguna: %d", w.Code)
	}
	var body denegado
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Submodulo != "inventario.stock" || body.Accion != "ver" {
		t.Fatalf("debe pedir la PRIMERA de la lista: %+v", body)
	}
}

func TestRequireAnyNoGastaExcepcionesDeUnaVez(t *testing.T) {
	uso := nuevoUso()
	g := NewGuard(Permisos, &fakeAut{acceso: Acceso{Excepciones: []Excepcion{
		{ID: 7, Clave: k("inventario.stock", Ver), Vigencia: UnaVez},
	}}}, uso)
	r := montar(t, 5, func(r *gin.Engine) { r.POST("/x", g.RequireAny("inventario.stock:ver"), ok) })

	if w := llamar(r); w.Code != http.StatusNoContent {
		t.Fatalf("code=%d", w.Code)
	}
	if uso.reservas != 0 || uso.gastada[7] {
		t.Fatal("mirar no debe quemar el permiso de un solo uso")
	}
}

// El reloj del guard es inyectable: lo vencido se evalúa contra "ahora", no
// contra cuando se armó el acceso.
func TestRequireUsaElRelojDelGuard(t *testing.T) {
	anular := k("reservas.reservas", Anular)
	exp := ahora.Add(time.Hour)
	g := NewGuard(Permisos, &fakeAut{acceso: Acceso{Excepciones: []Excepcion{
		{ID: 1, Clave: anular, Vigencia: Temporal, ExpiraEn: &exp},
	}}}, nuevoUso())
	r := montar(t, 5, func(r *gin.Engine) { r.POST("/x", g.Require("reservas.reservas", Anular), ok) })

	g.now = func() time.Time { return ahora }
	if w := llamar(r); w.Code != http.StatusNoContent {
		t.Fatalf("antes de vencer: %d", w.Code)
	}
	g.now = func() time.Time { return ahora.Add(2 * time.Hour) }
	if w := llamar(r); w.Code != http.StatusForbidden {
		t.Fatalf("después de vencer: %d", w.Code)
	}
}
