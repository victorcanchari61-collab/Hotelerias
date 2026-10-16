package rol

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/permiso"
	"hotelerias/backend/internal/platform/httpx"
)

type repoFalso struct {
	roles    map[int64]Rol
	sig      int64
	matrices map[int64][]permiso.Clave
}

func nuevoRepo() *repoFalso {
	return &repoFalso{
		roles: map[int64]Rol{
			1: {ID: 1, Nombre: "Administrador", Activo: true, DelSistema: true, AccesoTotal: true},
			2: {ID: 2, Nombre: "Recepcionista", Activo: true, DelSistema: true, Permisos: []string{}},
			3: {ID: 3, Nombre: "Housekeeping", Activo: true, Permisos: []string{"habitaciones.estado:ver"}},
		},
		sig:      3,
		matrices: map[int64][]permiso.Clave{},
	}
}

func (r *repoFalso) Listar(context.Context) ([]Rol, error) { return nil, nil }
func (r *repoFalso) PorID(_ context.Context, id int64) (Rol, error) {
	x, ok := r.roles[id]
	if !ok {
		return Rol{}, ErrNoEncontrado
	}
	if m, ok := r.matrices[id]; ok {
		x.Permisos = nil
		for _, c := range m {
			x.Permisos = append(x.Permisos, c.String())
		}
	}
	return x, nil
}
func (r *repoFalso) Crear(_ context.Context, x Rol) (Rol, error) {
	r.sig++
	x.ID = r.sig
	r.roles[x.ID] = x
	return x, nil
}
func (r *repoFalso) Actualizar(_ context.Context, x Rol) error  { r.roles[x.ID] = x; return nil }
func (r *repoFalso) Eliminar(_ context.Context, id int64) error { delete(r.roles, id); return nil }
func (r *repoFalso) ReemplazarPermisos(_ context.Context, id int64, c []permiso.Clave) error {
	r.matrices[id] = c
	return nil
}
func (r *repoFalso) NombreEnUso(_ context.Context, n string, excepto int64) (bool, error) {
	for _, x := range r.roles {
		if strings.EqualFold(x.Nombre, n) && x.ID != excepto {
			return true, nil
		}
	}
	return false, nil
}

type olvidoFalso struct{ ids []int64 }

func (o *olvidoFalso) Olvidar(_ context.Context, id int64) error {
	o.ids = append(o.ids, id)
	return nil
}

type bitacora struct{ eventos []auditoria.Evento }

func (b *bitacora) Registrar(_ context.Context, e auditoria.Evento) { b.eventos = append(b.eventos, e) }

func armar() (*Servicio, *repoFalso, *olvidoFalso, *bitacora) {
	repo, olv, bit := nuevoRepo(), &olvidoFalso{}, &bitacora{}
	return NewServicio(repo, permiso.Permisos, olv, bit), repo, olv, bit
}

func esConflicto(err error) bool {
	var c httpx.Conflicto
	return errors.As(err, &c)
}

func esValidacion(err error) bool {
	var v httpx.Validacion
	return errors.As(err, &v)
}

func TestCrear(t *testing.T) {
	s, _, _, bit := armar()
	ctx := context.Background()

	if _, err := s.Crear(ctx, Entrada{Nombre: "  "}, 9); !esValidacion(err) {
		t.Fatalf("sin nombre: %v", err)
	}
	if _, err := s.Crear(ctx, Entrada{Nombre: "housekeeping"}, 9); !esConflicto(err) {
		t.Fatalf("nombre repetido (sin distinguir mayúsculas): %v", err)
	}

	r, err := s.Crear(ctx, Entrada{Nombre: " Concierge ", Descripcion: "Atención al huésped"}, 9)
	if err != nil {
		t.Fatal(err)
	}
	if r.Nombre != "Concierge" || !r.Activo || r.DelSistema || r.AccesoTotal {
		t.Fatalf("%+v", r)
	}
	if len(bit.eventos) != 1 || bit.eventos[0].Accion != auditoria.Creado || bit.eventos[0].UsuarioID != 9 {
		t.Fatalf("auditoría: %+v", bit.eventos)
	}
}

func TestElRolDeAccesoTotalNoSeDesactiva(t *testing.T) {
	s, repo, _, _ := armar()
	_, err := s.Actualizar(context.Background(), 1, Entrada{Nombre: "Administrador", Activo: false}, 9)
	if !esConflicto(err) {
		t.Fatalf("err=%v", err)
	}
	if !repo.roles[1].Activo {
		t.Fatal("quedó desactivado")
	}
}

