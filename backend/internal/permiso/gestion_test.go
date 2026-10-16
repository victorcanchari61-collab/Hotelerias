package permiso

import (
	"context"
	"errors"
	"testing"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/httpx"
)

func ptrAlcance(a Alcance) *Alcance { return &a }

func TestResolverAlcance(t *testing.T) {
	casos := []struct {
		nombre      string
		accesoTotal bool
		propio      *Alcance
		delRol      []Alcance
		quiere      Alcance
	}{
		{"acceso total no se restringe nunca", true, ptrAlcance(MisSedes), []Alcance{MisSedes}, TodasLasSedes},
		{"sin nada: no restringe", false, nil, nil, TodasLasSedes},
		{"un rol que limita", false, nil, []Alcance{MisSedes}, MisSedes},
		{"lo de la persona manda sobre el rol (ensancha)", false, ptrAlcance(TodasLasSedes), []Alcance{MisSedes}, TodasLasSedes},
		{"lo de la persona manda sobre el rol (limita)", false, ptrAlcance(MisSedes), []Alcance{TodasLasSedes}, MisSedes},
		{"con varios roles gana el más amplio", false, nil, []Alcance{MisSedes, TodasLasSedes}, TodasLasSedes},
		{"varios roles, todos limitan", false, nil, []Alcance{MisSedes, MisSedes}, MisSedes},
	}
	for _, tc := range casos {
		t.Run(tc.nombre, func(t *testing.T) {
			if got := ResolverAlcance(tc.accesoTotal, tc.propio, tc.delRol); got != tc.quiere {
				t.Fatalf("got %s, quería %s", got, tc.quiere)
			}
		})
	}
}

// --- gestión con un almacén en memoria ---

type storeFalso struct {
	creadas   []ExcepcionNueva
	revocadas []int64
	rolGuard  map[string]Alcance
	usrGuard  map[string]Alcance
	aprobadas []Vigencia
	existe    map[int64]bool
}

func (s *storeFalso) Excepciones(context.Context, int64) ([]ExcepcionDetalle, error) { return nil, nil }
func (s *storeFalso) CrearExcepcion(_ context.Context, n ExcepcionNueva) (ExcepcionDetalle, error) {
	s.creadas = append(s.creadas, n)
	return ExcepcionDetalle{ID: int64(len(s.creadas)), UsuarioID: n.UsuarioID}, nil
}
func (s *storeFalso) Revocar(_ context.Context, id int64) (bool, error) {
	if !s.existe[id] {
		return false, nil
	}
	s.revocadas = append(s.revocadas, id)
	return true, nil
}
func (s *storeFalso) CrearSolicitud(_ context.Context, n SolicitudNueva) (Solicitud, error) {
	return Solicitud{ID: 1, UsuarioID: n.UsuarioID, Submodulo: n.Clave.Submodulo, Accion: string(n.Clave.Accion), Estado: Pendiente}, nil
}
func (s *storeFalso) SolicitudesDe(context.Context, int64) ([]Solicitud, error) { return nil, nil }
func (s *storeFalso) Bandeja(context.Context, bool) ([]Solicitud, error)        { return nil, nil }
func (s *storeFalso) Aprobar(_ context.Context, id, _ int64, v Vigencia, _ *time.Time, _ string) (Solicitud, error) {
	s.aprobadas = append(s.aprobadas, v)
	return Solicitud{ID: id, Estado: Aprobada}, nil
}
func (s *storeFalso) Rechazar(_ context.Context, id, _ int64, _ string) (Solicitud, error) {
	return Solicitud{ID: id, Estado: Rechazada}, nil
}
func (s *storeFalso) AlcancesDeRol(context.Context, int64) (map[string]Alcance, error) {
	return nil, nil
}
func (s *storeFalso) GuardarAlcancesRol(_ context.Context, _ int64, a map[string]Alcance) error {
	s.rolGuard = a
	return nil
}
func (s *storeFalso) AlcancesDeUsuario(context.Context, int64) (map[string]Alcance, error) {
	return map[string]Alcance{}, nil
}
func (s *storeFalso) GuardarAlcancesUsuario(_ context.Context, _ int64, a map[string]Alcance, _ int64) error {
	s.usrGuard = a
	return nil
}
func (s *storeFalso) AlcancesDeRoles(context.Context, []int64, string) (map[int64]Alcance, error) {
	return map[int64]Alcance{}, nil
}
func (s *storeFalso) SedesDe(context.Context, int64) ([]int64, error) { return []int64{1, 2}, nil }

type usuariosFalsos struct{ r RolesDeUsuario }

func (u usuariosFalsos) RolesDe(context.Context, int64) (RolesDeUsuario, error) { return u.r, nil }

func armarGestion() (*Gestion, *storeFalso) {
	st := &storeFalso{existe: map[int64]bool{5: true}}
	g := NewGestion(st, Permisos, usuariosFalsos{RolesDeUsuario{RolIDs: []int64{2}}}, auditoria.Nop{})
	g.now = func() time.Time { return time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC) }
	return g, st
}

func esValidacion(err error) bool {
	var v httpx.Validacion
	return errors.As(err, &v)
}

