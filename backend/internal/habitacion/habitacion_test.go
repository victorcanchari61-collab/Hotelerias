package habitacion

import (
	"context"
	"errors"
	"testing"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

type repoFalso struct {
	habitaciones map[int64]Habitacion
	tipos        map[int64]TipoRef
	siguiente    int64

	// lo que responde a las operaciones con reglas de base
	errCrear      error
	errLote       error
	errActualizar error

	creadas       []Input
	lotes         [][]string
	actualizadas  []Input
	estados       []Estado
	estadoOcupado bool // CambiarEstado devuelve false (cambió mientras tanto)
}

func nuevoRepo() *repoFalso {
	return &repoFalso{
		habitaciones: map[int64]Habitacion{},
		tipos: map[int64]TipoRef{
			10: {ID: 10, SedeID: 1, Nombre: "Deluxe", SedeNombre: "Velothr Lima", Activo: true},
			11: {ID: 11, SedeID: 1, Nombre: "Suite", SedeNombre: "Velothr Lima", Activo: true},
			20: {ID: 20, SedeID: 2, Nombre: "Deluxe", SedeNombre: "Velothr Cusco", Activo: true},
			30: {ID: 30, SedeID: 1, Nombre: "Vieja", SedeNombre: "Velothr Lima", Activo: false},
		},
		siguiente: 100,
	}
}

func (r *repoFalso) Listar(_ context.Context, sedeIDs []int64) ([]Habitacion, error) {
	out := []Habitacion{}
	for _, h := range r.habitaciones {
		if enAlcance(sedeIDs, h.SedeID) {
			out = append(out, h)
		}
	}
	return out, nil
}

func (r *repoFalso) PorID(_ context.Context, id int64) (Habitacion, error) {
	if h, ok := r.habitaciones[id]; ok {
		return h, nil
	}
	return Habitacion{}, ErrNoEncontrada
}

func (r *repoFalso) Opciones(context.Context, []int64) (Opciones, error) { return Opciones{}, nil }

func (r *repoFalso) Tipo(_ context.Context, id int64) (TipoRef, error) {
	if t, ok := r.tipos[id]; ok {
		return t, nil
	}
	return TipoRef{}, ErrNoEncontrada
}

func (r *repoFalso) Crear(_ context.Context, sedeID int64, in Input) (int64, error) {
	if r.errCrear != nil {
		return 0, r.errCrear
	}
	r.creadas = append(r.creadas, in)
	r.siguiente++
	t := r.tipos[in.TipoHabitacionID]
	r.habitaciones[r.siguiente] = Habitacion{
		ID: r.siguiente, SedeID: sedeID, SedeNombre: t.SedeNombre, TipoHabitacionID: t.ID, TipoNombre: t.Nombre,
		Numero: in.Numero, Piso: in.Piso, Estado: Limpia, Notas: in.Notas, Activa: in.Activa,
	}
	return r.siguiente, nil
}

func (r *repoFalso) CrearLote(_ context.Context, _, _ int64, _ int, numeros []string) error {
	if r.errLote != nil {
		return r.errLote
	}
	r.lotes = append(r.lotes, numeros)
	return nil
}

func (r *repoFalso) Actualizar(_ context.Context, id int64, in Input, _ fecha.Fecha) error {
	if r.errActualizar != nil {
		return r.errActualizar
	}
	r.actualizadas = append(r.actualizadas, in)
	h := r.habitaciones[id]
	t := r.tipos[in.TipoHabitacionID]
	h.TipoHabitacionID, h.TipoNombre, h.Numero, h.Piso, h.Notas, h.Activa = t.ID, t.Nombre, in.Numero, in.Piso, in.Notas, in.Activa
	r.habitaciones[id] = h
	return nil
}

func (r *repoFalso) CambiarEstado(_ context.Context, id int64, _, hacia Estado) (bool, error) {
	if r.estadoOcupado {
		return false, nil
	}
	h := r.habitaciones[id]
	h.Estado = hacia
	r.habitaciones[id] = h
	r.estados = append(r.estados, hacia)
	return true, nil
}

type bitacoraFalsa struct{ eventos []auditoria.Evento }

func (b *bitacoraFalsa) Registrar(_ context.Context, e auditoria.Evento) {
	b.eventos = append(b.eventos, e)
}

func armar() (*Servicio, *repoFalso, *bitacoraFalsa) {
	repo, bit := nuevoRepo(), &bitacoraFalsa{}
	hoy := fecha.Nueva(2026, 11, 1)
	return NewServicio(repo, func() fecha.Fecha { return hoy }, bit), repo, bit
}

var ctx = context.Background()

func validacion(err error) bool {
	var v httpx.Validacion
	return errors.As(err, &v)
}

func conflicto(err error) bool {
	var c httpx.Conflicto
	return errors.As(err, &c)
}

// sembrar deja una habitación 101 de Lima en el estado dado.
func sembrar(repo *repoFalso, estado Estado) int64 {
	repo.siguiente++
	repo.habitaciones[repo.siguiente] = Habitacion{
		ID: repo.siguiente, SedeID: 1, SedeNombre: "Velothr Lima", TipoHabitacionID: 10, TipoNombre: "Deluxe",
		Numero: "101", Piso: 1, Estado: estado, Activa: true,
	}
	return repo.siguiente
}

func TestCrearNormalizaYAudita(t *testing.T) {
	s, repo, bit := armar()
	h, err := s.Crear(ctx, Input{TipoHabitacionID: 10, Numero: "  ph-1 ", Piso: 8, Notas: " vista al mar ", Activa: true}, 7, nil)
	if err != nil {
		t.Fatal(err)
	}
	if repo.creadas[0].Numero != "PH-1" || repo.creadas[0].Notas != "vista al mar" {
		t.Fatalf("no normalizó: %+v", repo.creadas[0])
	}
	if h.SedeID != 1 {
		t.Fatalf("la sede sale del tipo: %+v", h)
	}
	if len(bit.eventos) != 1 || bit.eventos[0].Accion != auditoria.Creado || bit.eventos[0].UsuarioID != 7 {
		t.Fatalf("auditoría: %+v", bit.eventos)
	}
}

func TestCrearRechazaDatosInvalidos(t *testing.T) {
	s, repo, _ := armar()
	casos := map[string]Input{
		"sin tipo":         {Numero: "101", Piso: 1},
		"tipo inexistente": {TipoHabitacionID: 999, Numero: "101"},
		"tipo desactivado": {TipoHabitacionID: 30, Numero: "101"},
		"sin número":       {TipoHabitacionID: 10, Numero: "  "},
		"número raro":      {TipoHabitacionID: 10, Numero: "10;1"},
		"número largo":     {TipoHabitacionID: 10, Numero: "12345678901"},
		"piso alto":        {TipoHabitacionID: 10, Numero: "101", Piso: 101},
		"piso bajo":        {TipoHabitacionID: 10, Numero: "101", Piso: -6},
	}
	for nombre, in := range casos {
		if _, err := s.Crear(ctx, in, 1, nil); !validacion(err) {
			t.Errorf("%s: err = %v; quiero una validación", nombre, err)
		}
	}
	if len(repo.creadas) != 0 {
		t.Fatal("no debió crear nada")
	}
}

func TestCrearEnOtroHotelSeComportaComoInexistente(t *testing.T) {
	s, repo, _ := armar()
	// La persona solo alcanza el hotel 2 (Cusco); el tipo 10 es de Lima.
	_, err := s.Crear(ctx, Input{TipoHabitacionID: 10, Numero: "101", Piso: 1, Activa: true}, 1, []int64{2})
	if !validacion(err) {
		t.Fatalf("err = %v", err)
	}
	if len(repo.creadas) != 0 {
		t.Fatal("no debe crear en un hotel que no alcanza")
	}
	// "Mis sedes" sin ninguna asignada: no alcanza nada.
	if _, err := s.Crear(ctx, Input{TipoHabitacionID: 10, Numero: "101", Piso: 1, Activa: true}, 1, []int64{}); !validacion(err) {
		t.Fatalf("sin hoteles asignados: %v", err)
	}
}

func TestCrearNumeroRepetidoEsConflicto(t *testing.T) {
	s, repo, _ := armar()
	repo.errCrear = ErrNumeroRepetido
	if _, err := s.Crear(ctx, Input{TipoHabitacionID: 10, Numero: "101", Piso: 1, Activa: true}, 1, nil); !conflicto(err) {
		t.Fatalf("err = %v", err)
	}
}

func TestLote(t *testing.T) {
	s, repo, bit := armar()
	n, err := s.CrearLote(ctx, Lote{TipoHabitacionID: 10, Piso: 2, Desde: 201, Hasta: 205}, 3, nil)
	if err != nil || n != 5 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	if got := repo.lotes[0]; len(got) != 5 || got[0] != "201" || got[4] != "205" {
		t.Fatalf("números: %v", got)
	}
	if len(bit.eventos) != 1 || bit.eventos[0].EntidadID != "lote" {
		t.Fatalf("auditoría: %+v", bit.eventos)
	}

	malos := map[string]Lote{
		"sin tipo":    {Desde: 1, Hasta: 2},
		"al revés":    {TipoHabitacionID: 10, Desde: 5, Hasta: 2},
		"cero":        {TipoHabitacionID: 10, Desde: 0, Hasta: 5},
		"enorme":      {TipoHabitacionID: 10, Desde: 1, Hasta: 102},
		"fuera":       {TipoHabitacionID: 10, Desde: 9990, Hasta: 10000},
		"piso":        {TipoHabitacionID: 10, Desde: 1, Hasta: 2, Piso: 200},
		"otro hotel":  {TipoHabitacionID: 20, Desde: 1, Hasta: 2},
		"desactivado": {TipoHabitacionID: 30, Desde: 1, Hasta: 2},
	}
	for nombre, l := range malos {
		alcance := []int64(nil)
		if nombre == "otro hotel" {
			alcance = []int64{1}
		}
		if _, err := s.CrearLote(ctx, l, 1, alcance); !validacion(err) {
			t.Errorf("%s: err = %v", nombre, err)
		}
	}
	if len(repo.lotes) != 1 {
		t.Fatalf("solo el primero debía crearse: %d", len(repo.lotes))
	}

	repo.errLote = ErrNumerosRepetidos{Numeros: []string{"202", "203"}}
	if _, err := s.CrearLote(ctx, Lote{TipoHabitacionID: 10, Piso: 2, Desde: 201, Hasta: 205}, 1, nil); !conflicto(err) {
		t.Fatalf("repetidos: %v", err)
	}
}

func TestActualizarReglas(t *testing.T) {
	t.Run("una ocupada no se desactiva ni cambia de tipo", func(t *testing.T) {
		s, repo, _ := armar()
		id := sembrar(repo, Ocupada)
		if _, err := s.Actualizar(ctx, id, Input{TipoHabitacionID: 10, Numero: "101", Piso: 1, Activa: false}, 1, nil); !conflicto(err) {
			t.Errorf("desactivar: %v", err)
		}
		if _, err := s.Actualizar(ctx, id, Input{TipoHabitacionID: 11, Numero: "101", Piso: 1, Activa: true}, 1, nil); !conflicto(err) {
			t.Errorf("cambiar de tipo: %v", err)
		}
		// Pero sí se le puede cambiar una nota.
		if _, err := s.Actualizar(ctx, id, Input{TipoHabitacionID: 10, Numero: "101", Piso: 1, Notas: "ok", Activa: true}, 1, nil); err != nil {
			t.Errorf("nota: %v", err)
		}
	})

	t.Run("no pasa a otro hotel", func(t *testing.T) {
		s, repo, _ := armar()
		id := sembrar(repo, Limpia)
		if _, err := s.Actualizar(ctx, id, Input{TipoHabitacionID: 20, Numero: "101", Piso: 1, Activa: true}, 1, nil); !validacion(err) {
			t.Fatalf("err = %v", err)
		}
	})

	t.Run("una de otro hotel responde como inexistente", func(t *testing.T) {
		s, repo, _ := armar()
		id := sembrar(repo, Limpia)
		_, err := s.Actualizar(ctx, id, Input{TipoHabitacionID: 20, Numero: "101", Piso: 1, Activa: true}, 1, []int64{2})
		if !errors.Is(err, ErrNoEncontrada) {
			t.Fatalf("err = %v", err)
		}
	})

	t.Run("quitarla con reservas que la necesitan es un conflicto claro", func(t *testing.T) {
		s, repo, bit := armar()
		id := sembrar(repo, Limpia)
		repo.errActualizar = ErrCupoComprometido{Reservas: 3, Quedan: 2}
		_, err := s.Actualizar(ctx, id, Input{TipoHabitacionID: 10, Numero: "101", Piso: 1, Activa: false}, 1, nil)
		if !conflicto(err) {
			t.Fatalf("err = %v", err)
		}
		if len(bit.eventos) != 0 {
			t.Fatal("un cambio que no se hizo no se audita")
		}
	})

	t.Run("sin cambios no audita", func(t *testing.T) {
		s, repo, bit := armar()
		id := sembrar(repo, Limpia)
		if _, err := s.Actualizar(ctx, id, Input{TipoHabitacionID: 10, Numero: "101", Piso: 1, Activa: true}, 1, nil); err != nil {
			t.Fatal(err)
		}
		if len(bit.eventos) != 0 {
			t.Fatalf("eventos: %+v", bit.eventos)
		}
	})
}

func TestCambiarEstado(t *testing.T) {
	t.Run("limpia → sucia, auditado", func(t *testing.T) {
		s, repo, bit := armar()
		id := sembrar(repo, Limpia)
		h, err := s.CambiarEstado(ctx, id, Sucia, 5, nil)
		if err != nil || h.Estado != Sucia {
			t.Fatalf("h=%+v err=%v", h, err)
		}
		if len(bit.eventos) != 1 || bit.eventos[0].Antes["estado"] != "limpia" || bit.eventos[0].Despues["estado"] != "sucia" {
			t.Fatalf("auditoría: %+v", bit.eventos)
		}
	})

	t.Run("«ocupada» no se asigna a mano", func(t *testing.T) {
		s, repo, _ := armar()
		id := sembrar(repo, Limpia)
		if _, err := s.CambiarEstado(ctx, id, Ocupada, 1, nil); !validacion(err) {
			t.Fatalf("err = %v", err)
		}
		if _, err := s.CambiarEstado(ctx, id, Estado("rara"), 1, nil); !validacion(err) {
			t.Fatalf("estado raro: %v", err)
		}
	})

	t.Run("una ocupada no se toca hasta el check-out", func(t *testing.T) {
		s, repo, _ := armar()
		id := sembrar(repo, Ocupada)
		if _, err := s.CambiarEstado(ctx, id, Limpia, 1, nil); !conflicto(err) {
			t.Fatalf("err = %v", err)
		}
	})

	t.Run("una desactivada tampoco", func(t *testing.T) {
		s, repo, _ := armar()
		id := sembrar(repo, Limpia)
		h := repo.habitaciones[id]
		h.Activa = false
		repo.habitaciones[id] = h
		if _, err := s.CambiarEstado(ctx, id, Sucia, 1, nil); !conflicto(err) {
			t.Fatalf("err = %v", err)
		}
	})

	t.Run("el mismo estado no hace nada ni audita", func(t *testing.T) {
		s, repo, bit := armar()
		id := sembrar(repo, Sucia)
		if _, err := s.CambiarEstado(ctx, id, Sucia, 1, nil); err != nil {
			t.Fatal(err)
		}
		if len(repo.estados) != 0 || len(bit.eventos) != 0 {
			t.Fatal("no debió escribir")
		}
	})

	t.Run("si cambió mientras tanto, conflicto", func(t *testing.T) {
		s, repo, _ := armar()
		id := sembrar(repo, Limpia)
		repo.estadoOcupado = true
		if _, err := s.CambiarEstado(ctx, id, Sucia, 1, nil); !conflicto(err) {
			t.Fatalf("err = %v", err)
		}
	})

	t.Run("de otro hotel responde como inexistente", func(t *testing.T) {
		s, repo, _ := armar()
		id := sembrar(repo, Limpia)
		if _, err := s.CambiarEstado(ctx, id, Sucia, 1, []int64{2}); !errors.Is(err, ErrNoEncontrada) {
			t.Fatalf("err = %v", err)
		}
	})
}
