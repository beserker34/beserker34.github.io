---
title: "Lame"
machine: "Lame"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["CVE", "Samba", "SMB", "RCE", "Privesc"]
retired: true
summary: "como siempre iniciamos con un escaneo de puertos"
draft: false
---
# Enumeracion

como siempre iniciamos con un escaneo de puertos 

![image.png](/img/lame/1.png)

los puertos descubiertos son 21,22,139,445,3632 procedere a hacer unn escaneo de versiones y scripts basicos 

```jsx
❯ sudo nmap 10.129.29.167 -p 21,22,139,445,3632 -Pn -n -sCV -oN targeted
Starting Nmap 7.99 ( https://nmap.org ) at 2026-04-29 17:41 -0400
Nmap scan report for 10.129.29.167
Host is up (0.063s latency).

PORT     STATE SERVICE     VERSION
21/tcp   open  ftp         vsftpd 2.3.4
|_ftp-anon: Anonymous FTP login allowed (FTP code 230)
| ftp-syst: 
|   STAT: 
| FTP server status:
|      Connected to 10.10.15.254
|      Logged in as ftp
|      TYPE: ASCII
|      No session bandwidth limit
|      Session timeout in seconds is 300
|      Control connection is plain text
|      Data connections will be plain text
|      vsFTPd 2.3.4 - secure, fast, stable
|_End of status
22/tcp   open  ssh         OpenSSH 4.7p1 Debian 8ubuntu1 (protocol 2.0)
| ssh-hostkey: 
|   1024 60:0f:cf:e1:c0:5f:6a:74:d6:90:24:fa:c4:d5:6c:cd (DSA)
|_  2048 56:56:24:0f:21:1d:de:a7:2b:ae:61:b1:24:3d:e8:f3 (RSA)
139/tcp  open  netbios-ssn Samba smbd 3.X - 4.X (workgroup: WORKGROUP)
445/tcp  open  netbios-ssn Samba smbd 3.0.20-Debian (workgroup: WORKGROUP)
3632/tcp open  distccd     distccd v1 ((GNU) 4.2.4 (Ubuntu 4.2.4-1ubuntu4))
Service Info: OSs: Unix, Linux; CPE: cpe:/o:linux:linux_kernel

Host script results:
| smb-os-discovery: 
|   OS: Unix (Samba 3.0.20-Debian)
|   Computer name: lame
|   NetBIOS computer name: 
|   Domain name: hackthebox.gr
|   FQDN: lame.hackthebox.gr
|_  System time: 2026-04-29T17:42:06-04:00
|_clock-skew: mean: 2h00m41s, deviation: 2h49m48s, median: 36s
| smb-security-mode: 
|   account_used: guest
|   authentication_level: user
|   challenge_response: supported
|_  message_signing: disabled (dangerous, but default)
|_smb2-time: Protocol negotiation failed (SMB2)

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 55.54 seconds
```

varias cosas interesantes aqui unn resumen 

## 1. Puerto 21: FTP (vsftpd 2.3.4)

Efectivamente está abierto. Lo más importante aquí no es solo que esté abierto, sino la **versión específica** y la configuración:

- **Anonymous FTP login allowed:** El script de Nmap confirma que puedes entrar con el usuario `anonymous` y cualquier contraseña. Esto te permitiría ver si hay archivos expuestos.
- **vsftpd 2.3.4:** Esta versión es famosa en el mundo del pentesting porque contiene un **Backdoor** (puerta trasera) muy conocido. Si se envía un usuario que termine en `:)`, el sistema abre un shell en el puerto 6200.

## 2. Puerto 22: SSH (OpenSSH 4.7p1)

Tienes razón, es una versión extremadamente vieja (data de 2007/2008).

- **Análisis:** Aunque es vieja, SSH suele ser difícil de explotar directamente a menos que haya una vulnerabilidad en la librería (como el caso de Debian OpenSSL y claves débiles). Normalmente, se usa para post-explotación o si consigues credenciales por otro lado.

