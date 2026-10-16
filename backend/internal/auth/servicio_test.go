package auth

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
	"hotelerias/backend/internal/usuario"
)

// --- dobles ---

type cuentasFake struct {
	porEmail map[string]usuario.Cuenta // clave: correo en minúsculas
	err      error
	llamadas int
}

func (f *cuentasFake) PorEmail(_ context.Context, email string) (usuario.Cuenta, error) {
	f.llamadas++
	if f.err != nil {
		return usuario.Cuenta{}, f.err
	}
	c, ok := f.porEmail[strings.ToLower(email)]
	if !ok {
		return usuario.Cuenta{}, usuario.ErrNoEncontrada
	}
	return c, nil
}

func (f *cuentasFake) PorID(_ context.Context, id int64) (usuario.Cuenta, error) {
	if f.err != nil {
		return usuario.Cuenta{}, f.err
	}
	for _, c := range f.porEmail {
		if c.ID == id {
			return c, nil
		}
	}
	return usuario.Cuenta{}, usuario.ErrNoEncontrada
}

// hasherContador es bcrypt de verdad (costo mínimo) que cuenta las comparaciones.
type hasherContador struct {
	Bcrypt
	comparaciones int
}

func (h *hasherContador) Comparar(hash, plain string) error {
	h.comparaciones++
	return h.Bcrypt.Comparar(hash, plain)
}

type emisorFake struct{ err error }

func (e emisorFake) Emitir(id int64) (string, error) {
	if e.err != nil {
		return "", e.err
	}
	return "token-de-" + string(rune('0'+id)), nil
}

const claveCorrecta = "una-clave-larga-y-buena"

type banco struct {
	svc     *Servicio
	cuentas *cuentasFake
	hasher  *hasherContador
	reloj   *time.Time
}

func nuevoBanco(t *testing.T) *banco {
	t.Helper()
	h := &hasherContador{Bcrypt: Bcrypt{Cost: bcrypt.MinCost}}
	hash, err := h.Hash(claveCorrecta)
	if err != nil {
		t.Fatal(err)
	}

	rol := int64(1)
	cuentas := &cuentasFake{porEmail: map[string]usuario.Cuenta{
		"ana@hotel.pe": {
			ID: 1, Nombre: "Ana", Apellido: "Pérez", Email: "Ana@Hotel.pe", Activo: true,
			RolID: &rol, RolNombre: "Administrador", PasswordHash: hash,
		},
		"baja@hotel.pe":     {ID: 2, Nombre: "Baja", Email: "baja@hotel.pe", Activo: false, PasswordHash: hash},
		"sinclave@hotel.pe": {ID: 3, Nombre: "Sin clave", Email: "sinclave@hotel.pe", Activo: true, PasswordHash: ""},
	}}

	ahora := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	lim := NuevoLimitador(5, 15*time.Minute)
	lim.now = func() time.Time { return ahora }

	svc, err := NewServicio(cuentas, h, emisorFake{}, lim)
	if err != nil {
		t.Fatal(err)
	}
	return &banco{svc: svc, cuentas: cuentas, hasher: h, reloj: &ahora}
}

func (b *banco) login(email, pass string) (Sesion, error) {
	return b.svc.Login(context.Background(), "10.0.0.1", email, pass)
}

// --- login ---

func TestLoginCorrecto(t *testing.T) {
	b := nuevoBanco(t)
	s, err := b.login("ana@hotel.pe", claveCorrecta)
	if err != nil {
		t.Fatal(err)
	}
	if s.Token != "token-de-1" || s.Usuario.ID != 1 || s.Usuario.RolNombre != "Administrador" {
		t.Fatalf("sesión inesperada: %+v", s)
	}
}

func TestLoginNoFiltraElHash(t *testing.T) {
	b := nuevoBanco(t)
	s, _ := b.login("ana@hotel.pe", claveCorrecta)

	raw, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	hash := b.cuentas.porEmail["ana@hotel.pe"].PasswordHash
	if strings.Contains(string(raw), hash) || strings.Contains(strings.ToLower(string(raw)), "hash") ||
		strings.Contains(strings.ToLower(string(raw)), "password") {
		t.Fatalf("la respuesta expone la clave o su hash: %s", raw)
	}
}

func TestLoginIgnoraMayusculasYEspaciosDelCorreo(t *testing.T) {
	b := nuevoBanco(t)
	if _, err := b.login("  ANA@Hotel.PE  ", claveCorrecta); err != nil {
		t.Fatalf("debía entrar: %v", err)
	}
}

