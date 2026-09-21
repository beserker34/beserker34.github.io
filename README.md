# 4PR3ND1Z — Portafolio

Portafolio de seguridad ofensiva (writeups HTB + certs + stats). Construido con **Astro**.
Diseño dark-púrpura, sin dependencias de terceros en runtime.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # genera /dist
npm run preview  # previsualiza el build
```

## Estructura

```
src/
├─ content/writeups/     # UN .md por máquina  <-- aquí van tus writeups
│  └─ lame.md            # ejemplo migrado desde Notion
├─ components/           # Hero, Metrics, Certs, Contact, Nav
├─ layouts/Base.astro    # <head>, fuentes
├─ pages/
│  ├─ index.astro        # home (lista writeups)
│  └─ writeups/[...slug].astro   # página de cada writeup
└─ styles/global.css     # sistema de diseño (paleta, tipografía)
public/
├─ favicon.svg
└─ cv.pdf                # <-- coloca aquí tu CV
```

## Añadir un writeup

1. Crea `src/content/writeups/<maquina>.md`.
2. Rellena el frontmatter (copia el de `lame.md`):

```yaml
---
title: "Nombre — HackTheBox Writeup"
machine: "Nombre"
os: "Linux"            # Linux | Windows | Other
difficulty: "Easy"     # Easy | Medium | Hard | Insane | Unknown
tags: ["Samba", "RCE"]
date: 2026-04-29
summary: "Una línea que resume la máquina."
draft: false           # true = no se publica todavía
---
```

3. Pega el contenido en Markdown debajo. El sitio lo renderiza solo.

> **Imágenes:** las capturas exportadas de Notion usan URLs firmadas que expiran.
> Descárgalas y guárdalas en `public/img/<maquina>/` y referéncialas como
> `![alt](/img/<maquina>/1.png)`.

## Despliegue (GitHub Pages)

El workflow `.github/workflows/deploy.yml` construye y publica en cada push a `main`.

1. Sube el repo a GitHub.
2. Settings → Pages → Source: **GitHub Actions**.
3. Ajusta `astro.config.mjs`:
   - Dominio propio → `base: '/'`, `site: 'https://tudominio.dev'`.
   - `usuario.github.io/repo` → `base: '/repo/'`, `site: 'https://usuario.github.io'`.

## Personalizar

- **Colores/tipografía:** `src/styles/global.css` (bloque `:root`).
- **Stats HTB:** `src/components/Metrics.astro`.
- **Certs:** `src/components/Certs.astro`.
- **Enlaces:** `src/components/Contact.astro`.
