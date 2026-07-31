# Presentación del Proyecto: Pipeline CI/CD, Despliegue Avanzado y Buenas Prácticas

¡Bienvenidos a la presentación de nuestro proyecto! Este repositorio contiene la evolución de la aplicación **Inventario App** desde una simple aplicación local hacia un entorno robusto, automatizado y desplegado en Kubernetes siguiendo las mejores prácticas de la industria (CI/CD, estrategias de despliegue avanzadas y métricas DORA).

A continuación, explicamos paso a paso lo que hace nuestro proyecto en respuesta a los requerimientos planteados en las instrucciones.

---

## 🚀 1. Contenerización Segura y Eficiente (Docker Multi-stage)
Para asegurar que nuestra aplicación se despliega de manera confiable, implementamos un `Dockerfile` con enfoque **multi-stage**:
- **Etapa de Construcción (Builder):** Instalamos dependencias y ejecutamos los tests (`npm test`). **Si las pruebas fallan, la construcción de la imagen se detiene**, previniendo el empaquetado de código defectuoso.
- **Etapa de Producción:** Copiamos únicamente las dependencias de producción y los archivos esenciales (`server.js`, `db.js` y `public/`). Esto resulta en una imagen final sumamente ligera y segura, reduciendo la superficie de ataque.

## ⚙️ 2. Integración y Entrega Continua (GitHub Actions)
Automatizamos nuestro flujo de trabajo mediante un pipeline en `.github/workflows/ci-cd.yml` basado en el principio **fail-fast**:
- **Job `build-test`:** Se encarga de verificar el código ejecutando las pruebas.
- **Job `build-push`:** Solo se ejecuta si las pruebas son exitosas.
- **🔒 Escaneo de Seguridad (Componente Adicional 2):** Antes de publicar, utilizamos **Trivy** para escanear la imagen Docker. Si se detectan vulnerabilidades de infraestructura o librerías con severidad `CRITICAL`, el pipeline falla automáticamente.
- **Publicación:** Finalmente, la imagen es etiquetada (con el hash del commit y la etiqueta `latest`) y subida al GitHub Container Registry (`ghcr.io`).

## 🚢 3. Despliegue en Kubernetes (Rolling Update)
Desplegamos nuestra aplicación en un clúster de Kubernetes garantizando alta disponibilidad:
- Configuramos un `Deployment` base con 2 réplicas y una estrategia **RollingUpdate** (`maxUnavailable: 1`, `maxSurge: 1`), permitiendo actualizaciones graduales sin tiempo de inactividad para el usuario.
- **🛡️ Manejo de Secretos (Componente Adicional 1):** Protegimos `API_KEY` con un Secret inyectado mediante `secretKeyRef`. La aplicación consume la variable para autorizar `GET /api/admin/check`, sin exponer el valor.
- **⏳ Readiness y Arranque Lento (Componente Adicional 3):** `STARTUP_DELAY_SECONDS="30"` hace que `/health` responda `503` al inicio. Una `startupProbe` tolera ese periodo; después, readiness controla el tráfico y liveness detecta bloqueos reales.

## 🚦 4. Estrategia de Despliegue Avanzado: Blue-Green
Para minimizar al máximo los riesgos al lanzar nuevas versiones frente a usuarios reales, implementamos una estrategia de despliegue **Blue-Green** utilizando los recursos nativos de Kubernetes.
- **Implementación:** Creamos dos Deployments independientes (Blue y Green) en el directorio `k8s/blue-green/`. Cada uno representa una versión o configuración diferente.
- **Corte de Tráfico Instantáneo:** Un único Service actúa como enrutador. Al cambiar su selector de `version: blue` a `version: green`, desvía el 100% del tráfico y permite volver a Blue rápidamente.

## 💾 5. Reflexión sobre la Persistencia de Datos
Un hallazgo clave durante nuestro desarrollo y despliegue inicial fue observar qué ocurre al eliminar o recrear un Pod. Dado que nuestra aplicación almacena su catálogo en un archivo JSON local (`data/products.json`) directamente dentro del contenedor, **los datos y cambios generados se pierden permanentemente cada vez que se recrea el Pod**. 
Esto evidencia y refuerza la necesidad en la vida real de utilizar bases de datos externas o la integración de Volúmenes Persistentes (Persistent Volumes) en Kubernetes para persistir el estado.

---

## 🛠️ Tutorial Paso a Paso: Levantando el Entorno desde Cero

Esta sección está diseñada como una guía práctica para demostrar el funcionamiento de todo nuestro ecosistema, ideal para presentaciones en vivo.

### Requisitos Previos
Asegúrate de tener instalados: `Node.js 24`, `Docker`, `Minikube` y `kubectl`.

### Paso 1: Ejecución y Pruebas Locales
Primero, demostremos que el código fuente funciona correctamente antes de empaquetarlo.

```bash
# Instalar dependencias
npm ci

# Ejecutar las pruebas unitarias (El paso clave de nuestro CI)
npm test

# Levantar la aplicación localmente en un puerto aislado
PORT=31010 npm start
```
*Abre `http://127.0.0.1:31010`. Si creas un producto, cierras el servidor y lo vuelves a iniciar, el producto sigue ahí porque se guarda en `data/products.json`.*

