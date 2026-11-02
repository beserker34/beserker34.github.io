---
name: 'Portfolio & writeup engine'
tagline: 'Static site that turns markdown writeups into a browsable archive'
stack: ['Astro', 'TypeScript', 'Zod', 'CSS', 'GitHub Actions']
status: 'shipped'
repo: 'https://github.com/beserker34/beserker34.github.io'
demo: 'https://beserker34.github.io'
date: 2026-09-21
featured: true
highlights:
  - 'Typed content collections: every writeup is validated against a Zod schema at build time, so a malformed frontmatter fails the build instead of shipping broken'
  - 'Hand-rolled i18n with no dependencies — one pass over the DOM, two ways to declare a string, EN/ES persisted in localStorage'
  - '30 pages generated from markdown and deployed on every push via GitHub Actions'
---

Este sitio. Lo construí para dejar de tener los writeups encerrados en Notion y
poder publicarlos como un archivo navegable.

Lo interesante no es el diseño, es el pipeline: cada writeup es un `.md` con
frontmatter tipado. Si me equivoco escribiendo un campo —una dificultad que no
existe, una fecha mal puesta— el build falla antes de publicar nada, en vez de
dejar una página rota en producción.
