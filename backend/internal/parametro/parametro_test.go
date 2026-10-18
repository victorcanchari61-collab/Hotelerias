package parametro

import (
	"context"
	"errors"
	"testing"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/httpx"
)

type repoFalso struct {
	datos      map[string]Guardado
	lecturas   int
	escrituras int
	falla      error
}

func (r *repoFalso) Todos(context.Context) (map[string]Guardado, error) {
	r.lecturas++
	if r.falla != nil {
		return nil, r.falla
	}
	copia := map[string]Guardado{}
	for k, v := range r.datos {
		copia[k] = v
	}
	return copia, nil
}

func (r *repoFalso) GuardarVarios(_ context.Context, valores map[string]string, _ int64) error {
	r.escrituras++
	if r.datos == nil {
		r.datos = map[string]Guardado{}
	}
	for k, v := range valores {
		r.datos[k] = Guardado{Valor: v, ActualizadoEn: time.Now()}
	}
	return nil
}

type bitacoraFalsa struct{ eventos []auditoria.Evento }

func (b *bitacoraFalsa) Registrar(_ context.Context, e auditoria.Evento) {
	b.eventos = append(b.eventos, e)
}

func nuevo() (*Servicio, *repoFalso, *bitacoraFalsa) {
	repo := &repoFalso{}
	bit := &bitacoraFalsa{}
	return NewServicio(repo, bit), repo, bit
}

func TestSinNadaGuardadoRigenLosDefectos(t *testing.T) {
	s, _, _ := nuevo()
	ctx := context.Background()

	if got := s.Entero(ctx, MaxNoches); got != 30 {
		t.Errorf("max noches = %d; quiero 30", got)
	}
	if got := s.Entero(ctx, CancelacionDias); got != 1 {
		t.Errorf("cancelación = %d; quiero 1", got)
	}
	if got := s.Entero(ctx, CambioDiasAtras); got != 7 {
		t.Errorf("antigüedad del cambio = %d; quiero 7", got)
	}
	if got := s.Valor(ctx, CheckinHora); got != "14:00" {
		t.Errorf("check-in = %q", got)
	}
	lista, err := s.Listar(ctx)
	if err != nil || len(lista) != len(Definiciones) {
		t.Fatalf("listar: %d, %v", len(lista), err)
	}
	for _, p := range lista {
		if p.Modificado {
			t.Errorf("%s no debería figurar como modificado", p.Clave)
		}
	}
}

func TestLasDefinicionesSonCoherentes(t *testing.T) {
	vistas := map[string]bool{}
	for _, d := range Definiciones {
		if vistas[d.Clave] {
			t.Errorf("clave repetida: %s", d.Clave)
		}
		vistas[d.Clave] = true
		// El defecto tiene que pasar su propia validación, o el sistema arranca con un valor inválido.
		if _, err := d.Validar(d.Defecto); err != nil {
			t.Errorf("%s: el defecto %q no es válido: %v", d.Clave, d.Defecto, err)
		}
		if d.Etiqueta == "" || d.Grupo == "" || d.Descripcion == "" {
			t.Errorf("%s: falta etiqueta, grupo o descripción", d.Clave)
		}
	}
}

func TestValidar(t *testing.T) {
	noches, _ := definicion(MaxNoches)
	hora, _ := definicion(CheckinHora)

	for entrada, quiero := range map[string]string{"30": "30", " 7 ": "7", "007": "7", "365": "365", "1": "1"} {
		if got, err := noches.Validar(entrada); err != nil || got != quiero {
			t.Errorf("noches %q = %q, %v; quiero %q", entrada, got, err, quiero)
		}
	}
	for _, malo := range []string{"", "0", "366", "-5", "abc", "3.5", "1e2", "+3", "3 0", "９"} {
		if got, err := noches.Validar(malo); err == nil {
			t.Errorf("noches %q = %q; debió fallar", malo, got)
		}
	}
	for _, bueno := range []string{"00:00", "14:00", "23:59", " 09:30 "} {
		if _, err := hora.Validar(bueno); err != nil {
			t.Errorf("hora %q: %v", bueno, err)
		}
	}
	for _, malo := range []string{"", "24:00", "9:30", "14:60", "14.00", "1400", "ahora", "14:00:00"} {
		if got, err := hora.Validar(malo); err == nil {
			t.Errorf("hora %q = %q; debió fallar", malo, got)
		}
	}
}

