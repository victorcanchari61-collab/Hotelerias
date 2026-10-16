package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// ErrCuentaInexistente es lo que un Buscador devuelve cuando no hay cuenta con
// ese correo. Se traduce al mismo ErrCredenciales que una clave mala.
var ErrCuentaInexistente = errors.New("auth: cuenta inexistente")

// Credencial es lo mínimo que hace falta saber de una cuenta para decidir si
// entra: sirve igual para el personal y para el huésped.
type Credencial struct {
	ID           int64
	PasswordHash string
	Activo       bool
}

// Buscador encuentra la credencial de un correo.
type Buscador func(ctx context.Context, email string) (Credencial, error)

// Verificador decide si unas credenciales son correctas. Es la parte delicada
// del login (tiempos, enumeración, fuerza bruta) y por eso vive UNA sola vez: el
// personal y el huésped la comparten en vez de copiarla.
type Verificador struct {
	hasher    Hasher
	limitador *Limitador
	// ambito separa las cuentas de personal de las de huéspedes en el limitador:
	// el mismo correo en las dos tablas no debe compartir contador.
	ambito string

	// hashFalso se compara cuando el correo NO existe, para que responder "no
	// existe" tarde lo mismo que responder "clave incorrecta". Sin esto el
	// tiempo de respuesta delata qué correos están registrados.
	hashFalso string
}

func NewVerificador(hasher Hasher, limitador *Limitador, ambito string) (*Verificador, error) {
	falso, err := hasher.Hash("hotelerias-clave-que-no-pertenece-a-nadie")
	if err != nil {
		return nil, fmt.Errorf("auth: preparando el hash de relleno: %w", err)
	}
	return &Verificador{hasher: hasher, limitador: limitador, ambito: ambito, hashFalso: falso}, nil
}

// Verificar devuelve el id de la cuenta si el correo y la clave son correctos.
// `origen` (la IP) entra en la clave del limitador junto con el correo.
//
// Errores: ErrCredenciales, ErrCuentaInactiva, ErrDemasiadosIntentos, o un error
// de infraestructura (que NO se disfraza de "clave incorrecta").
func (v *Verificador) Verificar(ctx context.Context, origen, email, password string, buscar Buscador) (int64, error) {
	email = strings.TrimSpace(email)

	// Vacío o más largo de lo que bcrypt procesa: no puede ser una clave válida.
	// Mismo error que cualquier otra credencial mala.
	if email == "" || password == "" || len(password) > MaxPasswordBytes {
		return 0, ErrCredenciales
	}

	clave := v.ambito + "|" + origen + "|" + strings.ToLower(email)
	if !v.limitador.Permitir(clave) {
		return 0, ErrDemasiadosIntentos
	}

	cred, err := buscar(ctx, email)
	switch {
	case errors.Is(err, ErrCuentaInexistente):
		_ = v.hasher.Comparar(v.hashFalso, password) // gastar el mismo tiempo
		v.limitador.Fallo(clave)
		return 0, ErrCredenciales
	case err != nil:
		return 0, fmt.Errorf("auth: buscando la cuenta: %w", err)
	}

	if err := v.hasher.Comparar(cred.PasswordHash, password); err != nil {
		v.limitador.Fallo(clave)
		return 0, ErrCredenciales
	}

	// Recién con la clave correcta se dice que la cuenta está desactivada: así
	// quien ataca no puede usar este mensaje para saber qué cuentas existen.
	if !cred.Activo {
		return 0, ErrCuentaInactiva
	}

	v.limitador.Exito(clave)
	return cred.ID, nil
}
