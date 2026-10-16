package auth

import (
	"sync"
	"time"
)

// Limitador frena los intentos de login fallidos repetidos.
//
// Es en memoria y de ventana fija: no es un WAF, es lo mínimo para que probar
// claves una tras otra contra una cuenta deje de ser gratis. Tras `max` fallos
// seguidos de una misma clave (origen + correo) bloquea hasta que pase la
// ventana; un acierto la reinicia.
//
// Limitaciones a propósito: se pierde al reiniciar el proceso y no se comparte
// entre instancias. Para más de una instancia, esto debe vivir en Redis.
type Limitador struct {
	mu      sync.Mutex
	max     int
	ventana time.Duration
	now     func() time.Time
	fallos  map[string]*racha
}

type racha struct {
	cuenta int
	desde  time.Time
}

func NuevoLimitador(max int, ventana time.Duration) *Limitador {
	return &Limitador{max: max, ventana: ventana, now: time.Now, fallos: make(map[string]*racha)}
}

// Permitir dice si esta clave puede intentar de nuevo.
func (l *Limitador) Permitir(clave string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	r, ok := l.fallos[clave]
	if !ok {
		return true
	}
	if l.now().Sub(r.desde) > l.ventana {
		delete(l.fallos, clave)
		return true
	}
	return r.cuenta < l.max
}

// Fallo anota un intento fallido.
func (l *Limitador) Fallo(clave string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	ahora := l.now()
	l.purgar(ahora)

	r, ok := l.fallos[clave]
	if !ok || ahora.Sub(r.desde) > l.ventana {
		l.fallos[clave] = &racha{cuenta: 1, desde: ahora}
		return
	}
	r.cuenta++
}

// Exito reinicia la cuenta de esa clave.
func (l *Limitador) Exito(clave string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.fallos, clave)
}

// purgar descarta rachas vencidas para que el mapa no crezca sin límite si
// alguien prueba miles de correos distintos. Se llama con el lock tomado.
func (l *Limitador) purgar(ahora time.Time) {
	if len(l.fallos) < 1024 {
		return
	}
	for k, r := range l.fallos {
		if ahora.Sub(r.desde) > l.ventana {
			delete(l.fallos, k)
		}
	}
}
