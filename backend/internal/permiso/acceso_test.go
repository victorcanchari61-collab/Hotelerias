package permiso

import (
	"slices"
	"testing"
	"time"
)

var ahora = time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)

func k(sub string, a Accion) Clave { return Clave{sub, a} }

func rol(claves ...Clave) map[Clave]struct{} {
	m := make(map[Clave]struct{}, len(claves))
	for _, c := range claves {
		m[c] = struct{}{}
	}
	return m
}

func en(d time.Duration) *time.Time { t := ahora.Add(d); return &t }

func TestResolver(t *testing.T) {
	anular := k("reservas.reservas", Anular)
	verNV := k("reservas.reservas", Ver)

	tests := []struct {
		name      string
		acceso    Acceso
		clave     Clave
		permitido bool
		gastar    int64
	}{
		{"sin nada niega", Acceso{}, anular, false, 0},
		{"acceso total puede todo", Acceso{Total: true}, anular, true, 0},
		{"el rol lo cubre", Acceso{DeRoles: rol(anular)}, anular, true, 0},
		{"el rol de otro submódulo no sirve", Acceso{DeRoles: rol(k("restaurantes.comandas", Anular))}, anular, false, 0},
		{"la misma acción en otro submódulo no sirve", Acceso{DeRoles: rol(k("restaurantes.comandas", Ver))}, verNV, false, 0},

		{"excepción permanente", Acceso{Excepciones: []Excepcion{
			{ID: 1, Clave: anular, Vigencia: Permanente},
		}}, anular, true, 0},

		{"excepción temporal vigente", Acceso{Excepciones: []Excepcion{
			{ID: 1, Clave: anular, Vigencia: Temporal, ExpiraEn: en(time.Hour)},
		}}, anular, true, 0},
		{"excepción temporal vencida", Acceso{Excepciones: []Excepcion{
			{ID: 1, Clave: anular, Vigencia: Temporal, ExpiraEn: en(-time.Minute)},
		}}, anular, false, 0},
		{"temporal sin fecha no concede (ante la duda, niega)", Acceso{Excepciones: []Excepcion{
			{ID: 1, Clave: anular, Vigencia: Temporal},
		}}, anular, false, 0},

		{"una vez sin gastar pide gastarse", Acceso{Excepciones: []Excepcion{
			{ID: 7, Clave: anular, Vigencia: UnaVez},
		}}, anular, true, 7},
		{"una vez ya gastada", Acceso{Excepciones: []Excepcion{
			{ID: 7, Clave: anular, Vigencia: UnaVez, Usos: 1},
		}}, anular, false, 0},

		{"revocada no sirve aunque sea permanente", Acceso{Excepciones: []Excepcion{
			{ID: 1, Clave: anular, Vigencia: Permanente, Revocado: true},
		}}, anular, false, 0},
		{"vigencia desconocida niega", Acceso{Excepciones: []Excepcion{
			{ID: 1, Clave: anular, Vigencia: "rara"},
		}}, anular, false, 0},

		// Regla 1: el rol primero, así no se quema el permiso de un solo uso.
		{"el rol gana y la de un solo uso no se gasta", Acceso{
			DeRoles:     rol(anular),
			Excepciones: []Excepcion{{ID: 7, Clave: anular, Vigencia: UnaVez}},
		}, anular, true, 0},

		// Regla 4: entre varias, vale la que no se gasta.
		{"la duradera gana sobre la de un solo uso", Acceso{Excepciones: []Excepcion{
			{ID: 7, Clave: anular, Vigencia: UnaVez},
			{ID: 8, Clave: anular, Vigencia: Permanente},
		}}, anular, true, 0},
		{"la duradera gana aunque venga después en la lista", Acceso{Excepciones: []Excepcion{
			{ID: 8, Clave: anular, Vigencia: Permanente},
			{ID: 7, Clave: anular, Vigencia: UnaVez},
		}}, anular, true, 0},
		{"entre dos de un solo uso se gasta la primera", Acceso{Excepciones: []Excepcion{
			{ID: 7, Clave: anular, Vigencia: UnaVez},
			{ID: 9, Clave: anular, Vigencia: UnaVez},
		}}, anular, true, 7},

		// Ver implícito.
		{"ver sale implícito de cualquier excepción del submódulo", Acceso{Excepciones: []Excepcion{
			{ID: 7, Clave: anular, Vigencia: UnaVez},
		}}, verNV, true, 0},
		{"ver implícito no gasta la de un solo uso", Acceso{Excepciones: []Excepcion{
			{ID: 7, Clave: anular, Vigencia: UnaVez},
			{ID: 8, Clave: verNV, Vigencia: UnaVez},
		}}, verNV, true, 0},
		{"ver implícito no cruza de submódulo", Acceso{Excepciones: []Excepcion{
			{ID: 7, Clave: k("restaurantes.comandas", Anular), Vigencia: Permanente},
		}}, verNV, false, 0},
		{"ver implícito se va con la excepción", Acceso{Excepciones: []Excepcion{
			{ID: 7, Clave: anular, Vigencia: Temporal, ExpiraEn: en(-time.Second)},
		}}, verNV, false, 0},
		{"ver implícito no regala otras acciones", Acceso{Excepciones: []Excepcion{
			{ID: 7, Clave: anular, Vigencia: Permanente},
		}}, k("reservas.reservas", Editar), false, 0},
		{"el rol NO da ver implícito (la matriz lo guarda al editarse)", Acceso{
			DeRoles: rol(anular),
		}, verNV, false, 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.acceso.Resolver(tc.clave, ahora)
			if got.Permitido != tc.permitido || got.GastarID != tc.gastar {
				t.Fatalf("Resolver(%s) = %+v, esperaba permitido=%v gastar=%d",
					tc.clave, got, tc.permitido, tc.gastar)
			}
		})
	}
}

