# Guía de Sustentación

## Idea central para abrir la exposición

> “La práctica toma una aplicación de inventario en Node.js, la prueba y empaqueta con Docker, intenta publicar su imagen con GitHub Actions y GHCR, y la despliega manualmente en Kubernetes. Se implementaron Rolling Update, una demostración Blue-Green, Secrets y health checks. El estado real también presenta observaciones importantes en Trivy, las probes y las métricas DORA.”

## Mapa rápido del proyecto

- Aplicación y API: `server.js`, `db.js`, `public/`
- Pruebas: `server.test.js`
- Dependencias y comandos: `package.json`, `package-lock.json`
- Imagen: `Dockerfile`, `.dockerignore`
- Pipeline: `.github/workflows/ci-cd.yml`
- Kubernetes base: `k8s/deployment.yaml`, `k8s/service.yaml`
- Blue-Green: `k8s/blue-green/deployment-blue.yaml`, `k8s/blue-green/deployment-green.yaml`, `k8s/blue-green/service.yaml`
- Informe y explicación: `informe_practica_cicd.pdf`, `README.md`, `mds/metricas.md`, `mds/pasos.md`
- Enunciado de la práctica: `Instrucciones.md`, `mds/Instrucciones.md`

## Advertencias que debes conocer

Estas respuestas toman como referencia los archivos reales, incluso cuando contradicen al informe o a los `.md`.

1. **El deploy a Kubernetes no está automatizado.** `.github/workflows/ci-cd.yml` no contiene `kubectl`, credenciales del clúster ni un job de deploy. El despliegue descrito en `README.md` es manual.
2. **Trivy está en un orden incorrecto.** En `.github/workflows/ci-cd.yml` intenta escanear la imagen con el SHA antes de construirla. La captura del `informe_practica_cicd.pdf` también muestra ese paso en rojo.
3. **La liveness probe puede reiniciar el Pod durante el arranque lento.** En `k8s/deployment.yaml`, `/health` falla durante 30 segundos, pero liveness comienza a los 5 segundos y conserva el umbral predeterminado de 3 fallos. Readiness no mata Pods; liveness sí puede reiniciarlos.
4. **Blue y Green usan la misma imagen.** Ambos manifiestos apuntan a `ghcr.io/scomygod/inventario-app:latest`; se diferencian por `APP_COLOR` y `APP_VERSION`.
5. **El Secret se inyecta, pero la aplicación no usa `API_KEY`.** Los YAML contienen `secretKeyRef`, pero `server.js` nunca lee `process.env.API_KEY`.
6. **Las métricas DORA del PDF no son verificables con este repositorio.** El informe lista hashes que no aparecen en el historial y no existen logs de despliegue. Deben presentarse como cifras del informe, no como datos demostrables desde los archivos actuales.
7. **Al recrear un Pod no queda el catálogo “vacío”.** Se pierden los productos añadidos, pero `db.js` vuelve a crear tres productos iniciales mediante `SEED`.

---

## 1. Arquitectura general

- **Tema:** Arquitectura de la aplicación y de entrega
- **Archivo donde se explica o implementa:** `server.js`, `db.js`, `public/index.html`, `public/app.js`, `Dockerfile`, `.github/workflows/ci-cd.yml`, `k8s/deployment.yaml`, `k8s/service.yaml`
- **Explicación sencilla:** Es una aplicación Node.js con Express, una interfaz web y una API REST. Los datos se guardan en un JSON local. Docker la empaqueta y Kubernetes ejecuta dos réplicas detrás de un Service.
- **Cómo explicarlo al profesor:** “El usuario entra por el Service de Kubernetes, que envía la petición a uno de los Pods. Cada Pod ejecuta la imagen Docker de la aplicación Express y guarda sus datos en un archivo local.”
- **Posibles preguntas del profesor:** ¿Es un microservicio? ¿Dónde se guardan los datos?
- **Respuestas cortas para memorizar:** “Es una aplicación Node.js compacta, no una arquitectura de varios microservicios.” / “Los datos se guardan en `data/products.json` dentro del contenedor.”

## 2. Flujo real del pipeline

