// Package auth emite y valida los JWT y expone quién hace la petición.
//
// Es a propósito mínimo: el token solo dice QUIÉN es (claim "sub"). Qué puede
// hacer se resuelve contra la base en el módulo permiso, para que conceder o
// quitar un permiso surta efecto sin que la persona vuelva a entrar.
package auth

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"hotelerias/backend/config"
)

// ErrTokenInvalido cubre todo lo que haga que un token no sirva (firma, vencido,
// emisor, audiencia, sub ilegible). Al cliente le da igual cuál; es un 401.
var ErrTokenInvalido = errors.New("token inválido")

type Tokens struct {
	secret   []byte
	issuer   string
	audience string
	ttl      time.Duration
	now      func() time.Time
}

func NewTokens(cfg config.JwtSettings) (*Tokens, error) {
	if len(cfg.SecretKey) < 32 {
		return nil, errors.New("auth: la clave JWT necesita al menos 32 bytes")
	}
	if cfg.ExpirationHours <= 0 {
		return nil, errors.New("auth: ExpirationHours debe ser mayor que 0")
	}
	return &Tokens{
		secret:   []byte(cfg.SecretKey),
		issuer:   cfg.Issuer,
		audience: cfg.Audience,
		ttl:      time.Duration(cfg.ExpirationHours) * time.Hour,
		now:      time.Now,
	}, nil
}

// Emitir firma un token para el usuario. Lo usará el login.
func (t *Tokens) Emitir(usuarioID int64) (string, error) {
	now := t.now()
	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(usuarioID, 10),
		Issuer:    t.issuer,
		Audience:  jwt.ClaimStrings{t.audience},
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(t.ttl)),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(t.secret)
}

// Validar devuelve el id del usuario del token, o ErrTokenInvalido.
func (t *Tokens) Validar(raw string) (int64, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(raw, &claims,
		func(*jwt.Token) (any, error) { return t.secret, nil },
		// Fijar el algoritmo evita el ataque de "alg: none" y de cambio de algoritmo.
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(t.issuer),
		jwt.WithAudience(t.audience),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(t.now),
	)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", ErrTokenInvalido, err)
	}

	id, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("%w: sub ilegible", ErrTokenInvalido)
	}
	return id, nil
}