// Claves es lo que ve el frontend; Resolver es lo que aplica el servidor. Si
// divergen, la pantalla mostraría botones que dan 403 (o escondería los que
// funcionan). Se comprueba contra TODO el catálogo.
func TestClavesCoincideConResolver(t *testing.T) {
	accesos := map[string]Acceso{
		"vacío": {},
		"total": {Total: true},
		"rol": {DeRoles: rol(
			k("restaurantes.comandas", Ver), k("restaurantes.comandas", Crear), k("inventario.stock", Ver),
			k("no.existe", Ver), // fila vieja de algo que ya no está en el catálogo
		)},
		"excepciones": {
			DeRoles: rol(k("inventario.stock", Ver)),
			Excepciones: []Excepcion{
				{ID: 1, Clave: k("reservas.reservas", Anular), Vigencia: UnaVez},
				{ID: 2, Clave: k("finanzas.cierres", Confirmar), Vigencia: Temporal, ExpiraEn: en(time.Hour)},
				{ID: 3, Clave: k("rrhh.planilla", Anular), Vigencia: Permanente, Revocado: true},
				{ID: 4, Clave: k("habitaciones.tipos", Editar), Vigencia: UnaVez, Usos: 1},
				{ID: 5, Clave: k("config.accesos", Editar), Vigencia: Temporal, ExpiraEn: en(-time.Hour)},
			},
		},
	}

	for nombre, a := range accesos {
		t.Run(nombre, func(t *testing.T) {
			claves := a.Claves(Permisos, ahora)

			if !slices.Equal(claves, a.Claves(Permisos, ahora)) {
				t.Fatal("el orden no es determinista")
			}

			enLista := make(map[Clave]bool, len(claves))
			for _, c := range claves {
				enLista[c] = true
			}

			for _, c := range Permisos.Claves() {
				if got := a.Resolver(c, ahora).Permitido; got != enLista[c] {
					t.Errorf("%s: Resolver=%v pero Claves lo %s", c, got, map[bool]string{true: "incluye", false: "omite"}[enLista[c]])
				}
			}
			for c := range enLista {
				if !Permisos.EsValido(c) {
					t.Errorf("Claves expone %s, que no existe en el catálogo", c)
				}
			}
		})
	}
}

func TestExcepcionVigente(t *testing.T) {
	tests := []struct {
		e    Excepcion
		want bool
	}{
		{Excepcion{Vigencia: Permanente}, true},
		{Excepcion{Vigencia: Permanente, Revocado: true}, false},
		{Excepcion{Vigencia: UnaVez}, true},
		{Excepcion{Vigencia: UnaVez, Usos: 1}, false},
		{Excepcion{Vigencia: Temporal, ExpiraEn: en(time.Second)}, true},
		{Excepcion{Vigencia: Temporal, ExpiraEn: en(0)}, false}, // vence en el instante exacto
		{Excepcion{Vigencia: Temporal}, false},
	}
	for i, tc := range tests {
		if got := tc.e.Vigente(ahora); got != tc.want {
			t.Errorf("caso %d (%+v): %v, esperaba %v", i, tc.e, got, tc.want)
		}
	}
}

func TestParseClave(t *testing.T) {
	ok, err := ParseClave("reservas.reservas:anular")
	if err != nil || ok != k("reservas.reservas", Anular) {
		t.Fatalf("ParseClave = %v, %v", ok, err)
	}
	for _, mala := range []string{"", "sin-dos-puntos", ":ver", "restaurantes.comandas:"} {
		if _, err := ParseClave(mala); err == nil {
			t.Errorf("ParseClave(%q) debía fallar", mala)
		}
	}
}

// Una excepción de un solo uso sobre "ver" tiene que gastarse: si el "ver"
// implícito la tapara, valdría para siempre.
func TestExcepcionDeUnaVezSobreVerSeGasta(t *testing.T) {
	ahora := time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	ver := Clave{Submodulo: "config.roles", Accion: Ver}
	a := Acceso{Excepciones: []Excepcion{{ID: 7, Clave: ver, Vigencia: UnaVez}}}

	v := a.Resolver(ver, ahora)
	if !v.Permitido || v.GastarID != 7 {
		t.Fatalf("debía permitir gastando la excepción 7: %+v", v)
	}

	// Gastada, ya no sirve.
	a.Excepciones[0].Usos = 1
	if v := a.Resolver(ver, ahora); v.Permitido {
		t.Fatalf("gastada y aún permite: %+v", v)
	}

	// Pero una excepción de OTRA acción del submódulo sí deja ver sin gastar nada.
	b := Acceso{Excepciones: []Excepcion{{ID: 8, Clave: Clave{Submodulo: "config.roles", Accion: Editar}, Vigencia: UnaVez}}}
	if v := b.Resolver(ver, ahora); !v.Permitido || v.GastarID != 0 {
		t.Fatalf("ver implícito no debe gastar: %+v", v)
	}
}