func TestMalaClaveYCorreoInexistenteDanElMismoError(t *testing.T) {
	b := nuevoBanco(t)
	_, errClave := b.login("ana@hotel.pe", "clave-equivocada")
	_, errCorreo := b.login("nadie@hotel.pe", "clave-equivocada")

	if !errors.Is(errClave, ErrCredenciales) || errClave != errCorreo {
		t.Fatalf("deben ser idénticos para no revelar qué correos existen: %v / %v", errClave, errCorreo)
	}
}

func TestCorreoInexistenteGastaLaMismaComparacion(t *testing.T) {
	// Sin esto, "no existe" responde mucho más rápido que "clave mala" y el
	// tiempo delata qué correos están registrados.
	b := nuevoBanco(t)
	antes := b.hasher.comparaciones
	_, _ = b.login("nadie@hotel.pe", "x")
	if b.hasher.comparaciones != antes+1 {
		t.Fatalf("debía comparar contra el hash de relleno (comparaciones: %d → %d)", antes, b.hasher.comparaciones)
	}
}

func TestCuentaInactiva(t *testing.T) {
	b := nuevoBanco(t)

	if _, err := b.login("baja@hotel.pe", claveCorrecta); !errors.Is(err, ErrCuentaInactiva) {
		t.Fatalf("con la clave correcta debe decir que está desactivada: %v", err)
	}
	// Con la clave MAL no debe revelar que la cuenta existe y está de baja.
	if _, err := b.login("baja@hotel.pe", "mala"); !errors.Is(err, ErrCredenciales) {
		t.Fatalf("con la clave mala debe ser el error genérico: %v", err)
	}
}

func TestCuentaSinClaveNoEntraNunca(t *testing.T) {
	b := nuevoBanco(t)
	for _, intento := range []string{"", "x", claveCorrecta, "$2a$10$abc"} {
		if _, err := b.login("sinclave@hotel.pe", intento); err == nil {
			t.Fatalf("una cuenta sin hash entró con %q", intento)
		}
	}
}

func TestEntradasInvalidasNiSiquieraConsultanLaBase(t *testing.T) {
	b := nuevoBanco(t)
	larga := strings.Repeat("a", MaxPasswordBytes+1)

	casos := map[string][2]string{
		"correo vacío":      {"", claveCorrecta},
		"solo espacios":     {"   ", claveCorrecta},
		"clave vacía":       {"ana@hotel.pe", ""},
		"clave de 73 bytes": {"ana@hotel.pe", larga},
	}
	for nombre, c := range casos {
		if _, err := b.login(c[0], c[1]); !errors.Is(err, ErrCredenciales) {
			t.Errorf("%s: %v", nombre, err)
		}
	}
	if b.cuentas.llamadas != 0 {
		t.Fatalf("se consultó la base %d veces para entradas imposibles", b.cuentas.llamadas)
	}
}

func TestUnaCaidaDeLaBaseNoSeDisfrazaDeCredencialesMalas(t *testing.T) {
	b := nuevoBanco(t)
	b.cuentas.err = errors.New("conexión rechazada")

	_, err := b.login("ana@hotel.pe", claveCorrecta)
	if err == nil || errors.Is(err, ErrCredenciales) {
		t.Fatalf("debía ser un error de infraestructura (500), no 'clave incorrecta': %v", err)
	}
}

// --- freno a intentos repetidos ---

func TestBloqueoTrasCincoFallos(t *testing.T) {
	b := nuevoBanco(t)
	for i := 0; i < 5; i++ {
		if _, err := b.login("ana@hotel.pe", "mala"); !errors.Is(err, ErrCredenciales) {
			t.Fatalf("intento %d: %v", i+1, err)
		}
	}

	// Ya bloqueada: ni con la clave CORRECTA entra (si no, el freno no frena
	// nada: bastaría seguir probando hasta acertar).
	if _, err := b.login("ana@hotel.pe", claveCorrecta); !errors.Is(err, ErrDemasiadosIntentos) {
		t.Fatalf("debía estar bloqueada: %v", err)
	}
}

