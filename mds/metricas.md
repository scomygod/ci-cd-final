# Demostración del Método Canary y Cálculo de Métricas DORA

Este documento sirve como guía para exponer teórica y prácticamente la alternativa de despliegue **Canary** (en contraste con nuestro Blue-Green actual) y para presentar el cálculo de las **Métricas DORA**, tal como se exige en la Parte II del proyecto.

---

## 🔵🟢 1. ¿Por qué elegimos y cómo funciona el Método Blue-Green?

En nuestro proyecto hemos implementado la estrategia **Blue-Green** como método de despliegue avanzado. Elegimos este método porque nos garantiza **cero tiempo de inactividad (zero-downtime)** y permite un rollback instantáneo en caso de fallo, ideal para aplicaciones donde la disponibilidad absoluta es crítica.

### El Setup (Infraestructura)
1. **Dos Entornos Paralelos:** Mantenemos dos Deployments idénticos en Kubernetes: uno llamado `blue` (la versión actual en producción) y otro llamado `green` (la nueva versión). Ambos corren al mismo tiempo.
2. **El Enrutador (Service):** Un único `Service` expone la aplicación al mundo. La clave de este método está en el **selector** de etiquetas de este Service (`version: blue` o `version: green`).

### La Demostración Paso a Paso
1. **Despliegue inicial:** Se levantan ambos entornos y el Service apunta al entorno `blue`. Todo el tráfico de usuarios llega allí.
2. **El Corte de Tráfico (Switch):** Para pasar a la nueva versión, no apagamos `blue` ni creamos pods nuevos. Simplemente actualizamos el selector del Service en vivo:
   ```bash
   kubectl patch service inventario-service-bg -p '{"spec":{"selector":{"version":"green"}}}'
   ```
3. **El Resultado:** En una fracción de segundo, el 100% de los usuarios nuevos son dirigidos al entorno `green`. Si algo sale mal, revertimos el comando apuntando a `blue` de nuevo y el problema se soluciona casi instantáneamente, ya que los pods antiguos nunca dejaron de existir.

---

## 🐤 2. ¿Cómo funciona la alternativa Canary?

A diferencia del método Blue-Green (que corta el 100% del tráfico de golpe de una versión a otra), el despliegue **Canary** expone la nueva versión solo a un pequeño porcentaje de los usuarios para minimizar el impacto de un posible error. 

Si quisiéramos demostrar esto en Kubernetes usando **únicamente recursos nativos** (sin herramientas externas complejas como Istio o Argo Rollouts), la demostración se haría aprovechando el balanceo de carga nativo de los `Service`.

### El Setup (Infraestructura)
1. **Deployment Estable (v1):** Creamos un Deployment con **4 réplicas** etiquetadas con `app: inventario`.
2. **Deployment Canary (v2 - nueva versión):** Creamos otro Deployment con solo **1 réplica** etiquetada también con `app: inventario`, pero con un color o variable distinta.
3. **El Service:** El Service solo debe tener el selector `app: inventario` (sin especificar versión). Kubernetes enviará el tráfico a cualquier pod que coincida con esa etiqueta.

### La Demostración Paso a Paso frente al público
1. **Aplicar los despliegues:** Ejecutamos los YAML para que existan 5 pods corriendo al mismo tiempo (4 estables y 1 canary).
2. **Demostrar el enrutamiento:** Al ejecutar repetidas veces un comando `curl` contra el endpoint `/version` usando un ciclo `while` en la terminal:
   ```bash
   while true; do curl http://<IP-MINIKUBE>:<PUERTO>/version; echo ""; sleep 0.5; done
   ```
3. **El Resultado Visual:** El público verá un flujo constante de respuestas JSON. Estadísticamente, observarán que el **80% de las respuestas** provendrán de la versión Estable (ej. color azul) y solo un **20% de las respuestas** provendrán de la versión Canary (ej. color verde). Esto demuestra a la perfección cómo el tráfico se reparte de forma desigual, cumpliendo con el principio del método Canary.

---

## 📊 3. Cálculo de las Métricas DORA (Parte II)

Para el informe final de reflexión en PDF, la rúbrica exige calcular 3 métricas DORA basándonos en los datos reales generados durante tu trabajo en esta tarea. Aquí te explicamos cómo extraer y calcular cada una para presentarlas con seguridad:

### Métrica 1: Lead Time for Changes (Tiempo de Entrega)
*Mide cuánto tiempo pasa desde que el código es enviado (commit) hasta que ese cambio está desplegado y funcionando en el clúster.*
* **Cómo calcularlo:** 
  1. Busca en tu historial de GitHub a qué hora exacta hiciste un `git commit`. (Por ejemplo: 15:00 hrs).
  2. Mira a qué hora terminó con check verde tu GitHub Action, y suma el tiempo que tardaste en hacer el comando `kubectl rollout restart deployment/inventario-app` en tu Minikube para actualizar el clúster. (Por ejemplo, terminaste todo a las 15:06 hrs).
  3. **Tu Lead Time:** En este ejemplo sería de **6 minutos**.
* **Para el informe:** Debes reportar y anotar el tiempo exacto para al menos dos cambios distintos que hayas hecho durante la práctica (por ejemplo, el arreglo de Trivy y el arreglo del `STARTUP_DELAY_SECONDS`).

### Métrica 2: Frecuencia de Despliegue (Deployment Frequency)
*Mide con qué frecuencia promueves y aplicas cambios a tu clúster.*
* **Cómo calcularlo:**
  1. Haz memoria o mira el historial para contar cuántas veces aplicaste cambios a los pods usando `kubectl apply` o actualizando la imagen durante los días que te tomó hacer el proyecto.
  2. Supongamos que en 4 días de trabajo, actualizaste los despliegues exitosamente unas 12 veces.
* **Para el informe:** Puedes redactar algo como: *"A lo largo de 4 días de desarrollo, promovimos cambios a nuestro clúster local 12 veces, lo que resulta en una Frecuencia de Despliegue de **3 despliegues por día**, ubicándonos en un rango de alto desempeño"*.

### Métrica 3: Change Failure Rate (Tasa de Fallos en Cambios)
*Mide qué porcentaje de los despliegues que intentaste realizar fallaron y requirieron corrección o intervención.*
* **Cómo calcularlo:**
  1. De todos los despliegues que hiciste (por ejemplo, 12 despliegues totales), ¿cuántos salieron mal inicialmente? 
  2. Toma en cuenta tus errores reales: por ejemplo, cuando falló por el typo `npm tes2`, cuando Trivy bloqueó el pase por vulnerabilidades críticas, y cuando faltaban las variables `APP_COLOR` en el Blue-Green. Digamos que tuviste 3 fallos en total.
  3. La fórmula es simple: `(3 fallos / 12 intentos totales) * 100 = 25%`.
* **Para el informe:** Debes explicar: *"Nuestro Change Failure Rate fue del **25%**. De todos nuestros intentos, una cuarta parte requirió correcciones, lo cual consideramos una métrica normal y saludable dado que estuvimos configurando y probando infraestructura nueva (como el escáner de seguridad Trivy y el retraso en los probes)."*