func TestGuardarEscribeSoloLoQueCambioYAudita(t *testing.T) {
	s, repo, bit := nuevo()
	ctx := context.Background()

	lista, err := s.Guardar(ctx, map[string]string{
		MaxNoches:   "45",
		CheckinHora: "14:00", // igual al defecto: no se escribe
	}, 9)
	if err != nil {
		t.Fatal(err)
	}
	if len(repo.datos) != 1 || repo.datos[MaxNoches].Valor != "45" {
		t.Fatalf("guardó %+v; quiero solo max noches", repo.datos)
	}
	for _, p := range lista {
		if p.Clave == MaxNoches && (p.Valor != "45" || !p.Modificado) {
			t.Errorf("%+v", p)
		}
	}
	if len(bit.eventos) != 1 || bit.eventos[0].UsuarioID != 9 || bit.eventos[0].Entidad != "Parametro" {
		t.Fatalf("auditoría: %+v", bit.eventos)
	}
	e := bit.eventos[0]
	if e.Antes["Máximo de noches por reserva"] != "30" || e.Despues["Máximo de noches por reserva"] != "45" {
		t.Errorf("antes/después: %+v / %+v", e.Antes, e.Despues)
	}
	if got := s.Entero(ctx, MaxNoches); got != 45 {
		t.Errorf("el cambio debe verse al instante en esta instancia: %d", got)
	}
}

func TestGuardarSinCambiosNoEscribeNiAudita(t *testing.T) {
	s, repo, bit := nuevo()
	if _, err := s.Guardar(context.Background(), map[string]string{MaxNoches: "30"}, 1); err != nil {
		t.Fatal(err)
	}
	if repo.escrituras != 0 || len(bit.eventos) != 0 {
		t.Fatalf("escrituras=%d eventos=%d", repo.escrituras, len(bit.eventos))
	}
}

func TestGuardarEsTodoONada(t *testing.T) {
	s, repo, bit := nuevo()
	_, err := s.Guardar(context.Background(), map[string]string{MaxNoches: "45", CheckinHora: "25:00"}, 1)
	var v httpx.Validacion
	if !errors.As(err, &v) {
		t.Fatalf("err = %v; quiero una validación", err)
	}
	if repo.escrituras != 0 || len(bit.eventos) != 0 {
		t.Fatal("un valor malo no debe dejar pasar a los buenos")
	}

	_, err = s.Guardar(context.Background(), map[string]string{"no.existe": "1"}, 1)
	if !errors.As(err, &v) {
		t.Fatalf("clave desconocida: err = %v", err)
	}
}

func TestUnValorGuardadoInvalidoCaeAlDefecto(t *testing.T) {
	s, repo, _ := nuevo()
	// Alguien lo escribió a mano en la base.
	repo.datos = map[string]Guardado{MaxNoches: {Valor: "muchas"}, CheckinHora: {Valor: "99:99"}}
	ctx := context.Background()
	if got := s.Entero(ctx, MaxNoches); got != 30 {
		t.Errorf("max noches = %d; quiero el defecto", got)
	}
	if got := s.Valor(ctx, CheckinHora); got != "14:00" {
		t.Errorf("check-in = %q; quiero el defecto", got)
	}
}

func TestSiLaBaseFallaSeUsanLosDefectos(t *testing.T) {
	s, repo, _ := nuevo()
	repo.falla = errors.New("base caída")
	// Reservar no puede depender de que se pueda leer un ajuste.
	if got := s.Entero(context.Background(), MaxNoches); got != 30 {
		t.Errorf("max noches = %d", got)
	}
	if _, err := s.Listar(context.Background()); err == nil {
		t.Error("la pantalla sí debe enterarse del fallo")
	}
}

func TestElCacheNoLeeLaBaseEnCadaConsulta(t *testing.T) {
	s, repo, _ := nuevo()
	ahora := time.Now()
	s.ahora = func() time.Time { return ahora }
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		s.Entero(ctx, MaxNoches)
	}
	if repo.lecturas != 1 {
		t.Fatalf("lecturas = %d; quiero 1", repo.lecturas)
	}
	// Pasado el tiempo, vuelve a leer (por si otra instancia lo cambió).
	ahora = ahora.Add(ttl + time.Second)
	s.Entero(ctx, MaxNoches)
	if repo.lecturas != 2 {
		t.Fatalf("lecturas = %d; quiero 2", repo.lecturas)
	}
}

func TestPublicosSoloLosQueLaWebPuedeMostrar(t *testing.T) {
	s, _, _ := nuevo()
	pub := s.Publicos(context.Background())
	if pub[CheckinHora] != "14:00" || pub[CheckoutHora] != "12:00" {
		t.Fatalf("%+v", pub)
	}
	for _, interno := range []string{MaxNoches, CancelacionDias, CambioDiasAtras} {
		if _, ok := pub[interno]; ok {
			t.Errorf("%s es interno y no debe salir en la web", interno)
		}
	}
}
