# Pádel (4 jugadores) — Generador con historial compartido

Este generador crea el próximo partido para 4 jugadores:

- Evita repetir el mismo partido “full” (parejas + Drive/Revés) demasiado seguido.
- Intenta que ningún jugador repita lado (Drive/Revés) respecto al último partido.
- Mantiene un ciclo de 12 combinaciones (3 parejas × 2 posiciones × 2 posiciones).
- Guarda un historial compartido en Supabase (últimos 8 partidos).

## Historial compartido (Supabase)

La versión web guarda el estado/historial en Supabase (gratis), así todos ven lo mismo.

1) Crear proyecto en Supabase
- Dashboard → New project

2) Crear tabla + policies
- Abrí SQL Editor y ejecutá: `supabase.sql`

3) Configurar la app
- Editá `main.ts` y completá:
	- `SUPABASE_URL`
	- `SUPABASE_ANON_KEY`
	- `GROUP_ID` (un nombre de “sala” para compartir)

Nota: es una app “simple”: cualquiera que tenga la URL + anon key + group_id puede modificar el estado.

## Uso

### Local

Desde esta carpeta:

- `npm install`
- `npm run build`
- `npm run serve`

Abrí `http://localhost:5173` y cargá los 4 nombres.

## Hosting gratuito (recomendado)

### GitHub Pages (estático) + Supabase (estado)

1) Subí esta carpeta (`docs/padel-pairs/`) como un repo independiente.
2) Corré `npm install && npm run build` y comiteá el archivo generado `main.js`.
3) En GitHub: Settings → Pages
	- Build and deployment → Deploy from a branch
	- Branch: `main` (o la que uses)
	- Folder: `/ (root)`

La página publica `index.html` que carga `main.js`.

Alternativas similares: Cloudflare Pages / Netlify / Vercel (también sirven para HTML estático).

## Notas

- Si cambian los 4 jugadores, la app resetea el ciclo/historial automáticamente.
- Para evitar duplicados, usá siempre los mismos nombres (mayúsculas/minúsculas no importan).