- **Tema:** Integración, publicación y despliegue
- **Archivo donde se explica o implementa:** `.github/workflows/ci-cd.yml`, `README.md`
- **Explicación sencilla:** Un `push` a `main` ejecuta pruebas. Si pasan, comienza `build-push`, inicia sesión en GHCR, intenta ejecutar Trivy y después tiene configurada la construcción y publicación. Kubernetes no se actualiza automáticamente.
- **Cómo explicarlo al profesor:** “El flujo real es push, pruebas, login, intento de escaneo, build y push. El despliegue a Minikube se realiza aparte con comandos manuales.”
- **Posibles preguntas del profesor:** ¿Es CI/CD completo? ¿Qué ocurre si fallan las pruebas?
- **Respuestas cortas para memorizar:** “Tiene CI y entrega de imagen, pero no deploy automático al clúster.” / “`build-push` no empieza porque depende de `build-test`.”

## 3. GitHub Actions

- **Tema:** Automatización del pipeline
- **Archivo donde se explica o implementa:** `.github/workflows/ci-cd.yml`
- **Explicación sencilla:** GitHub Actions ejecuta dos jobs: `build-test` y `build-push`. La relación `needs: build-test` aplica fail-fast: una prueba fallida impide continuar con la publicación.
- **Cómo explicarlo al profesor:** “Elegimos GitHub Actions porque el pipeline vive junto al código y se activa automáticamente con cada push a `main`.”
- **Posibles preguntas del profesor:** ¿Qué es un job? ¿Qué hace `needs`?
- **Respuestas cortas para memorizar:** “Un job agrupa pasos que corren en un runner.” / “`needs` obliga a que las pruebas terminen bien antes del siguiente job.”

## 4. Docker

**Concepto:** Docker

**Qué es:** Una plataforma que empaqueta la aplicación y sus dependencias en una imagen reproducible.

**Por qué se usa:** Evita diferencias entre el equipo local, CI y Kubernetes.

**Cómo se implementó en ESTE proyecto:** Se construye una imagen Node 18 Alpine y se expone el puerto 3000. El build ejecuta las pruebas.

**Archivo donde está:** `Dockerfile`, `.dockerignore`

**Cómo responder en menos de 30 segundos:** “Docker reúne Node, dependencias y código en una imagen. Así ejecutamos el mismo artefacto en local y Kubernetes.”

- **Posibles preguntas del profesor:** ¿La imagen se pudo construir? ¿Qué excluye Docker?
- **Respuestas cortas para memorizar:** “Sí, el build actual termina correctamente y pasan 5 pruebas.” / “`.dockerignore` excluye `node_modules`.”

## 5. Dockerfile multi-stage

- **Tema:** Construcción en dos etapas
- **Archivo donde se explica o implementa:** `Dockerfile`
- **Explicación sencilla:** La etapa `builder` instala dependencias, copia el proyecto y ejecuta `npm test`. La etapa final instala solo dependencias de producción y copia `server.js`, `db.js` y `public/`.
- **Cómo explicarlo al profesor:** “La primera etapa valida el código; la segunda crea el artefacto final con solo lo necesario para ejecutar.”
- **Posibles preguntas del profesor:** ¿Qué pasa si falla `npm test`? ¿Por qué Alpine?
- **Respuestas cortas para memorizar:** “El build se detiene y no genera la imagen final.” / “Alpine ofrece una base pequeña.”

## 6. Docker Compose

- **Tema:** Orquestación local con Compose
- **Archivo donde se explica o implementa:** No existe `docker-compose.yml` ni `compose.yaml`.
- **Explicación sencilla:** Docker Compose no fue implementado. La aplicación solo necesita un contenedor y usa un JSON local, por lo que la práctica trabaja con `docker build` y `docker run`.
- **Cómo explicarlo al profesor:** “Compose no forma parte de esta entrega. Habría sido útil para levantar la aplicación junto con una base de datos externa.”
- **Posibles preguntas del profesor:** ¿Docker Compose y Kubernetes son lo mismo?
- **Respuestas cortas para memorizar:** “No. Compose simplifica entornos locales; Kubernetes orquesta cargas en un clúster.”

## 7. Kubernetes

**Concepto:** Kubernetes

**Qué es:** Un orquestador que administra contenedores, réplicas, red y recuperación.

