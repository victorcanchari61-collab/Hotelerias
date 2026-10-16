package permiso

import (
	"slices"
	"time"
)

// Acceso es todo lo que hace falta saber de una persona para decidir lo que
// puede hacer. Es un valor puro: las reglas que lo usan no tocan base ni red,
// así que se prueban sin nada de eso.
type Acceso struct {
	// Total es el rol que no se configura (Administrador): puede todo. Con esto
	// las demás reglas no se consultan.
	Total bool

	// DeRoles es la UNIÓN de los permisos de todos sus roles: tener más roles
	// nunca le quita nada.
	DeRoles map[Clave]struct{}

	// Excepciones son las propias de la persona. Pueden venir vencidas o
	// gastadas: Resolver filtra lo vigente, en un solo sitio.
	Excepciones []Excepcion
}

// Resolver decide si la persona puede hacer c.
//
// El orden importa:
//
//  1. Acceso total, o el rol ya lo cubre. No se toca ninguna excepción: así un
//     permiso de un solo uso no se gasta por algo que la persona podía hacer
//     igual.
//  2. Una excepción duradera (temporal o permanente) vigente sobre c.
//  3. Ver, cuando tiene cualquier excepción vigente sobre ese submódulo: pedir
//     "anular" sin poder abrir la pantalla dejaría el permiso concedido pero
//     inalcanzable. Es implícito y se va con la excepción; no gasta nada.
//  4. Una excepción de un solo uso vigente sobre c. Es lo último: entre varias
//     vale la que no se gasta, para no quemar la que hace falta guardar.
func (a Acceso) Resolver(c Clave, ahora time.Time) Veredicto {
	if a.Total {
		return Veredicto{Permitido: true}
	}
	if _, ok := a.DeRoles[c]; ok {
		return Veredicto{Permitido: true}
	}

	var unica int64
	verImplicito := false
	for _, e := range a.Excepciones {
		if !e.Vigente(ahora) {
			continue
		}
		// Otra excepción del submódulo hace implícito el "ver"; la del propio
		// "ver" NO: si lo hiciera, una excepción de un solo uso sobre "ver"
		// nunca se gastaría y valdría para siempre.
		if e.Clave.Submodulo == c.Submodulo && e.Clave != c {
			verImplicito = true
		}
		if e.Clave != c {
			continue
		}
		if e.Vigencia != UnaVez {
			return Veredicto{Permitido: true}
		}
		if unica == 0 {
			unica = e.ID
		}
	}

	if c.Accion == Ver && verImplicito {
		return Veredicto{Permitido: true}
	}
	if unica != 0 {
		return Veredicto{Permitido: true, GastarID: unica}
	}
	return Veredicto{}
}

// Claves son todos los permisos que la persona tiene ahora, ordenados. Es lo
// que consume el frontend para esconder lo que no se puede abrir.
//
// Coincide por construcción con Resolver: una clave está aquí si y solo si
// Resolver la permite. Lo de un solo uso aparece porque, mientras no se gaste,
// es algo que la persona puede hacer y el botón debe mostrarse.
func (a Acceso) Claves(cat *Catalogo, ahora time.Time) []Clave {
	if a.Total {
		return cat.Claves()
	}

	set := make(map[Clave]struct{}, len(a.DeRoles))
	for c := range a.DeRoles {
		if cat.EsValido(c) { // filas viejas de algo que ya no existe no se exponen
			set[c] = struct{}{}
		}
	}
	for _, e := range a.Excepciones {
		if !e.Vigente(ahora) || !cat.EsValido(e.Clave) {
			continue
		}
		set[e.Clave] = struct{}{}
		set[Clave{e.Clave.Submodulo, Ver}] = struct{}{} // ver implícito
	}

	out := make([]Clave, 0, len(set))
	for c := range set {
		out = append(out, c)
	}
	slices.SortFunc(out, func(x, y Clave) int {
		if x.Submodulo != y.Submodulo {
			return compareStr(x.Submodulo, y.Submodulo)
		}
		return compareStr(string(x.Accion), string(y.Accion))
	})
	return out
}

func compareStr(a, b string) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}
