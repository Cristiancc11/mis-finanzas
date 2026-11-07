# Mejoras aplicadas (rama `mejoras/rendimiento-seguridad`)

## Rendimiento
- Imágenes base64 incrustadas → archivos WebP reales (landing 993 KB → 45 KB; páginas legales 311 KB → ~7-13 KB cada una). Capturas con `srcset` 800/1600 y carga diferida.
- Fin del `Date.now()` en `app.js`/`styles.css` (descargaba >1 MB en cada visita): ahora archivos con hash en el nombre y caché inmutable de 1 año.
- `app.js` 716 KB → 442 KB (110 KB gzip); `styles.css` 258 KB → 104 KB (18 KB gzip).
- Excel, PDF.js y jsPDF ya no se descargan al abrir la app: se cargan solo al importar un extracto o exportar un reporte.
- Scripts con `defer` (no bloquean el pintado).

## Seguridad
- **pdf.js 3.11.174 → 6.5.438**: corrige la ejecución de JS al abrir un PDF malicioso (CVE-2024-4367). Es la mejora más importante: la app procesa PDFs subidos.
- jsPDF 2.5.1 → 4.2.1, jspdf-autotable 3.8.0 → 5.0.9, Chart.js 4.4.0 → 4.6.1 (supabase-js se mantiene en 2.110.7).
- Librerías autohospedadas con versiones fijadas en `package-lock.json` (antes: CDN sin `integrity`).
- Corregida una inyección en `onclick` con nombres de personas, categorías y rutas de archivos: `esc()` dentro de un `onclick` no protege (el navegador decodifica `&#39;` antes de ejecutar el JS). Nuevo helper `jsq()`. Efecto visible: los botones ya funcionan con nombres como "D'Angelo".
- `escapeHTML` ahora también escapa la comilla simple.
- `public/_headers`: HSTS, nosniff, Referrer-Policy, Permissions-Policy y CSP **en modo reporte**.

## SEO / compartir
- `og:image` real (antes era un SVG en base64 que WhatsApp/Facebook/LinkedIn no muestran) y metaetiquetas Open Graph + Twitter en la landing (no tenía). `robots.txt`, `sitemap.xml`, canonical.

## Pendiente — lo que debes hacer tú
1. **Revisar RLS en Supabase** (SQL Editor). Es la defensa real de los datos de cada usuario:
   ```sql
   select c.relname as tabla, c.relrowsecurity as rls_activo
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' order by 1;

   select tablename, policyname, cmd, roles, qual, with_check
   from pg_policies where schemaname = 'public' order by 1, 2;

   select id, name, public from storage.buckets;           -- el bucket de documentos NO debe ser público
   select policyname, cmd, qual from pg_policies where schemaname = 'storage' and tablename = 'objects';
   ```
   Esperado: `rls_activo = true` en `dashboard_data`, `user_profiles`, `user_documents`, y políticas con `auth.uid() = user_id` (USING y WITH CHECK).
2. **`xlsx` sigue en 0.18.5 (vulnerable, npm ya no publica correcciones).** Riesgo bajo (solo se parsean archivos que el propio usuario sube) pero conviene actualizar. En tu máquina: `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` y `npm run build` (el build toma el archivo de node_modules). No pude hacerlo desde aquí porque esa URL no es accesible.
3. **Probar en el navegador antes de publicar** (yo probé arranque y carga bajo demanda en un DOM simulado, no en un navegador real):
   - Login/registro y Google OAuth, y que la sesión de la landing pase a `/app`.
   - Importar extracto PDF, CSV y Excel (confirma que pdf.js 6 lee bien tus bancos).
   - Exportar reporte PDF mensual y anual (jsPDF 4).
   - Gráficas (Chart.js 4.6) y sección "Me deben" con una persona con apóstrofe en el nombre.
4. **Activar la CSP**: despliega, abre la app con F12 → Consola, navega por todo; si no hay avisos "Content-Security-Policy-Report-Only", renombra el header a `Content-Security-Policy`. Requiere hosting con headers (Cloudflare Pages/Netlify); GitHub Pages los ignora.
5. Verificar que no se perdió contenido: compara landing y app (`npm run build && npm run preview`).

## Siguiente fase (no incluida)
Los 221 `onclick` inline y los 177 `innerHTML` impiden una CSP estricta (hoy requiere `'unsafe-inline'`). El siguiente paso es migrar a módulos ES con `addEventListener`, tipado con TypeScript y partir `app.js` por secciones; luego pasar `dashboard_data` (un JSON por usuario) a tablas relacionales, y el rediseño.
