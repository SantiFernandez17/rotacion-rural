# Contexto para continuar este proyecto en otro chat

Pegale este texto al nuevo chat o pedi que lea este archivo antes de hacer cambios.

```text
Estoy trabajando en el proyecto "Rotacion Rural".

Repositorio local:
C:\Users\santi\OneDrive\Documentos\Kubernetes\rotacion-rural-github

GitHub:
https://github.com/SantiFernandez17/rotacion-rural

Rama que se usa directamente para publicar: main.

Primero lee PROJECT_MEMORY.md y, si vas a tocar AWS/DynamoDB, tambien aws/DATABASE.md.

Que es la pagina:
Es una PWA privada para que una pareja comparta informacion durante una rotacion rural en Santiago del Estero. Tiene diario, mensajes, agenda, contactos de emergencia, cuenta regresiva, planes para la vuelta, calendario de la visita a Merlo, login por email, sincronizacion AWS y notificaciones Web Push.

Sitio:
https://rotacion-rural.santuli.org/

Importante: el dominio usa Cloudflare Access. Sin una sesion autorizada puede mostrar una pagina de Access en vez de la app. Eso no significa que el deploy este fallando.

Donde esta el codigo:
- Frontend/PWA: rotacion-rural-app/
  - app.js: comportamiento y llamadas a AWS.
  - styles.css: estilos.
  - service-worker.js: cache PWA y recepcion de push.
  - aws-config.js: configuracion publica de Cognito/API/VAPID publica.
- Backend AWS: aws/
  - src/state.js: API de estado, planes, suscripciones y prueba de notificacion.
  - src/notifications.js: envio diario programado.
  - template.yaml: infraestructura SAM.
  - DATABASE.md: modelo de DynamoDB y guia de consulta.

Arquitectura resumida:
iPhone/navegador -> Cloudflare Access -> PWA en Cloudflare Worker -> Cognito -> API Gateway -> Lambda -> DynamoDB.

Datos:
- El estado general compartido esta en DynamoDB, item rotacion-rural-main.
- Los planes para la vuelta son items independientes: rotacion-rural-plan#<id>.
- La agenda de Merlo reutiliza esos planes y guarda `date` mas `timeSlot` (`morning`, `afternoon` o `night`) en cada item.
- No volver a guardar plans dentro del documento general; asi se evita que una copia vieja borre la lista completa.

Notificaciones:
- Cada usuario elige mensaje y horario.
- El boton "Enviar prueba ahora" primero guarda la configuracion y luego envia a la otra persona.
- La otra persona debe haber iniciado sesion, agregado la PWA a pantalla de inicio en iPhone y tocado "Activar en este navegador".
- Se corrigio el 2026-07-25 el campo reservado timezone de DynamoDB. No revertir el alias #timezone en aws/src/state.js.

Como trabajar y publicar:
1. Abrir PowerShell en la raiz del repo:
   cd C:\Users\santi\OneDrive\Documentos\Kubernetes\rotacion-rural-github
2. Revisar cambios existentes antes de editar:
   git status --short
3. Hacer cambios puntuales y validar.
4. Para cambios de frontend, publicar Cloudflare:
   .\deploy-cloudflare.ps1
   Si se cambia app.js, styles.css u otros recursos cacheados, aumentar CACHE_NAME en rotacion-rural-app/service-worker.js.
5. Para cambios de backend, publicar AWS:
   cd aws
   sam build
   sam deploy
   Las claves VAPID privadas no estan en Git: no inventarlas, no imprimirlas ni reemplazarlas. Conservar los valores existentes del stack/Lambda.
6. Volver a la raiz y subir el codigo:
   git add <solo-los-archivos-modificados>
   git commit -m "Descripcion corta del cambio"
   git push origin main

No usar git reset --hard, git checkout -- ni borrar datos de DynamoDB sin una instruccion explicita.
No exponer tokens, contrasenas ni claves VAPID privadas en el chat, commits o documentos.

Estado conocido al 2026-08-03:
- Los mensajes diarios, las cartas compartidas y los planes muestran un cartel solamente despues de que AWS confirma el guardado.
- La portada usa un tema oscuro y muestra cuenta regresiva, ultimo mensaje recibido, planes pendientes y el formulario para programar el mensaje diario.
- La navegacion inferior muestra Inicio, Merlo y Mensajes. Diario, SOS y Agenda de rotacion siguen en los datos historicos pero ya no tienen pestanas.
- Merlo permite organizar los planes compartidos del 6 al 12 de agosto de 2026, divididos en manana, tarde y noche.
- Frontend del calendario publicado en Cloudflare con la version d4f28678-8d75-46eb-820e-9c2acd617857.
- Frontend publicado en Cloudflare con la version f13e157c-d232-4851-a31c-228f26608f51.
- Cache PWA actual: rotacion-rural-v15.
- El despliegue de Cloudflare usa wrangler.jsonc con assets.directory; no volver a pasar la carpeta como argumento interactivo de wrangler deploy.
- Stack AWS: sam-app, region us-east-1.
- Tabla DynamoDB: rotacion-rural-state.
- API: https://vry8qsj2yd.execute-api.us-east-1.amazonaws.com
- Se verificaron cuatro planes independientes y una prueba de guardado de notificaciones con respuesta 200 OK.
```
