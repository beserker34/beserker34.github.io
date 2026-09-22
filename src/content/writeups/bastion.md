---
title: "Bastion - HackTheBox Writeup"
machine: "Bastion"
platform: "HackTheBox"
os: "Windows"
difficulty: "Easy"
tags: ["SMB", "Active Directory", "RCE", "Privesc"]
retired: true
summary: "Bastion es una máquina Windows de HackTheBox que presenta una cadena de ataque enfocada en la mala gestión de copias de seguridad y el almacenamiento inseguro d"
draft: false
---
---

# **Descripción General**

Bastion es una máquina Windows de HackTheBox que presenta una cadena de ataque enfocada en la mala gestión de copias de seguridad y el almacenamiento inseguro de credenciales por parte de software de terceros.

La explotación requiere el montaje remoto de discos virtuales (VHD) expuestos vía SMB para la extracción de colmenas del registro (SAM/SYSTEM). Posteriormente, la escalada de privilegios se logra abusando de una debilidad criptográfica conocida en el gestor de conexiones mRemoteNG, permitiendo descifrar la contraseña del administrador del sistema.

# Reconocimiento

La enumeración inicial de puertos revela servicios estándar de administración y compartición de archivos en entornos Windows:

- **22/tcp:** OpenSSH (Permite acceso nativo por consola).
- **445/tcp:** SMB (Compartición de archivos).
- **5985/tcp:** WinRM (Administración remota de Windows).

El vector de entrada principal se descubre al enumerar los recursos compartidos por SMB (puerto 445), donde se identifica una carpeta de copias de seguridad accesible (`/mnt/bastion_backups/`) que contiene una imagen del sistema en formato `.vhd` (Virtual Hard Disk).

---

# **Acceso Inicial**

### Montaje del VHD y Extracción de Hashes

En lugar de descargar el pesado archivo VHD, se utiliza `guestmount` para montar y explorar el sistema de archivos de forma remota y en modo solo lectura:

Bash

`sudo guestmount --add "/mnt/bastion_backups/WindowsImageBackup/L4mpje-PC/Backup 2019-02-22 124351/9b9cfbc4-369e-11e9-a17c-806e6f6e6963.vhd" --inspector --ro /mnt/vhd_temp`

Una vez montado el disco de la copia de seguridad, navegamos al directorio de configuración de Windows para extraer las bases de datos de seguridad locales:

Bash

`cp /mnt/vhd_temp/Windows/System32/config/SAM .
cp /mnt/vhd_temp/Windows/System32/config/SYSTEM .`

Utilizando `secretsdump` de Impacket, se extraen los hashes NTLM de los usuarios locales de la máquina:

Bash

`impacket-secretsdump -sam SAM -system SYSTEM LOCAL
# Hash obtenido: L4mpje:1000:aad3b435b51404eeaad3b435b51404ee:26112010952d963c8dc4217daec986d9:::`

### Cracking Offline y Acceso

El hash NTLM del usuario `L4mpje` se somete a un ataque de diccionario utilizando Hashcat (Modo 1000) y la wordlist `rockyou.txt`:

Bash

`hashcat -m 1000 26112010952d963c8dc4217daec986d9 /usr/share/wordlists/rockyou.txt
# Resultado: 26112010952d963c8dc4217daec986d9:bureaulampje`

Con las credenciales en texto plano (`L4mpje`:`bureaulampje`), se obtiene acceso al sistema operativo mediante el servicio OpenSSH en el puerto 22, logrando capturar la bandera de usuario (`user.txt`).

---

# Escalada de Privilegios

### Enumeración del Entorno

Al obtener la shell inicial, se confirma que la máquina es un Windows Server 2016 en un entorno de grupo de trabajo (Standalone, sin Active Directory). El usuario `L4mpje` posee privilegios estándar.

La enumeración de los directorios de usuario revela la presencia de software de administración remota en el sistema.

### Abuso de mRemoteNG y Reversing Criptográfico

Explorando el directorio `AppData` del usuario, se localiza la carpeta de configuración del gestor de conexiones mRemoteNG:

DOS

`C:\Users\L4mpje\AppData\Roaming\mRemoteNG\`

Dentro de este directorio, se extrae el archivo `confCons.xml`. Este archivo en formato XML almacena los perfiles de conexión del administrador. Al inspeccionar su contenido, se encuentra la entrada para la cuenta `Administrator` local:

XML

`Username="Administrator" Domain="" Password="aEWNFV5uGcjUHF0uS17QTdT9kVqtKCPeoC0Nw5dmaPFjNQ2kt/zO5xDqE4HdVmHAowVRdC7emf7lWWA10dQKiw=="`

mRemoteNG utiliza cifrado AES en modo GCM, pero adolece de una debilidad crítica: si el usuario no configura una contraseña maestra personalizada, el programa utiliza una clave estática por defecto (`mR3m`) para cifrar y descifrar las contraseñas.

Utilizando un script en Python diseñado para revertir este cifrado (`mRemoteNG-Decrypt`), pasamos el string en base64:

Bash

`python3 mremoteng_decrypt.py -s "aEWNFV5uGcjUHF0uS17QTdT9kVqtKCPeoC0Nw5dmaPFjNQ2kt/zO5xDqE4HdVmHAowVRdC7emf7lWWA10dQKiw=="`

El script devuelve la contraseña en texto plano del administrador: **`thXLHM96BeKL0ER2`**. Finalmente, se utiliza SSH con esta credencial para iniciar sesión como `Administrator` y obtener la flag `root.txt`.

---

# **Resumen de la Cadena de Ataque**

**BASTION**

1. **SMB (Puerto 445)**
↳ Enumeración de recursos compartidos
↳ Descubrimiento de Backup VHD (`L4mpje-PC`)
2. **Sistema de Archivos VHD**
↳ Montaje remoto (`guestmount`)
↳ Extracción de colmenas SAM y SYSTEM
3. **Impacket & Hashcat**
↳ Volcado de NTLM: `L4mpje: 2611...6d9`
↳ Cracking: `bureaulampje`
4. **SSH (Puerto 22)**
↳ Acceso como usuario `L4mpje`
↳ Lectura de `user.txt`
5. **Enumeración Local (Post-Explotación)**
↳ Descubrimiento de `mRemoteNG` en `%APPDATA%`
↳ Extracción de `confCons.xml`
6. **Criptografía & Reversing**
↳ Identificación de hash AES-GCM del Administrador
↳ Descifrado usando Master Key por defecto (`mR3m`)
7. **Acceso Root**
↳ SSH como `Administrator`
↳ Lectura de `root.txt`

---

# Herramientas Utilizadas

- **nmap** - Escaneo de puertos y servicios.
- **guestmount** - Montaje remoto del disco virtual VHD.
- **impacket (secretsdump.py)** - Volcado offline de hashes de la SAM.
- **hashcat** - Cracking por fuerza bruta/diccionario (Modo 1000).
- **ssh / evil-winrm** - Gestión de acceso remoto inicial.
- **mRemoteNG-Decrypt (Python)** - Reversing del cifrado AES de mRemoteNG.

Etiquetas 

`windows` `smb` `vhd` `sam-dump` `hash-cracking` `impacket` `mremoteng` `password-decryption` `aes-gcm` `ssh`
