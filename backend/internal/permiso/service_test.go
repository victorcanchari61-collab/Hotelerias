package permiso

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"
)

// --- fakes ---

type fakeUsuarios struct {
	roles RolesDeUsuario
	err   error
}

func (f fakeUsuarios) RolesDe(context.Context, int64) (RolesDeUsuario, error) { return f.roles, f.err }

type fakeRoles struct {
	porRol map[int64][]Clave
	llamas map[int64]int
	err    error
}

func nuevoFakeRoles(m map[int64][]Clave) *fakeRoles {
	return &fakeRoles{porRol: m, llamas: map[int64]int{}}
}

func (f *fakeRoles) PermisosDeRol(_ context.Context, id int64) ([]Clave, error) {
	f.llamas[id]++
	return f.porRol[id], f.err
}

type fakeExcepciones struct {
	vigentes []Excepcion
	err      error
	llamas   int
}

func (f *fakeExcepciones) VigentesDe(context.Context, int64, time.Time) ([]Excepcion, error) {
	f.llamas++
	return f.vigentes, f.err
}
func (f *fakeExcepciones) Reservar(context.Context, int64) (bool, error) { return true, nil }
func (f *fakeExcepciones) Liberar(context.Context, int64) error          { return nil }

type memCache struct {
	m       map[string][]byte
	borrado []string
}

func nuevaMemCache() *memCache { return &memCache{m: map[string][]byte{}} }
func (c *memCache) Get(_ context.Context, k string) ([]byte, bool) {
	v, ok := c.m[k]
	return v, ok
}
func (c *memCache) Set(_ context.Context, k string, v []byte, _ time.Duration) error {
	c.m[k] = v
	return nil
}
func (c *memCache) Delete(_ context.Context, k string) error {
	delete(c.m, k)
	c.borrado = append(c.borrado, k)
	return nil
}

// --- Service ---

func TestAccesoUnionDeRolesMasExcepciones(t *testing.T) {
	roles := nuevoFakeRoles(map[int64][]Clave{
		1: {k("restaurantes.comandas", Ver), k("restaurantes.comandas", Crear)}, // Vendedor
		2: {k("inventario.stock", Ver), k("restaurantes.comandas", Ver)},        // Almacenero (se solapa)
	})
	exc := &fakeExcepciones{vigentes: []Excepcion{
		{ID: 9, Clave: k("reservas.reservas", Anular), Vigencia: Permanente},
	}}
	svc := NewService(Permisos, fakeUsuarios{roles: RolesDeUsuario{RolIDs: []int64{1, 2}}}, roles, exc)

	mios, err := svc.Mios(context.Background(), 5)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"inventario.stock:ver",
		"reservas.reservas:anular",
		"reservas.reservas:ver", // implícito por la excepción
		"restaurantes.comandas:crear",
		"restaurantes.comandas:ver",
	}
	if !slices.Equal(mios, want) {
		t.Fatalf("Mios = %v\nesperaba %v", mios, want)
	}
}

func TestAccesoTotalNoConsultaNada(t *testing.T) {
	roles := nuevoFakeRoles(nil)
	exc := &fakeExcepciones{}
	svc := NewService(Permisos, fakeUsuarios{roles: RolesDeUsuario{RolIDs: []int64{1}, AccesoTotal: true}}, roles, exc)

	a, err := svc.AccesoDe(context.Background(), 1)
	if err != nil || !a.Total {
		t.Fatalf("acceso=%+v err=%v", a, err)
	}
	if len(roles.llamas) != 0 || exc.llamas != 0 {
		t.Fatal("el administrador no debe disparar más consultas")
	}

	mios, _ := svc.Mios(context.Background(), 1)
	if len(mios) != len(Permisos.Claves()) {
		t.Fatalf("el administrador debe tener TODO: %d de %d", len(mios), len(Permisos.Claves()))
	}
}

func TestSinRolesNiSiquieraExcepcionesSirven(t *testing.T) {
	// Usuario inactivo o inexistente: RolesDe devuelve el valor cero.
	exc := &fakeExcepciones{vigentes: []Excepcion{
		{ID: 1, Clave: k("reservas.reservas", Anular), Vigencia: Permanente},
	}}
	svc := NewService(Permisos, fakeUsuarios{}, nuevoFakeRoles(nil), exc)

	mios, err := svc.Mios(context.Background(), 99)
	if err != nil || len(mios) != 0 {
		t.Fatalf("mios=%v err=%v", mios, err)
	}
	if exc.llamas != 0 {
		t.Fatal("no debía ni consultar excepciones de quien no tiene acceso")
	}
}