**Por qué se usa:** Mantiene el estado deseado y permite actualizaciones controladas.

**Cómo se implementó en ESTE proyecto:** Un Deployment base crea dos Pods y un Service NodePort los expone. También hay dos Deployments para Blue-Green.

**Archivo donde está:** `k8s/deployment.yaml`, `k8s/service.yaml`, `k8s/blue-green/deployment-blue.yaml`, `k8s/blue-green/deployment-green.yaml`, `k8s/blue-green/service.yaml`

**Cómo responder en menos de 30 segundos:** “Kubernetes mantiene dos réplicas, reemplaza Pods fallidos y publica la aplicación mediante un Service.”

- **Posibles preguntas del profesor:** ¿Qué diferencia hay entre Deployment, Pod y Service?
- **Respuestas cortas para memorizar:** “Deployment administra Pods; Pod ejecuta el contenedor; Service ofrece una dirección estable y balancea tráfico.”

## 8. Rolling Update

**Concepto:** Rolling Update

**Qué es:** Reemplaza gradualmente los Pods antiguos por nuevos.

**Por qué se usa:** Reduce interrupciones durante una actualización.

**Cómo se implementó en ESTE proyecto:** Dos réplicas, `maxUnavailable: 1` y `maxSurge: 1`.

**Archivo donde está:** `k8s/deployment.yaml`

**Cómo responder en menos de 30 segundos:** “Kubernetes puede crear un Pod adicional y dejar como máximo uno no disponible mientras actualiza la aplicación.”

- **Posibles preguntas del profesor:** ¿Garantiza cero downtime?
- **Respuestas cortas para memorizar:** “Lo reduce, pero depende de que los Pods nuevos estén realmente listos y las probes estén bien configuradas.”

## 9. Blue-Green Deployment

**Concepto:** Blue-Green

**Qué es:** Mantiene dos entornos paralelos y cambia todo el tráfico de uno al otro.

**Por qué se usa:** Permite validar el entorno nuevo y volver rápidamente al anterior.

**Cómo se implementó en ESTE proyecto:** Existen Deployments `inventario-app-blue` y `inventario-app-green`. El Service selecciona inicialmente `version: blue`; el cambio se hace actualizando el selector a `green`.

**Archivo donde está:** `k8s/blue-green/deployment-blue.yaml`, `k8s/blue-green/deployment-green.yaml`, `k8s/blue-green/service.yaml`, `README.md`

**Cómo responder en menos de 30 segundos:** “Blue y Green se ejecutan al mismo tiempo. El Service decide cuál recibe el 100 % del tráfico mediante la etiqueta `version`.”

- **Posibles preguntas del profesor:** ¿Son versiones distintas? ¿Cómo se vuelve a Blue?
- **Respuestas cortas para memorizar:** “En los archivos actuales usan la misma imagen `latest`; la demostración cambia `APP_COLOR`.” / “Se restaura `version: blue` en el selector.”

## 10. Canary

**Concepto:** Canary

**Qué es:** Expone una versión nueva a una fracción del tráfico antes de promoverla totalmente.

**Por qué se usa:** Limita el impacto de un defecto y permite observar el comportamiento real.

**Cómo se implementó en ESTE proyecto:** No se implementó. `mds/metricas.md` solo explica un ejemplo teórico de 4 Pods estables y 1 canary.

**Archivo donde está:** Explicación teórica en `mds/metricas.md`; no existe una carpeta `k8s/canary/`.

**Cómo responder en menos de 30 segundos:** “Canary fue estudiado, pero la estrategia elegida e implementada fue Blue-Green.”

- **Posibles preguntas del profesor:** ¿Qué habría sido útil de Canary?
- **Respuestas cortas para memorizar:** “Probar la versión nueva con pocos usuarios antes de una promoción total.”

## 11. Secrets

**Concepto:** Kubernetes Secret

**Qué es:** Un objeto de Kubernetes para separar credenciales de los manifiestos de la aplicación.

**Por qué se usa:** Evita escribir el valor sensible directamente en Git.

**Cómo se implementó en ESTE proyecto:** Los Deployments leen `API_KEY` desde `api-secret` mediante `secretKeyRef`. El Secret se crea manualmente con el comando del `README.md`.

