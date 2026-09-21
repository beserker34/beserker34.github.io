---
title: "Lame — HackTheBox Writeup"
machine: "Lame"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["Samba", "CVE-2007-2447", "RCE", "vsftpd", "distcc"]
date: 2026-04-29
retired: true
summary: "Máquina clásica de Linux. RCE directo como root vía Samba usermap_script (CVE-2007-2447)."
draft: false
---

## Enumeración

Como siempre iniciamos con un escaneo de puertos. Los puertos descubiertos son **21, 22, 139, 445 y 3632**. Procedo a hacer un escaneo de versiones y scripts básicos:

```bash
sudo nmap 10.129.29.167 -p 21,22,139,445,3632 -Pn -n -sCV -oN targeted
```

```
PORT     STATE SERVICE     VERSION
21/tcp   open  ftp         vsftpd 2.3.4
|_ftp-anon: Anonymous FTP login allowed (FTP code 230)
22/tcp   open  ssh         OpenSSH 4.7p1 Debian 8ubuntu1 (protocol 2.0)
139/tcp  open  netbios-ssn Samba smbd 3.X - 4.X (workgroup: WORKGROUP)
445/tcp  open  netbios-ssn Samba smbd 3.0.20-Debian (workgroup: WORKGROUP)
3632/tcp open  distccd     distccd v1 ((GNU) 4.2.4 (Ubuntu 4.2.4-1ubuntu4))
Service Info: OSs: Unix, Linux; CPE: cpe:/o:linux:linux_kernel
```

Varias cosas interesantes aquí. Un resumen del análisis de cada servicio:

### 1. Puerto 21 — FTP (vsftpd 2.3.4)

- **Anonymous FTP login allowed:** puedes entrar con el usuario `anonymous` y cualquier contraseña.
- **vsftpd 2.3.4:** versión famosa por contener un **backdoor** (CVE-2011-2523). Si se envía un usuario que termine en `:)`, el sistema abre un shell en el puerto 6200.

### 2. Puerto 22 — SSH (OpenSSH 4.7p1)

Versión muy vieja (2007/2008). SSH suele ser difícil de explotar directamente salvo credenciales o el caso Debian OpenSSL. Normalmente sirve para post-explotación.

### 3. Puertos 139 y 445 — SMB (Samba 3.0.20)

Punto crítico. Esta versión de Samba es vulnerable a **usermap_script** (**CVE-2007-2447**): ejecución remota de comandos que da acceso como `root` sin autenticación.

### 4. Puerto 3632 — distccd v1

`distcc` distribuye la compilación de código entre máquinas. La versión 1 es insegura y permite ejecutar comandos arbitrarios porque no verifica quién envía tareas.

Intenté enumerar FTP con sesión anónima pero no hay nada de valor:

```bash
ftp 10.129.29.167
# anonymous / (cualquier password) -> 230 Login successful
ftp> ls -la
# solo . y .. -> vacío
```

## Explotación y escalada de privilegios

Investigué la vulnerabilidad de Samba, que da acceso directo como root.

**CVE-2007-2447** no es un desbordamiento de memoria, sino un fallo en cómo Samba manejaba los nombres de usuario cuando se configura la opción `username map script` en `smb.conf`:

- **El fallo:** Samba permitía pasar caracteres especiales de shell (backticks `` ` `` o `;`) dentro del campo del nombre de usuario.
- **La ejecución:** al enviar un nombre de usuario malicioso, el sistema ejecutaba los comandos contenidos con los privilegios del servicio (**root**).

Después de estabilizar la shell con Python, solo faltaba buscar las banderas. **¡Bingo!**

> Esta me dio la impresión de ser bastante fácil. Aproveché la vulnerabilidad en SMB/Samba, pero se ve que tiene más rutas al root (vsftpd, distcc). Con esto, mi quinta máquina ha sido hackeada.

---

> _Writeup con fines educativos. Máquina retirada de HackTheBox._
