---
title: "Writeup HTB"
machine: "Writeup"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["CVE", "SQLi", "Privesc", "Web"]
retired: true
summary: "Técnicas: SQL Injection (Time-based), PATH Hijacking, Abuso del grupo Staff."
draft: false
---
**Dificultad:** Easy

**IP:** `10.129.31.80`

**Técnicas:** SQL Injection (Time-based), PATH Hijacking, Abuso del grupo Staff.

---

## 1. Enumeración

### Escaneo de Puertos (Nmap)

El análisis inicial reveló dos puertos abiertos:

- **22 (SSH):** OpenSSH 7.4p1.
- **80 (HTTP):** Apache httpd 2.4.25.

### Enumeración Web

Al revisar el archivo `robots.txt`, se encontró una ruta interesante: `/writeup/`.

Esta ruta contenía un sitio web que utilizaba el CMS **CMS Made Simple**.

---

## 2. Explotación: Inyección SQL

### Identificación de la Vulnerabilidad

El CMS fue identificado como vulnerable a una **Inyección SQL basada en tiempo** (CVE-2019-9053). El parámetro afectado es `page` en la URL:

`[http://writeup.htb/writeup/index.php?page=](http://writeup.htb/writeup/index.php?page=)[Vulnerable]`

### Ejecución del Exploit

Se utilizó un script de Python 2 para explotar la vulnerabilidad. Debido a la presencia de un script de protección contra DoS llamado **Eeyore**, fue necesario modificar el script original para incluir un retraso (`time.sleep(0.5)`) y evitar el bloqueo de la IP.

**Credenciales Extraídas:**

- **Usuario:** `jkr`
- **Salt:** `5a599ef579066807`
- **Hash (MD5):** `62def4866937f08cc13bab43bb14e6f7`
- **Password:** `raykayjay9`

---

## 3. Acceso Inicial (User Shell)

Con las credenciales obtenidas, se estableció una conexión vía **SSH**:

Bash

`ssh jkr@10.129.31.80`

La bandera de usuario fue localizada en `/home/jkr/user.txt`:

`0a89051f983f3d423e7b547dac2567dd`

---

## 4. Escalada de Privilegios (Root)

### Análisis del Sistema

Al ejecutar **LinPeas**, se detectaron dos puntos críticos:

1. El usuario `jkr` pertenece al grupo **`staff`**.
2. Los miembros del grupo `staff` tienen permisos de escritura en el directorio `/usr/local/bin`.

### PATH Hijacking

Se observó que al iniciar una sesión SSH, el sistema intenta ejecutar un binario llamado `run-parts` sin especificar su ruta absoluta. Debido a que `/usr/local/bin` aparece antes que `/bin` en el `PATH`, podemos secuestrar la ejecución.

**Pasos para la Escalada:**

1. **Crear el script malicioso:**Bash
    
    `echo -e '#!/bin/bash\nchmod +s /bin/bash' > /usr/local/bin/run-parts
    chmod +x /usr/local/bin/run-parts`
    
2. **Disparar el proceso:** Se inició una nueva conexión SSH desde la máquina atacante para forzar la ejecución de `run-parts` por parte del sistema como usuario root.
3. **Activar la Shell de Root:** Una vez que `/bin/bash` adquirió el bit **SUID**, se ejecutó:Bash
    
    `/bin/bash -p`
    

---

## 5. Flags

| **Tipo** | **Hash** |
| --- | --- |
| **User** | `0a89051f983f3d423e7b547dac2567dd` |
| **Root** | `4814c5d697df371f1953859b1635a8e8` |

---

**Notas Finales:** El mayor desafío de esta máquina fue la gestión de la protección DoS en el CMS y la correcta configuración del entorno para ejecutar exploits heredados de Python 2.