### Paso 2: Empaquetado con Docker (Multi-stage)
Ahora vamos a construir la imagen de Docker, demostrando nuestra optimización:

```bash
docker build -t ghcr.io/scomygod/inventario-app:latest .
```
*Si observas los logs de construcción, verás que dentro de Docker se vuelve a ejecutar `npm test`. Si fallara, la imagen no se crearía.*

### Paso 3: Pipeline CI/CD (GitHub Actions)
En nuestro repositorio de GitHub, cualquier `push` a la rama `main` dispara automáticamente nuestro pipeline:
1. Pasa las pruebas.
2. Escanea vulnerabilidades críticas con **Trivy** (Componente 2).
3. Publica la imagen en `ghcr.io`.
*(Para demostrar esto en tu presentación, basta con mostrar la pestaña "Actions" del repositorio en GitHub con el check en verde).*

### Paso 4: Preparando Kubernetes y Secretos
Comprueba el clúster sin cambiar el contexto global y crea un namespace aislado:
```bash
minikube status
kubectl --context minikube apply -f k8s/namespace.yaml
```
Antes de cualquier despliegue, inyectaremos de forma segura nuestras credenciales (**Componente 1**):
```bash
read -s API_KEY_VALUE
kubectl --context minikube -n inventario-lab create secret generic api-secret \
  --from-literal=API_KEY="$API_KEY_VALUE"
unset API_KEY_VALUE
```

Escribe una clave ficticia cuando `read` espere la entrada. El valor no se guarda en este repositorio ni se imprime en la terminal.

Para validar una imagen local sin afectar otras aplicaciones cargamos solo esta imagen en Minikube:

```bash
minikube image load ghcr.io/scomygod/inventario-app:latest
```

### Paso 5: Despliegue Base y Prueba de Arranque Lento
Vamos a desplegar la versión base. Aquí demostraremos el **Componente 3 (Arranque Lento)**:
```bash
kubectl --context minikube apply -f k8s/deployment.yaml
kubectl --context minikube apply -f k8s/service.yaml

# Observa cómo los Pods tardan 30 segundos en estar "READY"
kubectl --context minikube -n inventario-lab get pods -w
```
Una vez listos, usa un puerto local reservado; no se detiene ni reemplaza ningún otro proceso:
```bash
kubectl --context minikube -n inventario-lab port-forward \
  service/inventario-service 31000:80
```
Abre `http://127.0.0.1:31000`.

Comprueba el Secret sin imprimirlo y prueba la ruta protegida:

```bash
kubectl --context minikube -n inventario-lab exec deployment/inventario-app -- \
  node -e 'console.log(process.env.API_KEY ? "API_KEY configurada" : "API_KEY ausente")'

curl -i http://127.0.0.1:31000/api/admin/check
API_KEY_VALUE="$(kubectl --context minikube -n inventario-lab get secret api-secret -o jsonpath='{.data.API_KEY}' | base64 --decode)"
curl -i http://127.0.0.1:31000/api/admin/check -H "x-api-key: $API_KEY_VALUE"
unset API_KEY_VALUE
```
*En el navegador, crea un producto. Luego, elimina el pod: `kubectl delete pod <nombre-del-pod>`. Cuando Kubernetes lo levante de nuevo automáticamente y refresques la página, verás que **el producto desapareció**. Esto demuestra el problema de usar almacenamiento efímero local en contenedores.*

### Paso 6: Demostración Estrella: Despliegue Blue-Green
Finalmente, demostraremos cómo actualizar nuestra aplicación sin interrumpir a los usuarios.

```bash
# 1. Desplegamos los entornos Blue (actual) y Green (nueva versión)
kubectl --context minikube apply -f k8s/blue-green/deployment-blue.yaml
kubectl --context minikube apply -f k8s/blue-green/deployment-green.yaml

# 2. Exponemos el tráfico apuntando a la versión Blue
kubectl --context minikube apply -f k8s/blue-green/service.yaml

# 3. Abrimos un túnel local aislado (en otra terminal)
kubectl --context minikube -n inventario-lab port-forward \
  service/inventario-service-bg 31001:80
```

Realiza una petición al servicio para confirmar que estás en el entorno Blue:
```bash
curl http://127.0.0.1:31001/version
# Respuesta esperada: {"version":"v1","color":"blue",...}
```

**¡El Corte de Tráfico!**
Ahora simularemos el paso a producción de la nueva versión (Green), enviando el 100% del tráfico al instante modificando el selector del Service:
```bash
kubectl --context minikube -n inventario-lab patch service inventario-service-bg \
  -p '{"spec":{"selector":{"version":"green"}}}'
```

`kubectl port-forward service/...` elige un pod al iniciar. Para observar Green desde macOS,
detén **solo ese túnel** con `Ctrl+C` y vuelve a ejecutar el mismo `port-forward` de `31001`.
Los Deployments y el Service continúan funcionando durante este reinicio del túnel local.

Vuelve a probar inmediatamente:
```bash
curl http://127.0.0.1:31001/version
# Respuesta instantánea: {"version":"v2","color":"green",...}
```
*¡Hemos actualizado nuestra aplicación a una nueva versión sin un solo segundo de inactividad!*

---
¡Gracias por acompañarnos en este recorrido hacia un ciclo de vida de software automatizado, seguro y resiliente!
