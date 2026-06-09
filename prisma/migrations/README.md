# Migraciones

El historial se **rebaseó a una baseline única** (`00000000000000_init`) generada
desde `prisma/schema.prisma` con:

```
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

## Por qué

Las migraciones anteriores rompían `prisma migrate dev`/`migrate deploy`:
- `20260429120000_add_dashboard_filter_indexes` usaba `CREATE INDEX CONCURRENTLY`,
  ilegal dentro de la transacción que Prisma usa por migración (falla en la shadow DB).
- `20260409154330_add_permiso_seccion_usuario` chocaba con una tabla preexistente (42P07).

La baseline generada por Prisma es limpia (sin `CONCURRENTLY`), así que `migrate dev`
vuelve a funcionar para desarrollo local. Las migraciones viejas quedan en el historial de git.

## Cómo aplicar la baseline en una base ya existente

La base ya tiene el esquema; **no** hay que re-ejecutar la baseline, solo marcarla aplicada:

```
npx prisma migrate resolve --applied 00000000000000_init
```

(Si la base ya tenía registros de migraciones viejas en `_prisma_migrations`, se hizo
`TRUNCATE` de esa tabla de tracking —no toca datos— antes del `resolve`.)

## Producción

Producción **no usa migraciones**: `scripts/update.sh` sincroniza con
`prisma db push --schema ./prisma/schema.prisma`. Este rebase no afecta producción.
