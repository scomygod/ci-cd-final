# Demostración del Escáner de Seguridad: Cuándo Trivy Bloquea y Cuándo Permite el Paso

En nuestro pipeline de CI/CD, hemos integrado la herramienta **Trivy** (Componente Adicional 2) para que actúe como una "aduana" o "puerta de seguridad". Su trabajo es escanear la imagen Docker recién construida y decidir si es lo suficientemente segura para ser publicada o no. 

A continuación, explicamos paso a paso los dos escenarios posibles para exponerlos en la presentación.

---

## 🚫 Escenario 1: Trivy BLOQUEA el Despliegue (Fallo de Seguridad)

En este escenario demostramos cómo el pipeline nos protege de enviar software inseguro a producción.

*   **Paso 1: El desarrollador sube código vulnerable.**
    Imaginemos que en nuestro proyecto tenemos una dependencia antigua o el sistema operativo base de la imagen Docker (Alpine) tiene fallos conocidos sin actualizar. El desarrollador hace un `git push`.
*   **Paso 2: Inicia la automatización (CI).**
    GitHub Actions detecta el cambio, descarga el código y pasa exitosamente las pruebas unitarias (`npm test`). El código funciona, así que se pasa al siguiente job.
*   **Paso 3: Construcción local de la imagen.**
    El pipeline construye la imagen de Docker, pero en lugar de subirla directamente a Internet, la deja "en espera" en la memoria de la máquina (usando `load: true`).
*   **Paso 4: El escaneo de Trivy entra en acción.**
    Trivy analiza cada capa de la imagen. Detecta, por ejemplo, que la librería `libcrypto3` y el paquete `tar` de Node.js tienen vulnerabilidades catalogadas como `CRITICAL` (ej. un CVE conocido que permite denegación de servicio).
*   **Paso 5: Trivy activa la alarma.**
    Como configuramos Trivy con los parámetros `severity: 'CRITICAL'` y `exit-code: '1'`, al encontrar estos fallos críticos, Trivy arroja un código de error al sistema.
*   **Paso 6: El pipeline se detiene de inmediato.**
    El proceso falla y se marca en rojo. **El paso de "Publicar imagen Docker" nunca se ejecuta.** Con esto demostramos que nuestra aplicación está blindada: es imposible que una versión altamente vulnerable llegue al servidor de Kubernetes, protegiendo así a la empresa y a los usuarios.

---

## ✅ Escenario 2: Trivy PERMITE el Despliegue (Código Seguro)

En este escenario demostramos el flujo ideal luego de aplicar buenas prácticas de seguridad.

*   **Paso 1: El desarrollador aplica el parche de seguridad.**
    El desarrollador arregla las vulnerabilidades: agrega `RUN apk upgrade --no-cache` en el `Dockerfile` para actualizar el sistema operativo y ejecuta `npm install tar@^7.5.19` para usar una versión segura de Node.js. Hace un nuevo `git push`.
*   **Paso 2: Inicia nuevamente la automatización (CI).**
    GitHub Actions vuelve a descargar el código y las pruebas pasan correctamente.
*   **Paso 3: Construcción local de la nueva imagen.**
    Se construye una nueva imagen Docker. Esta vez, la imagen lleva dentro el sistema operativo actualizado y las librerías reparadas.
*   **Paso 4: El escaneo de Trivy revisa los cambios.**
    Trivy escanea la nueva imagen construida. Verifica en su base de datos global de ciberseguridad y confirma que las vulnerabilidades críticas ya no están presentes. 
*   **Paso 5: Trivy da luz verde.**
    Al encontrar `0` vulnerabilidades `CRITICAL`, Trivy termina su trabajo silenciosamente sin emitir ningún error (`exit-code: 0`).
*   **Paso 6: Publicación y Despliegue exitoso.**
    Como Trivy no detuvo el proceso, el pipeline avanza al siguiente paso. La imagen segura se publica en GitHub Container Registry (`ghcr.io`) y queda lista para que Kubernetes la descargue y actualice los Pods mediante nuestra estrategia Blue-Green.
