package permiso

import (
	"slices"
	"testing"
)

func TestCatalogoEsConsistente(t *testing.T) {
	if len(Permisos.Submodulos()) != 71 {
		// Si el catálogo cambia a propósito, se actualiza aquí: que no cambie sin
		// que nadie se entere (es la base de los permisos guardados en la base).
		t.Errorf("el catálogo tiene %d submódulos, esperaba 71", len(Permisos.Submodulos()))
	}

	for _, s := range Permisos.Submodulos() {
		if s.Modulo == "" || s.Modulo == s.Clave {
			t.Errorf("%s: el módulo debe salir del prefijo (%q)", s.Clave, s.Modulo)
		}
		if !s.Admite(Ver) {
			// Sin ver la pantalla no se abre y ninguna otra acción sirve.
			t.Errorf("%s no admite 'ver'", s.Clave)
		}
		seen := map[Accion]bool{}
		for _, a := range s.Acciones {
			if seen[a] {
				t.Errorf("%s repite la acción %s", s.Clave, a)
			}
			seen[a] = true
		}
	}
}

// Las formas comunes se comparten entre submódulos: si con() mutara la base,
// agregar "cobrar" a una nota de venta se lo agregaría a todos los documentos.
func TestConNoMutaLaBase(t *testing.T) {
	antes := slices.Clone(documento)
	_ = con(documento, Cobrar)
	_ = con(documento, Eliminar)
	if !slices.Equal(antes, documento) {
		t.Fatalf("con() mutó la base: %v -> %v", antes, documento)
	}

	nv, _ := Permisos.Submodulo("reservas.reservas")
	rec, _ := Permisos.Submodulo("compras.recepciones")
	if !nv.Admite(Cobrar) || rec.Admite(Cobrar) {
		t.Error("cobrar debe estar en notaventa y no en recepciones")
	}
}

func TestEsValido(t *testing.T) {
	validos := []Clave{k("reservas.reservas", Anular), k("config.accesos", Editar), k("inventario.stock", Exportar)}
	for _, c := range validos {
		if !Permisos.EsValido(c) {
			t.Errorf("%s debía ser válido", c)
		}
	}

	invalidos := []Clave{
		k("reservas.reservas", Importar), // la acción existe pero ese submódulo no la admite
		k("inventario.kardex", Anular),   // el kardex no se anula
		k("config.auditoria", Crear),     // la auditoría no se crea
		k("no.existe", Ver),
		k("", Ver),
	}
	for _, c := range invalidos {
		if Permisos.EsValido(c) {
			t.Errorf("%s no debía ser válido", c)
		}
	}
}

func TestModuloDe(t *testing.T) {
	for in, want := range map[string]string{
		"reservas.reservas": "reservas", "config.accesos": "config", "solo": "solo", "": "",
	} {
		if got := ModuloDe(in); got != want {
			t.Errorf("ModuloDe(%q) = %q, esperaba %q", in, got, want)
		}
	}
}