func TestRenombrarRegistraSoloLoQueCambio(t *testing.T) {
	s, _, _, bit := armar()
	if _, err := s.Actualizar(context.Background(), 3, Entrada{Nombre: "Limpieza", Activo: true}, 9); err != nil {
		t.Fatal(err)
	}
	if len(bit.eventos) != 1 {
		t.Fatalf("%+v", bit.eventos)
	}
	e := bit.eventos[0]
	if !reflect.DeepEqual(e.Antes, map[string]any{"nombre": "Housekeeping"}) ||
		!reflect.DeepEqual(e.Despues, map[string]any{"nombre": "Limpieza"}) {
		t.Fatalf("antes=%v despues=%v", e.Antes, e.Despues)
	}
}

func TestSinCambiosNoDejaRegistro(t *testing.T) {
	s, _, _, bit := armar()
	_, _ = s.Actualizar(context.Background(), 3, Entrada{Nombre: "Housekeeping", Activo: true}, 9)
	if len(bit.eventos) != 0 {
		t.Fatalf("%+v", bit.eventos)
	}
}

func TestGuardarPermisos(t *testing.T) {
	s, repo, olv, bit := armar()
	ctx := context.Background()

	r, err := s.GuardarPermisos(ctx, 3, []string{
		"reservas.reservas:anular", // implica ver
		"reservas.reservas:volar",  // acción que ese submódulo no admite: se descarta
		"no.existe:ver",            // submódulo inventado: se descarta
		"basura-sin-formato",       // mal formado: se descarta
		"reservas.reservas:anular", // repetido
		"config.usuarios:ver",
	}, 9)
	if err != nil {
		t.Fatal(err)
	}

	quedo := []string{}
	for _, c := range repo.matrices[3] {
		quedo = append(quedo, c.String())
	}
	esperado := []string{"config.usuarios:ver", "reservas.reservas:anular", "reservas.reservas:ver"}
	if !slices.Equal(quedo, esperado) {
		t.Fatalf("quedó %v, esperaba %v", quedo, esperado)
	}
	if len(r.Permisos) != 3 {
		t.Fatalf("%v", r.Permisos)
	}
	if !slices.Equal(olv.ids, []int64{3}) {
		t.Fatalf("no invalidó la caché del rol: %v", olv.ids)
	}
	if len(bit.eventos) != 1 {
		t.Fatalf("auditoría: %+v", bit.eventos)
	}
}

func TestLaMatrizDelRolDeAccesoTotalNoSeConfigura(t *testing.T) {
	s, repo, _, _ := armar()
	_, err := s.GuardarPermisos(context.Background(), 1, []string{"config.usuarios:ver"}, 9)
	if !esConflicto(err) {
		t.Fatalf("err=%v", err)
	}
	if len(repo.matrices[1]) != 0 {
		t.Fatal("se guardó una matriz en el rol de acceso total")
	}
}

func TestEliminar(t *testing.T) {
	s, repo, olv, bit := armar()
	ctx := context.Background()

	if err := s.Eliminar(ctx, 1, 9); !esConflicto(err) {
		t.Fatalf("acceso total: %v", err)
	}
	if err := s.Eliminar(ctx, 2, 9); !esConflicto(err) {
		t.Fatalf("del sistema: %v", err)
	}

	conGente := repo.roles[3]
	conGente.Usuarios = 2
	repo.roles[3] = conGente
	err := s.Eliminar(ctx, 3, 9)
	if !esConflicto(err) || !strings.Contains(err.Error(), "2 usuario") {
		t.Fatalf("con usuarios: %v", err)
	}

	conGente.Usuarios = 0
	repo.roles[3] = conGente
	if err := s.Eliminar(ctx, 3, 9); err != nil {
		t.Fatal(err)
	}
	if _, ok := repo.roles[3]; ok {
		t.Fatal("no se eliminó")
	}
	if len(olv.ids) != 1 || len(bit.eventos) != 1 || bit.eventos[0].Accion != auditoria.Eliminado {
		t.Fatalf("olv=%v bit=%+v", olv.ids, bit.eventos)
	}

	if err := s.Eliminar(ctx, 99, 9); !errors.Is(err, ErrNoEncontrado) {
		t.Fatalf("inexistente: %v", err)
	}
}