func TestElBloqueoEsPorOrigenYCorreo(t *testing.T) {
	b := nuevoBanco(t)
	for i := 0; i < 5; i++ {
		_, _ = b.svc.Login(context.Background(), "10.0.0.1", "ana@hotel.pe", "mala")
	}

	// Otro origen no queda bloqueado por lo que hizo el primero.
	if _, err := b.svc.Login(context.Background(), "10.0.0.2", "ana@hotel.pe", claveCorrecta); err != nil {
		t.Fatalf("otro origen no debía estar bloqueado: %v", err)
	}
	// Y el mismo origen sí puede entrar con OTRA cuenta.
	if _, err := b.svc.Login(context.Background(), "10.0.0.1", "baja@hotel.pe", "mala"); !errors.Is(err, ErrCredenciales) {
		t.Fatalf("otra cuenta del mismo origen no debía estar bloqueada: %v", err)
	}
}

func TestElBloqueoVence(t *testing.T) {
	b := nuevoBanco(t)
	for i := 0; i < 5; i++ {
		_, _ = b.login("ana@hotel.pe", "mala")
	}
	if _, err := b.login("ana@hotel.pe", claveCorrecta); !errors.Is(err, ErrDemasiadosIntentos) {
		t.Fatal("debía estar bloqueada")
	}

	*b.reloj = b.reloj.Add(16 * time.Minute)
	if _, err := b.login("ana@hotel.pe", claveCorrecta); err != nil {
		t.Fatalf("pasada la ventana debía poder entrar: %v", err)
	}
}

func TestUnAciertoReiniciaLaCuenta(t *testing.T) {
	b := nuevoBanco(t)
	for i := 0; i < 4; i++ {
		_, _ = b.login("ana@hotel.pe", "mala")
	}
	if _, err := b.login("ana@hotel.pe", claveCorrecta); err != nil {
		t.Fatal(err)
	}
	// Si no se hubiera reiniciado, este quinto fallo (acumulado) la bloquearía.
	for i := 0; i < 4; i++ {
		if _, err := b.login("ana@hotel.pe", "mala"); !errors.Is(err, ErrCredenciales) {
			t.Fatalf("tras un acierto la cuenta debía empezar de cero: %v", err)
		}
	}
}

// --- Me ---

func TestMe(t *testing.T) {
	b := nuevoBanco(t)

	p, err := b.svc.Me(context.Background(), 1)
	if err != nil || p.Nombre != "Ana" {
		t.Fatalf("%+v %v", p, err)
	}
	if _, err := b.svc.Me(context.Background(), 999); !errors.Is(err, ErrSesionInvalida) {
		t.Fatalf("cuenta inexistente: %v", err)
	}
	// Un token todavía vigente de una cuenta dada de baja deja de servir.
	if _, err := b.svc.Me(context.Background(), 2); !errors.Is(err, ErrSesionInvalida) {
		t.Fatalf("cuenta inactiva: %v", err)
	}
}

func TestNewServicioFallaSiNoPuedeHashear(t *testing.T) {
	_, err := NewServicio(&cuentasFake{}, hasherQueFalla{}, emisorFake{}, NuevoLimitador(5, time.Minute))
	if err == nil {
		t.Fatal("debía fallar")
	}
}

type hasherQueFalla struct{}

func (hasherQueFalla) Hash(string) (string, error)   { return "", errors.New("sin entropía") }
func (hasherQueFalla) Comparar(string, string) error { return errors.New("x") }

// --- Bcrypt ---

func TestBcrypt(t *testing.T) {
	b := Bcrypt{Cost: bcrypt.MinCost}
	h, err := b.Hash("clave")
	if err != nil {
		t.Fatal(err)
	}
	if h == "clave" || !strings.HasPrefix(h, "$2") {
		t.Fatalf("no parece un hash bcrypt: %q", h)
	}
	if b.Comparar(h, "clave") != nil {
		t.Fatal("la clave correcta debía coincidir")
	}
	if b.Comparar(h, "otra") == nil {
		t.Fatal("otra clave no debía coincidir")
	}
	if b.Comparar("", "clave") == nil || b.Comparar("basura", "clave") == nil {
		t.Fatal("un hash vacío o corrupto nunca debe coincidir")
	}
	if _, err := b.Hash(strings.Repeat("a", MaxPasswordBytes+1)); err == nil {
		t.Fatal("una clave de más de 72 bytes debía rechazarse, no truncarse en silencio")
	}
	h2, _ := b.Hash("clave")
	if h == h2 {
		t.Fatal("dos hashes de la misma clave deben diferir (sal)")
	}
}
