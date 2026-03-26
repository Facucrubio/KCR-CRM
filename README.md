# KCR CRM

Base inicial de un CRM interno para seguimiento de ventas con dos objetos principales:

- `clients`
- `opportunities`

La app esta armada con `TypeScript + Vite` y pensada para correr sobre `Node.js`. Incluye una UI inicial en frontend y una migracion SQL para Supabase.

## Funcionalidades iniciales

- Alta de clientes con datos de contacto.
- Alta de oportunidades vinculadas a un cliente.
- Stages de venta: `lead`, `qualified`, `proposal`, `negotiation`, `won`, `lost`.
- Dashboard con cantidad y monto por stage.
- Busqueda y filtro por stage.
- Persistencia local con `localStorage` para pruebas rapidas.
- SQL listo para crear tablas reales en Supabase.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Supabase

La migracion base esta en:

`supabase/migrations/20260326183000_init_crm.sql`

Incluye:

- Tipo enum para stages.
- Tabla `public.clients`.
- Tabla `public.opportunities`.
- Relacion `opportunities.client_id -> clients.id`.
- Indices para busqueda y pipeline.
- Trigger `updated_at`.
- Datos semilla.

## Siguiente paso sugerido

El frontend actual usa `localStorage` para no bloquear el arranque. El siguiente paso natural es conectar la app a Supabase con:

1. Lectura real de `clients` y `opportunities`.
2. Insercion y actualizacion desde formularios.
3. Auth para uso interno.
4. Historial de actividades o tareas por oportunidad.
