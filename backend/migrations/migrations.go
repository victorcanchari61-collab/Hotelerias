// Package migrations embebe los .sql para que el binario los lleve consigo.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