func TestConceder(t *testing.T) {
	g, st := armarGestion()
	ctx := context.Background()
	futuro := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	pasado := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	clave := Clave{Submodulo: "reservas.reservas", Accion: Anular}

	malas := map[string]ExcepcionNueva{
		"acción que el submódulo no admite": {UsuarioID: 3, Clave: Clave{Submodulo: "reservas.reservas", Accion: "volar"}, Vigencia: Permanente},
		"submódulo inexistente":             {UsuarioID: 3, Clave: Clave{Submodulo: "no.existe", Accion: Ver}, Vigencia: Permanente},
		"temporal sin fecha":                {UsuarioID: 3, Clave: clave, Vigencia: Temporal},
		"temporal vencido":                  {UsuarioID: 3, Clave: clave, Vigencia: Temporal, ExpiraEn: &pasado},
		"vigencia desconocida":              {UsuarioID: 3, Clave: clave, Vigencia: "siempre"},
	}
	for nombre, n := range malas {
		if _, err := g.Conceder(ctx, n); !esValidacion(err) {
			t.Errorf("%s: err=%v", nombre, err)
		}
	}
	if len(st.creadas) != 0 {
		t.Fatalf("se creó algo inválido: %+v", st.creadas)
	}

	// Una vez: la fecha no significa nada y no se guarda.
	if _, err := g.Conceder(ctx, ExcepcionNueva{UsuarioID: 3, Clave: clave, Vigencia: UnaVez, ExpiraEn: &futuro}); err != nil {
		t.Fatal(err)
	}
	if st.creadas[0].ExpiraEn != nil {
		t.Fatal("una excepción de un solo uso no debe guardar vencimiento")
	}

	if _, err := g.Conceder(ctx, ExcepcionNueva{UsuarioID: 3, Clave: clave, Vigencia: Temporal, ExpiraEn: &futuro}); err != nil {
		t.Fatal(err)
	}
	if st.creadas[1].ExpiraEn == nil {
		t.Fatal("una temporal debe conservar su vencimiento")
	}
}

func TestRevocarInexistente(t *testing.T) {
	g, st := armarGestion()
	if err := g.Revocar(context.Background(), 99, 1); !errors.Is(err, ErrExcepcionNoEncontrada) {
		t.Fatalf("err=%v", err)
	}
	if err := g.Revocar(context.Background(), 5, 1); err != nil {
		t.Fatal(err)
	}
	if len(st.revocadas) != 1 {
		t.Fatalf("%v", st.revocadas)
	}
}

func TestSolicitarValidaContraElCatalogo(t *testing.T) {
	g, _ := armarGestion()
	_, err := g.Solicitar(context.Background(), SolicitudNueva{UsuarioID: 3, Clave: Clave{Submodulo: "x.y", Accion: Ver}})
	if !esValidacion(err) {
		t.Fatalf("err=%v", err)
	}
	if _, err := g.Solicitar(context.Background(), SolicitudNueva{
		UsuarioID: 3, Clave: Clave{Submodulo: "reservas.reservas", Accion: Anular}, Motivo: "  la emití mal ",
	}); err != nil {
		t.Fatal(err)
	}
}

func TestAprobarTemporalNecesitaFecha(t *testing.T) {
	g, st := armarGestion()
	if _, err := g.Aprobar(context.Background(), 1, 9, Temporal, nil, ""); !esValidacion(err) {
		t.Fatalf("err=%v", err)
	}
	if len(st.aprobadas) != 0 {
		t.Fatal("aprobó sin cumplir la regla")
	}
	if _, err := g.Aprobar(context.Background(), 1, 9, Permanente, nil, "ok"); err != nil {
		t.Fatal(err)
	}
}

func TestLosAlcancesDeRolNoGuardanTodas(t *testing.T) {
	g, st := armarGestion()
	err := g.GuardarAlcancesRol(context.Background(), 2, map[string]Alcance{
		"reservas.reservas": TodasLasSedes,
	}, 9)
	if err != nil {
		t.Fatal(err)
	}
	if len(st.rolGuard) != 0 {
		t.Fatalf("'todas' es la ausencia de restricción y no se guarda en el rol: %v", st.rolGuard)
	}

	// En la persona SÍ: es una excepción que ensancha lo que su rol limita.
	_ = g.GuardarAlcancesUsuario(context.Background(), 3, map[string]Alcance{"reservas.reservas": TodasLasSedes}, 9)
	if st.usrGuard["reservas.reservas"] != TodasLasSedes {
		t.Fatalf("%v", st.usrGuard)
	}
}

func TestAlcancesRechazaLoQueNoExiste(t *testing.T) {
	g, _ := armarGestion()
	for nombre, a := range map[string]map[string]Alcance{
		"submódulo sin alcance": {"config.usuarios": MisSedes},
		"nivel inventado":       {"reservas.reservas": "mi_ruta"},
	} {
		if err := g.GuardarAlcancesRol(context.Background(), 2, a, 9); !esValidacion(err) {
			t.Errorf("%s: err=%v", nombre, err)
		}
	}
}

func TestSedesConMisSedes(t *testing.T) {
	g, st := armarGestion()
	st.usrGuard = nil

	// Un rol que limita → el filtro trae SOLO las sedes de la persona.
	g.store = &conRolLimitado{storeFalso: st}
	f, err := g.Sedes(context.Background(), 3, "reservas.reservas")
	if err != nil {
		t.Fatal(err)
	}
	if f.Todas || len(f.SedeIDs) != 2 {
		t.Fatalf("%+v", f)
	}
}

type conRolLimitado struct{ *storeFalso }

func (c *conRolLimitado) AlcancesDeRoles(context.Context, []int64, string) (map[int64]Alcance, error) {
	return map[int64]Alcance{2: MisSedes}, nil
}

func TestAccesoTotalVeTodasLasSedes(t *testing.T) {
	g, _ := armarGestion()
	g.usuarios = usuariosFalsos{RolesDeUsuario{RolIDs: []int64{1}, AccesoTotal: true}}
	f, err := g.Sedes(context.Background(), 1, "reservas.reservas")
	if err != nil || !f.Todas {
		t.Fatalf("%+v err=%v", f, err)
	}
}