**Archivo donde está:** `k8s/deployment.yaml`, `k8s/blue-green/deployment-blue.yaml`, `k8s/blue-green/deployment-green.yaml`, `README.md`

**Cómo responder en menos de 30 segundos:** “El valor no está versionado: Kubernetes lo inyecta desde `api-secret`. Sin embargo, el código actual no utiliza `API_KEY`; solo demuestra la inyección.”

- **Posibles preguntas del profesor:** ¿El Secret está en Git? ¿Qué pasa si no existe?
- **Respuestas cortas para memorizar:** “No; solo está la referencia y el comando de creación.” / “El Pod no inicia porque la referencia no es opcional.”

## 12. ConfigMaps

- **Tema:** Configuración no sensible
- **Archivo donde se explica o implementa:** No existe ningún manifiesto ConfigMap.
- **Explicación sencilla:** ConfigMaps no fueron implementados. Variables no sensibles como `STARTUP_DELAY_SECONDS`, `APP_COLOR` o `APP_VERSION` podrían haberse centralizado allí.
- **Cómo explicarlo al profesor:** “Usamos valores directos en los Deployments. Un ConfigMap habría separado la configuración no secreta de los manifiestos.”
- **Posibles preguntas del profesor:** ¿Diferencia entre Secret y ConfigMap?
- **Respuestas cortas para memorizar:** “Secret es para datos sensibles; ConfigMap para configuración normal.”

## 13. Trivy y escaneo de vulnerabilidades

**Concepto:** Trivy

**Qué es:** Un escáner de vulnerabilidades de sistemas operativos y librerías dentro de imágenes.

**Por qué se usa:** Impide promover artefactos con vulnerabilidades críticas conocidas.

**Cómo se implementó en ESTE proyecto:** Se configuró `aquasecurity/trivy-action@master` con severidad `CRITICAL`, `exit-code: 1`, `ignore-unfixed: true` y tipos `os,library`. El problema es que el escaneo aparece antes de construir la imagen del commit.

**Archivo donde está:** `.github/workflows/ci-cd.yml`, `mds/pasos.md`, `informe_practica_cicd.pdf`

**Cómo responder en menos de 30 segundos:** “Trivy está configurado para bloquear vulnerabilidades críticas, pero el workflow actual debe construir o cargar la imagen antes de escanearla. La evidencia del informe muestra ese paso fallido.”

- **Posibles preguntas del profesor:** ¿Qué hace `exit-code: 1`? ¿Qué hace `ignore-unfixed`?
- **Respuestas cortas para memorizar:** “Marca el job como fallido si encuentra una vulnerabilidad crítica.” / “Ignora vulnerabilidades que todavía no tienen solución disponible.”

## 14. Registro de imágenes

**Concepto:** Registry / GHCR

**Qué es:** Un repositorio remoto para almacenar y distribuir imágenes de contenedores.

**Por qué se usa:** Permite que Kubernetes descargue un artefacto construido previamente.

**Cómo se implementó en ESTE proyecto:** El workflow inicia sesión en `ghcr.io` con `GITHUB_TOKEN` y configura tags con el SHA y `latest`. Los manifiestos consumen `ghcr.io/scomygod/inventario-app:latest`.

**Archivo donde está:** `.github/workflows/ci-cd.yml`, `k8s/deployment.yaml`, `k8s/blue-green/deployment-blue.yaml`, `k8s/blue-green/deployment-green.yaml`

**Cómo responder en menos de 30 segundos:** “GHCR almacena la imagen. El SHA identifica un artefacto exacto; `latest` es mutable y menos seguro para rollback.”

- **Posibles preguntas del profesor:** ¿Por qué usar SHA además de `latest`?
- **Respuestas cortas para memorizar:** “El SHA da trazabilidad e inmutabilidad; `latest` solo señala la publicación más reciente.”

## 15. Deploy

