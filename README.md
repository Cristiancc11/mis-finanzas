# FinanzasPro

Dashboard financiero personal — https://finanzaspro.com.co

## Desarrollo

```bash
npm ci            # instala dependencias fijadas (package-lock.json)
npm run build     # genera dist/ (minificado, con hash, librerías autohospedadas)
npm run preview   # sirve dist/ en http://localhost:4173
npm run check     # node --check app/app.js
```

El código fuente sigue siendo `index.html` (landing), `app/` (la aplicación) y `assets/img/`.
**Lo que se publica es `dist/`**, nunca edites ese directorio.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html`, `contacto.html`, `privacidad.html`, `terminos.html` | Landing y páginas legales |
| `app/index.html`, `app/app.js`, `app/styles.css` | La aplicación |
| `app/lazy-libs.js` | Carga bajo demanda de Excel, PDF.js y jsPDF |
| `assets/img/` | Imágenes (WebP) y favicons |
| `public/` | `_headers` (seguridad y caché), `robots.txt`, `sitemap.xml` |
| `scripts/build.mjs` | Build: minifica, pone hash a los archivos y verifica referencias |

## Despliegue

- **GitHub Pages:** Settings → Pages → *Build and deployment* → Source: **GitHub Actions**. Cada push a `main` ejecuta `.github/workflows/deploy.yml`.
- **Cloudflare Pages / Netlify (recomendado):** comando de build `npm run build`, directorio de salida `dist`. Aplican `public/_headers` (HSTS, CSP, caché).