## 3. Puertos 139 y 445: SMB (Samba 3.0.20)

Este es un **punto crítico**. Nmap ha identificado la versión exacta: `Samba 3.0.20-Debian`.

- **Vulnerabilidad:** Esta versión específica de Samba es vulnerable a un exploit llamado **usermap_script**. Es una vulnerabilidad de ejecución remota de comandos (RCE) que te permite obtener acceso al sistema directamente como `root` sin necesidad de autenticación, aprovechando cómo Samba maneja los nombres de usuario.

## 4. Puerto 3632: distccd v1

Es normal que no lo hayas escuchado; no es un servicio común en entornos modernos.

- **¿Qué es?** `distcc` se utiliza para distribuir la compilación de código fuente a través de varias máquinas en una red para acelerar el proceso.
- **Riesgo:** La versión 1 es muy insegura. Existe un exploit que permite ejecutar comandos arbitrarios porque el servicio no verifica quién le envía tareas para "compilar".

intente enumerar ftp con la null seccion pero no hay nada de valor desde el null

```jsx
❯ ftp 10.129.29.167
Connected to 10.129.29.167.
220 (vsFTPd 2.3.4)
Name (10.129.29.167:kali): anonymous
331 Please specify the password.
Password: 
230 Login successful.
Remote system type is UNIX.
Using binary mode to transfer files.
ftp> ls
229 Entering Extended Passive Mode (|||54388|).
150 Here comes the directory listing.
226 Directory send OK.
ftp> ls -la
229 Entering Extended Passive Mode (|||33813|).
150 Here comes the directory listing.
drwxr-xr-x    2 0        65534        4096 Mar 17  2010 .
drwxr-xr-x    2 0        65534        4096 Mar 17  2010 ..
226 Directory send OK.

```

mientras veo si smb permite seccion nula me pongo a investigar a fondo las vulnerabilidades de esta version de ftp 

### Vulnerabilidad: vsFTPd 2.3.4 - Backdoor Command Execution

- **Descripción:** Esta versión específica del demonio FTP contiene una puerta trasera (backdoor) introducida en el código fuente mediante un compromiso de la cadena de suministro en 2011.
- **Mecanismo:** El backdoor se activa al enviar una cadena de caracteres que contiene una cara sonriente (`:)`) en el nombre de usuario durante el proceso de autenticación.
- **Impacto:** Al detectar el "gatillo" (`:)`), el servidor abre un shell de comandos en el puerto **6200/TCP**, permitiendo la ejecución remota de comandos (RCE) con privilegios de root sin necesidad de una contraseña válida.
- **Identificador:** [CVE-2011-2523](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2011-2523).

![image.png](/img/lame/2.png)

# Explotacion y escalada de privilegios

tambien invetigue la vulnerabilidad de smb samba esto me dio acceso directo como root

![image.png](/img/lame/3.png)

Esta vulnerabilidad (identificada como **CVE-2007-2447**) no es un error de desbordamiento de memoria, sino un fallo en cómo Samba manejaba los nombres de usuario cuando se configuraba la opción `username map script` en el archivo de configuración (`smb.conf`).

- **El fallo:** Samba permitía pasar caracteres especiales de shell (como backticks ``` o el punto y coma `;`) dentro del campo del nombre de usuario.
- **La ejecución:** Cuando un atacante enviaba un nombre de usuario malicioso, el sistema ejecutaba los comandos contenidos en ese nombre de usuario con los privilegios del servicio (que normalmente es **root**).

![image.png](/img/lame/4.png)

despues de estabilizar la shell con python solo faltaba buscar las bandera y bingo!

![image.png](/img/lame/5.png)

esta me dio la impresion de ser bastante facil yo aproveche la vulnerabilidad en smb/samba pero se ve que tiene mas rutas al root en fin esto es todo por hoy con esto **mi quinta maquina ha sido hackeada !**