- **Tema:** Promoción a Kubernetes
- **Archivo donde se explica o implementa:** `README.md`, `k8s/deployment.yaml`, `k8s/service.yaml`, `k8s/blue-green/deployment-blue.yaml`, `k8s/blue-green/deployment-green.yaml`, `k8s/blue-green/service.yaml`
- **Explicación sencilla:** El deploy se realiza manualmente con `kubectl apply`. El workflow no contiene una etapa que se conecte al clúster ni actualice la imagen.
- **Cómo explicarlo al profesor:** “La automatización llega hasta la imagen; la aplicación de manifiestos en Minikube es manual.”
- **Posibles preguntas del profesor:** ¿Qué faltaría para CD automático?
- **Respuestas cortas para memorizar:** “Credenciales seguras del clúster y un job que actualice o aplique los manifiestos, seguido de una verificación del rollout.”

## 16. Rollback

- **Tema:** Recuperación ante una versión defectuosa
- **Archivo donde se explica o implementa:** `README.md`, `mds/metricas.md`, `k8s/blue-green/service.yaml`
- **Explicación sencilla:** En Blue-Green, el rollback conceptual consiste en hacer que el Service vuelva a seleccionar Blue. No existe un script automático ni aparece `kubectl rollout undo` en el proyecto.
- **Cómo explicarlo al profesor:** “Como Blue sigue encendido, regreso el selector del Service a `version: blue`. Es rápido, pero manual.”
- **Posibles preguntas del profesor:** ¿Qué riesgo tiene usar `latest`?
- **Respuestas cortas para memorizar:** “Puede cambiar y dificulta saber exactamente qué imagen representa cada entorno.”

## 17. Health Checks

- **Tema:** Readiness, liveness y arranque lento
- **Archivo donde se explica o implementa:** `server.js`, `k8s/deployment.yaml`, `server.test.js`
- **Explicación sencilla:** `/health` responde 503 durante `STARTUP_DELAY_SECONDS`, 500 ante fallo o base inaccesible y 200 cuando está listo. Readiness decide si recibe tráfico; liveness decide si debe reiniciarse.
- **Cómo explicarlo al profesor:** “La aplicación simula 30 segundos de arranque. Readiness debe mantenerla fuera del Service, pero la liveness actual también ve el 503 y podría reiniciarla antes de que termine.”
- **Posibles preguntas del profesor:** ¿Readiness reinicia un Pod? ¿Cómo se corregiría?
- **Respuestas cortas para memorizar:** “No; solo lo retira de los endpoints.” / “Se puede usar `startupProbe` o retrasar/ajustar liveness.”

## 18. Persistencia de datos

- **Tema:** Estado efímero del contenedor
- **Archivo donde se explica o implementa:** `db.js`, `README.md`, `informe_practica_cicd.pdf`
- **Explicación sencilla:** Cada contenedor escribe en `data/products.json`. No existe volumen persistente, por lo que un Pod recreado pierde los productos agregados y vuelve a generar los tres registros `SEED`.
- **Cómo explicarlo al profesor:** “La aplicación guarda datos dentro del contenedor. Al reemplazarlo, se pierden los cambios; para producción usaría un PVC o una base de datos externa.”
- **Posibles preguntas del profesor:** ¿Con dos réplicas ambas ven los mismos datos?
- **Respuestas cortas para memorizar:** “No. Cada Pod tiene su propio archivo, así que pueden responder con catálogos diferentes.”

## 19. Métricas DORA

**Concepto:** Métricas DORA

**Qué es:** Indicadores que miden velocidad y estabilidad de la entrega de software.

**Por qué se usa:** Permiten evaluar el proceso con datos, no solo decir que el pipeline es rápido.

**Cómo se implementó en ESTE proyecto:** El PDF reporta Lead Time promedio de 11,33 minutos, 8 despliegues por día y Change Failure Rate de 25 %. Sin embargo, la tabla contiene hashes inexistentes en el historial actual y el repositorio no guarda horas de deploy; por eso las cifras no son verificables aquí.

**Archivo donde está:** `informe_practica_cicd.pdf`, explicación y ejemplos en `mds/metricas.md`

**Cómo responder en menos de 30 segundos:** “El informe presenta 11,33 minutos de Lead Time, 8 despliegues por día y 25 % de fallos. Debo aclarar que faltan registros verificables de los despliegues y varios hashes no existen en este repositorio.”

- **Posibles preguntas del profesor:** ¿Qué mide cada una?
- **Respuestas cortas para memorizar:** “Lead Time: commit a producción.” / “Deployment Frequency: cuántas entregas.” / “Change Failure Rate: porcentaje que exige corrección o rollback.”