func TestMiosNuncaEsNil(t *testing.T) {
	// El front hace new Set(claves): null en JSON sería un problema.
	svc := NewService(Permisos, fakeUsuarios{}, nuevoFakeRoles(nil), &fakeExcepciones{})
	mios, _ := svc.Mios(context.Background(), 1)
	if mios == nil {
		t.Fatal("Mios devolvió nil; debe ser un slice vacío")
	}
}

func TestErroresDeInfraSePropagan(t *testing.T) {
	boom := errors.New("boom")
	casos := map[string]*Service{
		"usuarios":    NewService(Permisos, fakeUsuarios{err: boom}, nuevoFakeRoles(nil), &fakeExcepciones{}),
		"roles":       NewService(Permisos, fakeUsuarios{roles: RolesDeUsuario{RolIDs: []int64{1}}}, &fakeRoles{err: boom, llamas: map[int64]int{}}, &fakeExcepciones{}),
		"excepciones": NewService(Permisos, fakeUsuarios{roles: RolesDeUsuario{RolIDs: []int64{1}}}, nuevoFakeRoles(nil), &fakeExcepciones{err: boom}),
	}
	for nombre, svc := range casos {
		t.Run(nombre, func(t *testing.T) {
			if _, err := svc.AccesoDe(context.Background(), 1); !errors.Is(err, boom) {
				t.Fatalf("err=%v, debía envolver el error original", err)
			}
		})
	}
}

// --- CachedRoles ---

func TestCachedRolesCacheaYOlvida(t *testing.T) {
	origen := nuevoFakeRoles(map[int64][]Clave{1: {k("restaurantes.comandas", Ver)}})
	cache := nuevaMemCache()
	cr := NewCachedRoles(origen, cache)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		claves, err := cr.PermisosDeRol(ctx, 1)
		if err != nil || len(claves) != 1 || claves[0] != k("restaurantes.comandas", Ver) {
			t.Fatalf("vuelta %d: %v, %v", i, claves, err)
		}
	}
	if origen.llamas[1] != 1 {
		t.Fatalf("el origen se consultó %d veces; la caché debía absorber 2", origen.llamas[1])
	}

	// Cambia la matriz y se invalida: lo siguiente va al origen y trae lo nuevo.
	origen.porRol[1] = []Clave{k("restaurantes.comandas", Ver), k("restaurantes.comandas", Anular)}
	if err := cr.Olvidar(ctx, 1); err != nil {
		t.Fatal(err)
	}
	claves, _ := cr.PermisosDeRol(ctx, 1)
	if len(claves) != 2 || origen.llamas[1] != 2 {
		t.Fatalf("claves=%v llamas=%d", claves, origen.llamas[1])
	}
}

func TestCachedRolesCacheaTambienElRolVacio(t *testing.T) {
	// Un rol sin permisos es una respuesta válida: no debe pegarle a la base
	// en cada request solo porque la lista venga vacía.
	origen := nuevoFakeRoles(map[int64][]Clave{})
	cr := NewCachedRoles(origen, nuevaMemCache())
	for i := 0; i < 3; i++ {
		if _, err := cr.PermisosDeRol(context.Background(), 4); err != nil {
			t.Fatal(err)
		}
	}
	if origen.llamas[4] != 1 {
		t.Fatalf("llamas=%d", origen.llamas[4])
	}
}

func TestCachedRolesEntradaCorruptaSeIgnora(t *testing.T) {
	origen := nuevoFakeRoles(map[int64][]Clave{1: {k("inventario.stock", Ver)}})
	cache := nuevaMemCache()
	cache.m[llaveRol(1)] = []byte("esto no es json")

	claves, err := NewCachedRoles(origen, cache).PermisosDeRol(context.Background(), 1)
	if err != nil || len(claves) != 1 {
		t.Fatalf("claves=%v err=%v", claves, err)
	}
	// Y la corrige.
	if string(cache.m[llaveRol(1)]) != `["inventario.stock:ver"]` {
		t.Fatalf("no reescribió la entrada: %s", cache.m[llaveRol(1)])
	}
}

func TestCachedRolesNoCacheaErrores(t *testing.T) {
	origen := &fakeRoles{err: errors.New("boom"), llamas: map[int64]int{}}
	cache := nuevaMemCache()
	if _, err := NewCachedRoles(origen, cache).PermisosDeRol(context.Background(), 1); err == nil {
		t.Fatal("debía propagar el error")
	}
	if len(cache.m) != 0 {
		t.Fatal("un error no debe quedar cacheado")
	}
}
