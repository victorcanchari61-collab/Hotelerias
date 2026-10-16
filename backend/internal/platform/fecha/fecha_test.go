package fecha

import (
	"encoding/json"
	"testing"
	"time"
)

func TestParseEsEstricto(t *testing.T) {
	for _, bueno := range []string{"2026-11-10", "2028-02-29"} {
		if _, err := Parse(bueno); err != nil {
			t.Errorf("%q debía ser válida: %v", bueno, err)
		}
	}
	for _, malo := range []string{"", "10/11/2026", "2026-13-01", "2027-02-29", "2026-11-10T00:00:00Z", "ayer"} {
		if _, err := Parse(malo); err == nil {
			t.Errorf("%q debía rechazarse", malo)
		}
	}
}

func TestNoches(t *testing.T) {
	a, _ := Parse("2026-11-10")
	if n := Noches(a, a.Mas(3)); n != 3 {
		t.Fatalf("noches=%d", n)
	}
	if n := Noches(a, a); n != 0 {
		t.Fatalf("mismo día: %d", n)
	}
	if n := Noches(a.Mas(2), a); n != -2 {
		t.Fatalf("al revés: %d", n)
	}
}

func TestNochesAtraviesaElCambioDeHorario(t *testing.T) {
	// En zonas con horario de verano un "día" puede durar 23 o 25 horas. Como la
	// fecha es siempre UTC a medianoche, contar noches no se desfasa.
	a, _ := Parse("2026-03-07")
	if n := Noches(a, a.Mas(10)); n != 10 {
		t.Fatalf("noches=%d", n)
	}
}

func TestJSON(t *testing.T) {
	type caja struct {
		Desde Fecha  `json:"desde"`
		Hasta *Fecha `json:"hasta"`
	}
	f, _ := Parse("2026-11-10")
	raw, err := json.Marshal(caja{Desde: f})
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != `{"desde":"2026-11-10","hasta":null}` {
		t.Fatalf("raw=%s", raw)
	}

	var c caja
	if err := json.Unmarshal([]byte(`{"desde":"2026-12-24","hasta":"2026-12-26"}`), &c); err != nil {
		t.Fatal(err)
	}
	if c.Desde.String() != "2026-12-24" || c.Hasta == nil || c.Hasta.String() != "2026-12-26" {
		t.Fatalf("%+v", c)
	}
	if err := json.Unmarshal([]byte(`{"desde":"mañana"}`), &c); err == nil {
		t.Fatal("una fecha mala debía fallar")
	}
	if err := json.Unmarshal([]byte(`{"desde":20261110}`), &c); err == nil {
		t.Fatal("un número no es una fecha")
	}
}

func TestDeTiempoUsaLaZonaDada(t *testing.T) {
	lima := time.FixedZone("PET", -5*3600)
	// 03:00 UTC del día 11 todavía es la noche del 10 en Lima.
	instante := time.Date(2026, 11, 11, 3, 0, 0, 0, time.UTC).In(lima)
	if got := DeTiempo(instante).String(); got != "2026-11-10" {
		t.Fatalf("got=%s", got)
	}
}

func TestComparaciones(t *testing.T) {
	a, _ := Parse("2026-11-10")
	b := a.Mas(1)
	if !a.Antes(b) || !b.Despues(a) || a.Igual(b) || !a.Igual(a.Mas(0)) {
		t.Fatal("comparaciones")
	}
	var cero Fecha
	if !cero.IsZero() || cero.String() != "" {
		t.Fatal("el valor cero es 'sin fecha'")
	}
}