## 20. Evidencias obtenidas

- **Tema:** Pruebas mostradas y comprobables
- **Archivo donde se explica o implementa:** `informe_practica_cicd.pdf`, `server.test.js`, `README.md`
- **Explicación sencilla:** El PDF contiene capturas de build local, endpoints, jobs de Actions, paquete de GHCR, rollout, cambio Blue-Green, Secret, Trivy y Pods. La revisión actual confirma 5 pruebas exitosas, build Docker exitoso y manifiestos válidos en dry-run.
- **Cómo explicarlo al profesor:** “Hay evidencia visual en el PDF y evidencia reproducible en los archivos. No debo afirmar que Trivy pasó: su propia captura muestra el job en rojo.”
- **Posibles preguntas del profesor:** ¿Cuál evidencia es más confiable?
- **Respuestas cortas para memorizar:** “La reproducible con comandos y logs completos; una captura aislada necesita contexto.”

## 21. Resultados

- **Tema:** Qué funciona y qué queda incompleto
- **Archivo donde se explica o implementa:** Todo el proyecto; resumen en `README.md` e `informe_practica_cicd.pdf`
- **Explicación sencilla:** Funcionan la aplicación, las 5 pruebas, el Dockerfile multi-stage, los manifiestos base y el cambio de selector Blue-Green. Quedan defectos en el orden de Trivy, la interacción entre liveness y el retraso, y la trazabilidad de versiones y métricas.
- **Cómo explicarlo al profesor:** “La base técnica es demostrable, pero identificamos límites reales. Eso también es parte del aprendizaje de CI/CD: verificar que la configuración haga lo que afirma la documentación.”
- **Posibles preguntas del profesor:** ¿La práctica está completamente terminada?
- **Respuestas cortas para memorizar:** “No completamente: el deploy es manual y hay configuraciones que requieren corrección.”

## 22. Conclusiones

- **Tema:** Aprendizaje principal
- **Archivo donde se explica o implementa:** `informe_practica_cicd.pdf`, `README.md`
- **Explicación sencilla:** Docker mejora la reproducibilidad; GitHub Actions automatiza las validaciones; Kubernetes controla réplicas y estrategias de actualización. La seguridad, las probes, la persistencia y las métricas solo son útiles si se configuran y evidencian correctamente.
- **Cómo explicarlo al profesor:** “La práctica demuestra que CI/CD no es solo escribir YAML: hay que ordenar bien las etapas, usar artefactos trazables, configurar salud correctamente y medir con datos reales.”
- **Posibles preguntas del profesor:** ¿Cuál fue el mayor aprendizaje?
- **Respuestas cortas para memorizar:** “Que automatizar no basta; cada etapa debe ser verificable, segura y coherente con producción.”

---

# Preguntas difíciles que podría hacer el profesor

1. **¿Por qué usar GitHub Actions?**  
   Porque automatiza pruebas y publicación desde el mismo repositorio con cada push a `main`.

2. **¿Qué hace cada etapa del pipeline?**  
   `build-test` instala y prueba; `build-push` autentica, intenta escanear y configura build/publicación.

3. **¿Qué significa fail-fast?**  
   Detener el flujo lo antes posible cuando una validación falla.

4. **¿Qué pasa si fallan las pruebas?**  
   `build-push` no se ejecuta por `needs: build-test`.

5. **¿Por qué el workflow actual puede fallar en Trivy?**  
   Porque intenta escanear la imagen del SHA antes de construirla o cargarla.

6. **¿Qué pasa si Trivy encuentra una vulnerabilidad crítica?**  
   Devuelve código 1 y bloquea los pasos posteriores del job.

7. **¿Trivy demostró un escaneo exitoso?**  
   No. La evidencia del PDF muestra el paso y el job en rojo.

8. **¿Por qué usar Docker multi-stage?**  
   Para separar pruebas y construcción de la imagen final de producción.

9. **¿Qué pasa si `npm test` falla dentro del Dockerfile?**  
   El build se aborta y la imagen final no se genera.

10. **¿Qué hace Docker en este proyecto?**  
    Empaqueta Node, dependencias, servidor e interfaz en un artefacto reproducible.

