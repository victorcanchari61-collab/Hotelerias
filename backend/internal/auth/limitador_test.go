package auth

import (
	"fmt"
	"testing"
	"time"
)

func limitadorConReloj(max int, ventana time.Duration) (*Limitador, *time.Time) {
	ahora := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	l := NuevoLimitador(max, ventana)
	l.now = func() time.Time { return ahora }
	return l, &ahora
}

func TestLimitadorBloqueaAlLlegarAlMaximo(t *testing.T) {
	l, _ := limitadorConReloj(3, time.Minute)

	for i := 0; i < 3; i++ {
		if !l.Permitir("k") {
			t.Fatalf("intento %d debía estar permitido", i+1)
		}
		l.Fallo("k")
	}
	if l.Permitir("k") {
		t.Fatal("al tercer fallo debía bloquear")
	}
}

func TestLimitadorEsPorClave(t *testing.T) {
	l, _ := limitadorConReloj(1, time.Minute)
	l.Fallo("a")
	if l.Permitir("a") {
		t.Fatal("a debía estar bloqueada")
	}
	if !l.Permitir("b") {
		t.Fatal("b no debía verse afectada")
	}
}

func TestLimitadorVenceYEmpiezaDeCero(t *testing.T) {
	l, ahora := limitadorConReloj(2, time.Minute)
	l.Fallo("k")
	l.Fallo("k")
	if l.Permitir("k") {
		t.Fatal("debía estar bloqueada")
	}

	*ahora = ahora.Add(61 * time.Second)
	if !l.Permitir("k") {
		t.Fatal("pasada la ventana debía permitir")
	}
	// Un fallo nuevo es el PRIMERO, no el tercero.
	l.Fallo("k")
	if !l.Permitir("k") {
		t.Fatal("un solo fallo tras vencer no debía bloquear")
	}
}

func TestLimitadorExitoReinicia(t *testing.T) {
	l, _ := limitadorConReloj(2, time.Minute)
	l.Fallo("k")
	l.Exito("k")
	l.Fallo("k")
	if !l.Permitir("k") {
		t.Fatal("tras un acierto el conteo debía reiniciarse")
	}
}

func TestLimitadorNoCreceSinLimite(t *testing.T) {
	// Probar miles de correos distintos no debe llenar la memoria para siempre.
	l, ahora := limitadorConReloj(5, time.Minute)
	for i := 0; i < 3000; i++ {
		l.Fallo(fmt.Sprintf("k%d", i))
	}
	*ahora = ahora.Add(2 * time.Minute)
	l.Fallo("nueva") // dispara la purga

	if n := len(l.fallos); n > 10 {
		t.Fatalf("quedaron %d rachas vencidas en memoria", n)
	}
}
