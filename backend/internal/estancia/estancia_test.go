package estancia

import (
	"context"
	"errors"
	"testing"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

var hoy = fecha.Nueva(2026, 11, 10)

func ptr[T any](v T) *T { return &v }

func validacion(err error) bool {
	var v httpx.Validacion
	return errors.As(err, &v)
}

func conflicto(err error) bool {
	var c httpx.Conflicto
	return errors.As(err, &c)
}

func fichaValida() Ficha {
	return Ficha{DocumentoTipo: DNI, DocumentoNumero: "12345678", NombreCompleto: "Ana Pérez", Nacionalidad: "Peruana", Domiciliado: true}
}

func TestNormalizarFicha(t *testing.T) {
	t.Run("limpia espacios y deja el documento en mayúsculas", func(t *testing.T) {
		f := Ficha{DocumentoTipo: Pasaporte, DocumentoNumero: " ab 123456 ", NombreCompleto: "  John   Smith ", Nacionalidad: " Estadounidense ",
			FechaIngresoPais: ptr(hoy.Mas(-3))}
		if err := normalizarFicha(&f, hoy); err != nil {
			t.Fatal(err)
		}
		if f.DocumentoNumero != "AB123456" || f.NombreCompleto != "John Smith" || f.Nacionalidad != "Estadounidense" {
			t.Fatalf("%+v", f)
		}
	})

	t.Run("cada documento con su formato", func(t *testing.T) {
		casos := map[string]struct {
			tipo   DocumentoTipo
			numero string
			ok     bool
		}{
			"dni bueno":         {DNI, "12345678", true},
			"dni corto":         {DNI, "1234567", false},
			"dni con letras":    {DNI, "1234567A", false},
			"ce bueno":          {CE, "001234567", true},
			"ce corto":          {CE, "12345", false},
			"pasaporte bueno":   {Pasaporte, "X1234567", true},
			"pasaporte corto":   {Pasaporte, "A12", false},
			"pasaporte símbolo": {Pasaporte, "A12345;7", false},
			"otro bueno":        {Otro, "AB-1234", true},
			"otro corto":        {Otro, "AB1", false},
		}
		for nombre, c := range casos {
			f := fichaValida()
			f.DocumentoTipo, f.DocumentoNumero = c.tipo, c.numero
			err := normalizarFicha(&f, hoy)
			if c.ok && err != nil || !c.ok && !validacion(err) {
				t.Errorf("%s: err = %v; ¿válido? quiero %v", nombre, err, c.ok)
			}
		}
	})

	t.Run("campos obligatorios", func(t *testing.T) {
		for nombre, cambio := range map[string]func(*Ficha){
			"sin tipo":          func(f *Ficha) { f.DocumentoTipo = "" },
			"tipo raro":         func(f *Ficha) { f.DocumentoTipo = "licencia" },
			"sin nombre":        func(f *Ficha) { f.NombreCompleto = "   " },
			"nombre larguísimo": func(f *Ficha) { f.NombreCompleto = string(make([]rune, 121)) + "x" },
			"sin nacionalidad":  func(f *Ficha) { f.Nacionalidad = "" },
			"teléfono largo":    func(f *Ficha) { f.Telefono = "123456789012345678901234567890123" },
		} {
			f := fichaValida()
			cambio(&f)
			if err := normalizarFicha(&f, hoy); !validacion(err) {
				t.Errorf("%s: err = %v", nombre, err)
			}
		}
	})

	t.Run("un no domiciliado debe traer su fecha de ingreso al país", func(t *testing.T) {
		f := fichaValida()
		f.Domiciliado = false
		if err := normalizarFicha(&f, hoy); !validacion(err) {
			t.Fatalf("sin fecha: %v", err)
		}
		f.FechaIngresoPais = ptr(hoy.Mas(1))
		if err := normalizarFicha(&f, hoy); !validacion(err) {
			t.Fatalf("fecha futura: %v", err)
		}
		f.FechaIngresoPais = ptr(hoy)
		if err := normalizarFicha(&f, hoy); err != nil {
			t.Fatalf("ingresó hoy: %v", err)
		}
	})

	t.Run("un domiciliado no guarda fecha de ingreso aunque llegue una", func(t *testing.T) {
		f := fichaValida()
		f.FechaIngresoPais = ptr(hoy.Mas(-5))
		if err := normalizarFicha(&f, hoy); err != nil {
			t.Fatal(err)
		}
		if f.FechaIngresoPais != nil {
			t.Fatalf("debía descartarse: %v", f.FechaIngresoPais)
		}
	})
}

func TestEnmascarar(t *testing.T) {
	for entrada, quiero := range map[string]string{"12345678": "*****678", "AB1": "***", "A": "*", "": ""} {
		if got := enmascarar(entrada); got != quiero {
			t.Errorf("enmascarar(%q) = %q; quiero %q", entrada, got, quiero)
		}
	}
}

// ---- servicio con un repositorio falso ----

type repoFalso struct {
	sede       int64
	errSede    error
	errCheckIn error
	errOut     error
	estancia   Estancia
	llamadas   []string
}

func (r *repoFalso) Panel(context.Context, []int64, fecha.Fecha) ([]Movimiento, error) {
	return nil, nil
}
func (r *repoFalso) SedeDeReserva(context.Context, int64) (int64, error)      { return r.sede, r.errSede }
func (r *repoFalso) Libres(context.Context, int64) ([]HabitacionLibre, error) { return nil, nil }
func (r *repoFalso) CheckIn(context.Context, CheckIn, int64, fecha.Fecha) (int64, error) {
	r.llamadas = append(r.llamadas, "checkin")
	return 1, r.errCheckIn
}
func (r *repoFalso) CheckOut(context.Context, int64, int64) error {
	r.llamadas = append(r.llamadas, "checkout")
	return r.errOut
}
func (r *repoFalso) PorID(context.Context, int64) (Estancia, error) { return r.estancia, nil }

type bitacoraFalsa struct{ eventos []auditoria.Evento }

func (b *bitacoraFalsa) Registrar(_ context.Context, e auditoria.Evento) {
	b.eventos = append(b.eventos, e)
}

func armar() (*Servicio, *repoFalso, *bitacoraFalsa) {
	repo := &repoFalso{sede: 1, estancia: Estancia{ID: 1, Codigo: "HV-AAAA-0001", SedeID: 1, HabitacionNumero: "101"}}
	bit := &bitacoraFalsa{}
	return NewServicio(repo, func() fecha.Fecha { return hoy }, bit), repo, bit
}

func entrada() CheckIn { return CheckIn{ReservaID: 5, HabitacionID: 9, Ficha: fichaValida()} }

var ctx = context.Background()

func TestCheckInValidaAntesDeIrALaBase(t *testing.T) {
	s, repo, _ := armar()
	malo := entrada()
	malo.Ficha.DocumentoNumero = "1"
	if _, err := s.CheckIn(ctx, malo, 1, nil); !validacion(err) {
		t.Fatalf("ficha mala: %v", err)
	}
	sinReserva := entrada()
	sinReserva.ReservaID = 0
	if _, err := s.CheckIn(ctx, sinReserva, 1, nil); !validacion(err) {
		t.Fatalf("sin reserva: %v", err)
	}
	sinHab := entrada()
	sinHab.HabitacionID = 0
	if _, err := s.CheckIn(ctx, sinHab, 1, nil); !validacion(err) {
		t.Fatalf("sin habitación: %v", err)
	}
	if len(repo.llamadas) != 0 {
		t.Fatalf("no debió tocar la base: %v", repo.llamadas)
	}
}

func TestCheckInUnaReservaDeOtroHotelSeComportaComoInexistente(t *testing.T) {
	s, repo, _ := armar()
	repo.sede = 2
	if _, err := s.CheckIn(ctx, entrada(), 1, []int64{1}); !errors.Is(err, ErrNoEncontrada) {
		t.Fatalf("err = %v", err)
	}
	if _, err := s.CheckIn(ctx, entrada(), 1, []int64{}); !errors.Is(err, ErrNoEncontrada) {
		t.Fatalf("sin hoteles asignados: %v", err)
	}
	if len(repo.llamadas) != 0 {
		t.Fatal("no debe registrar nada fuera de su alcance")
	}
}

func TestCheckInTraduceLasReglasDeLaBase(t *testing.T) {
	casos := map[string]error{
		"cancelada":     ErrReservaNoConfirmada,
		"ya registrada": ErrYaRegistrada,
		"temprano":      ErrFueraDeFechas{Entrada: hoy.Mas(2), Salida: hoy.Mas(4)},
		"tarde":         ErrFueraDeFechas{Entrada: hoy.Mas(-5), Salida: hoy.Mas(-1)},
		"sucia":         ErrHabitacionNoApta{Motivo: "la 101 está sucia"},
	}
	for nombre, e := range casos {
		s, repo, bit := armar()
		repo.errCheckIn = e
		if _, err := s.CheckIn(ctx, entrada(), 1, nil); !conflicto(err) {
			t.Errorf("%s: err = %v; quiero un conflicto", nombre, err)
		}
		if len(bit.eventos) != 0 {
			t.Errorf("%s: un check-in que no se hizo no se audita", nombre)
		}
	}
}

func TestCheckInAudita_SinElNumeroCompletoDelDocumento(t *testing.T) {
	s, _, bit := armar()
	if _, err := s.CheckIn(ctx, entrada(), 7, nil); err != nil {
		t.Fatal(err)
	}
	if len(bit.eventos) != 1 || bit.eventos[0].UsuarioID != 7 {
		t.Fatalf("%+v", bit.eventos)
	}
	doc, _ := bit.eventos[0].Despues["documento"].(string)
	if doc != "dni *****678" {
		t.Fatalf("documento en la bitácora = %q", doc)
	}
}

func TestCheckOut(t *testing.T) {
	t.Run("audita el cambio", func(t *testing.T) {
		s, _, bit := armar()
		if _, err := s.CheckOut(ctx, 1, 3, nil); err != nil {
			t.Fatal(err)
		}
		if len(bit.eventos) != 1 || bit.eventos[0].Despues["estado"] != "finalizada" {
			t.Fatalf("%+v", bit.eventos)
		}
	})
	t.Run("ya hecho es un conflicto", func(t *testing.T) {
		s, repo, bit := armar()
		repo.errOut = ErrYaFinalizada
		if _, err := s.CheckOut(ctx, 1, 3, nil); !conflicto(err) {
			t.Fatalf("err = %v", err)
		}
		if len(bit.eventos) != 0 {
			t.Fatal("no se audita lo que no pasó")
		}
	})
	t.Run("de otro hotel responde como inexistente", func(t *testing.T) {
		s, repo, _ := armar()
		repo.estancia.SedeID = 2
		if _, err := s.CheckOut(ctx, 1, 3, []int64{1}); !errors.Is(err, ErrNoEncontrada) {
			t.Fatalf("err = %v", err)
		}
		if len(repo.llamadas) != 0 {
			t.Fatal("no debió cerrar nada")
		}
	})
}

func TestFichaRespetaElAlcance(t *testing.T) {
	s, repo, _ := armar()
	repo.estancia.SedeID = 2
	if _, err := s.Ficha(ctx, 1, []int64{1}); !errors.Is(err, ErrNoEncontrada) {
		t.Fatalf("err = %v", err)
	}
	if _, err := s.Ficha(ctx, 1, nil); err != nil {
		t.Fatalf("sin restricción: %v", err)
	}
}
