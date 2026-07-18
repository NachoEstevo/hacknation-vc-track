# undr

undr es un prototipo de sourcing e inteligencia para VC basado en evidencia. Parte de una tesis escrita en lenguaje natural, busca primero dentro del conocimiento disponible y conserva el razonamiento como datos estructurados: proyecto, claims, evidencia, fuente, confianza, contradicciones y preguntas abiertas.

El foco de esta entrega es el recorrido de Investor / VC. El flujo de Founder / Builder aparece como siguiente etapa, pero todavía no está implementado de punta a punta.

## Recorrido VC disponible

1. `/` — landing y brief inicial de sourcing.
2. `/onboarding/role` — selección del workspace.
3. `/onboarding/investor` — construcción editable de tesis, señales, exclusiones, geografía, etapa y rango de cheque.
4. `/investor` — inicio del workspace y resumen de las fuentes internas.
5. `/investor/search` — búsqueda y ranking explicable por ajuste a tesis y cobertura de evidencia.
6. `/investor/projects/:id` y `/investor/projects/:id/evidence` — ficha del proyecto, claims, fuentes, confianza, contradicciones y próximos pasos de diligence.
7. `/investor/compare` y `/investor/projects/:id/memo` — comparación de hasta tres proyectos y memo con citas.
8. `/investor/pipeline`, `/investor/saved-searches` y `/investor/founders/:id/invite` — seguimiento, búsquedas guardadas e invitación controlada al founder.

En modo demo, pipeline, comparación, búsquedas guardadas y preferencias del workspace se conservan en `localStorage` del navegador. No son persistencia multiusuario ni una base de datos productiva.

Los briefs y consultas activas viajan entre pantallas mediante una `SearchSession` validada en `sessionStorage`, no mediante parámetros `?q=`. Cada búsqueda guardada conserva también el snapshot estructurado de sus criterios, para que reabrirla no la reinterprete silenciosamente con una tesis distinta.

## Fuentes de datos y etiquetas

La interfaz mantiene dos universos explícitamente separados:

- `clay_csv · unverified`: catálogo real de 50 empresas en `data/source/clay-companies.csv`. Son registros públicos normalizados para discovery; sus descripciones, dominios, tamaños y URLs no constituyen evidencia de inversión verificada. Los candidatos a founder del piloto siguen marcados como `candidate_only` hasta confirmación.
- `synthetic_demo`: seis oportunidades ficticias, con claims, evidencia y contradicciones construidos únicamente para poder recorrer búsqueda, comparación, memo y pipeline. No representan empresas ni resultados reales.

La ausencia de evidencia permanece como **desconocida**: no se transforma en una señal negativa. El ajuste a tesis y la cobertura de evidencia son medidas separadas, no un score universal de calidad o recomendación de inversión.

## Ejecutar localmente

Requisitos:

- Node.js 22 o superior.
- npm con soporte para workspaces.

Desde la raíz del repo:

```bash
npm install
cp .env.example apps/web/.env.local
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). `NEXT_PUBLIC_DEMO_MODE=true` viene configurado por defecto, por lo que el recorrido funciona sin Supabase ni otras credenciales.

Comandos principales:

```bash
npm run dev        # Next.js en desarrollo
npm run build      # build de producción local
npm run start      # sirve el último build en http://localhost:3000
npm run lint       # ESLint
npm run typecheck  # TypeScript en todos los workspaces
npm run test       # Vitest en todos los workspaces
npm run check      # lint + typecheck + tests + build
```

## Variables de entorno

`.env.example` contiene solamente nombres y valores seguros de ejemplo:

| Variable | Uso actual |
| --- | --- |
| `NEXT_PUBLIC_DEMO_MODE` | `true` mantiene el prototipo local; usar `false` para habilitar el adaptador de Supabase si también existen sus dos variables públicas. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública de un proyecto Supabase propio. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key pública. Nunca usar una service-role key en una variable `NEXT_PUBLIC_*`. |
| `GITHUB_TOKEN` | Opcional y solo server-side; aumenta el margen de la API pública de GitHub. |
| `OPENAI_API_KEY` | Reservada para una integración futura; el recorrido actual no la requiere. |

No agregues secretos al repo. La pantalla de sign-in todavía omite la creación de cuenta en modo prototipo, y la UI no escribe el flujo VC en Supabase por defecto.

## Supabase opcional

El repo incluye dos migraciones:

- `supabase/migrations/20260718190000_data_core.sql` — empresas, fuentes, founders, identidades, relaciones, evidencia y ejecuciones de enriquecimiento.
- `supabase/migrations/20260718203859_product_platform_core.sql` — perfiles, roles de producto, proyectos, tesis, claims, búsquedas, evaluaciones, pipeline, watchlist, memos, invitaciones, eventos y políticas RLS.

Para preparar un backend propio, instalá el Supabase CLI, vinculá explícitamente tu proyecto y aplicá las migraciones:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Luego configurá `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `apps/web/.env.local`. Esto habilita los clientes SSR y la renovación de sesión; no convierte automáticamente el estado local del prototipo en persistencia real ni completa el flujo de autenticación.

## Enriquecimiento público de GitHub

El endpoint server-side acepta una cuenta pública y hasta 20 repositorios:

```bash
curl -X POST http://localhost:3000/api/enrichment/github \
  -H 'Content-Type: application/json' \
  -d '{"login":"octocat","maxRepositories":5}'
```

`GITHUB_TOKEN` es opcional; sin token se aplican los límites públicos más bajos de GitHub. La respuesta no se persiste por sí sola y representa únicamente observaciones públicas capturadas en ese momento. No verifica identidad del founder, vínculo con una empresa, ownership, tracción ni calidad del código.

## Estructura del monorepo

```text
apps/web/              Next.js App Router, UI, rutas y adaptadores server-side
packages/data-core/    normalización, deduplicación e importación reproducible
data/                  snapshots reales y pilotos con estado de verificación
supabase/migrations/   esquema SQL y RLS opcionales
docs/                  decisiones de producto y pipeline de datos
undr.pen               fuente visual de referencia
```

No se presupone un deploy activo. El estado reproducible de este repositorio es el prototipo local descrito arriba.