11. **¿Qué hace el registry?**  
    Almacena la imagen para que otros entornos, como Kubernetes, puedan descargarla.

12. **¿Por qué el SHA es mejor que `latest`?**  
    El SHA identifica una imagen exacta; `latest` puede cambiar.

13. **¿Qué hace Kubernetes?**  
    Mantiene réplicas, reemplaza Pods y expone la aplicación mediante Services.

14. **¿Qué diferencia hay entre Pod y Deployment?**  
    El Pod ejecuta contenedores; el Deployment administra y reemplaza Pods.

15. **¿Qué hace el Service?**  
    Da una dirección estable y dirige tráfico a Pods que coinciden con sus etiquetas.

16. **¿Cómo funciona Rolling Update?**  
    Sustituye Pods gradualmente respetando límites de disponibilidad y exceso.

17. **¿Qué significan `maxUnavailable: 1` y `maxSurge: 1`?**  
    Puede faltar como máximo un Pod y crearse como máximo uno adicional.

18. **¿Por qué Blue-Green?**  
    Permite preparar dos entornos y cambiar todo el tráfico mediante el Service.

19. **¿Qué diferencia hay entre Rolling Update y Blue-Green?**  
    Rolling reemplaza Pods poco a poco; Blue-Green cambia entre dos entornos completos.

20. **¿Cómo funciona el rollback Blue-Green?**  
    Se cambia el selector del Service nuevamente a `version: blue`.

21. **¿El rollback está automatizado?**  
    No. Está explicado como cambio manual del selector.

22. **¿Blue y Green ejecutan versiones diferentes?**  
    No en los manifiestos actuales: ambos usan `latest` y solo cambia `APP_COLOR`.

23. **¿Canary existe en el proyecto?**  
    Solo como explicación teórica en `mds/metricas.md`; no hay manifiestos Canary.

24. **¿Qué ventaja tendría Canary?**  
    Exponer primero a pocos usuarios y limitar el impacto de una versión defectuosa.

25. **¿Qué diferencia hay entre Secret y ConfigMap?**  
    Secret separa datos sensibles; ConfigMap guarda configuración no sensible.

26. **¿El valor de `API_KEY` está versionado?**  
    No. Se crea manualmente y los YAML solo contienen `secretKeyRef`.

27. **¿La aplicación usa realmente `API_KEY`?**  
    No. Se inyecta en el contenedor, pero `server.js` no la consulta.

28. **¿Qué ocurre si `api-secret` no existe?**  
    El Pod no puede iniciar porque la referencia es obligatoria.

29. **¿Qué diferencia hay entre readiness y liveness?**  
    Readiness controla tráfico; liveness decide si Kubernetes reinicia el contenedor.

30. **¿Qué problema tienen las probes actuales?**  
    Liveness puede acumular tres fallos antes de los 30 segundos y reiniciar el Pod.

31. **¿Cómo se solucionaría el arranque lento?**  
    Con una `startupProbe` o retrasando y ajustando liveness.

32. **¿Aumentar réplicas soluciona el arranque lento?**  
    No. Solo crea más Pods con el mismo problema de inicialización.

33. **¿Qué pasa con los datos al borrar un Pod?**  
    Se pierden los productos agregados; `db.js` vuelve a crear los tres productos semilla.

34. **¿Dos réplicas comparten el catálogo?**  
    No. Cada Pod usa su propio archivo local.

35. **¿Cómo se resolvería la persistencia?**  
    Con un volumen persistente o, preferiblemente, una base de datos externa compartida.

36. **¿Qué son las métricas DORA?**  
    Indicadores para medir velocidad y estabilidad de la entrega.

37. **¿Cuáles métricas reporta el informe?**  
    Lead Time de 11,33 minutos, 8 despliegues por día y 25 % de fallos.

38. **¿Esas cifras DORA son verificables en el repositorio?**  
    No completamente: faltan logs de deploy y varios hashes de la tabla no existen.

39. **¿El pipeline despliega automáticamente?**  
    No. No contiene pasos de `kubectl` ni acceso al clúster.

40. **¿Cuál es la conclusión más honesta de la práctica?**  
    La base funciona, pero CI/CD debe evaluarse por el comportamiento real y no solo por lo escrito en la documentación.
