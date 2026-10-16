package auth

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
)

// MaxPasswordBytes es el máximo que bcrypt procesa (72). Más allá ignora el
// resto en silencio, así que dos claves que difieren solo después del byte 72
// serían "la misma": se rechaza en vez de aceptarla a medias.
const MaxPasswordBytes = 72

// costoBcrypt: ~250 ms por hash en un equipo actual. Es lo que hace caro probar
// claves una por una; bajarlo acelera a quien ataque, no al usuario.
const costoBcrypt = 12

// Bcrypt hashea y compara claves. Cost 0 usa el costo por defecto del sistema;
// las pruebas usan bcrypt.MinCost para no tardar segundos.
type Bcrypt struct{ Cost int }

func NewBcrypt() Bcrypt { return Bcrypt{Cost: costoBcrypt} }

func (b Bcrypt) costo() int {
	if b.Cost == 0 {
		return costoBcrypt
	}
	return b.Cost
}

func (b Bcrypt) Hash(plain string) (string, error) {
	if len(plain) > MaxPasswordBytes {
		return "", errors.New("auth: la clave supera los 72 bytes")
	}
	h, err := bcrypt.GenerateFromPassword([]byte(plain), b.costo())
	if err != nil {
		return "", err
	}
	return string(h), nil
}

// Comparar devuelve nil solo si la clave corresponde al hash. Un hash vacío o
// corrupto es un error (nunca "coincide"): así una cuenta sin clave no entra.
func (Bcrypt) Comparar(hash, plain string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
}
