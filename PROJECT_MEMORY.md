# Memoria del proyecto: Rotacion Rural

Actualizada: 2026-07-21

## Proposito

PWA privada para acompanar una rotacion rural en Santiago del Estero. Permite compartir diario, mensajes, agenda, contactos y planes para la vuelta entre dos personas, con login por email y notificaciones Web Push.

## Repositorio y sitios

- Repositorio: `SantiFernandez17/rotacion-rural`
- Rama de trabajo y despliegue: `main`
- Sitio principal: `https://rotacion-rural.santuli.org/`
- Worker de Cloudflare: `https://rotacion-rural-totoe.10santifernande.workers.dev`
- Directorio de la app: `rotacion-rural-app/`
- Backend AWS SAM: `aws/`

El dominio principal esta protegido con Cloudflare Access. Una consulta sin sesion devuelve la pantalla de Access, incluso para archivos como `app.js` o `service-worker.js`. Eso es esperado.

## Arquitectura actual

```text
iPhone / navegador
  -> Cloudflare Access
  -> PWA estatica en Cloudflare Worker
  -> Cognito Hosted UI (login por email)
  -> API Gateway HTTP API
  -> Lambda + DynamoDB
```

La app conserva una copia local en `localStorage`, pero al iniciar sesion carga la informacion compartida desde AWS.

## AWS

- Region: `us-east-1`
- Stack SAM: `sam-app`
- Tabla DynamoDB: `rotacion-rural-state`
- API: `https://vry8qsj2yd.execute-api.us-east-1.amazonaws.com`
- User Pool: `us-east-1_RcCcY4QbF`
- Cliente Cognito: `3bocrh1p2cqpbql828kvu798ip`
- Dominio Cognito: `https://rotacion-rural-santi-871470318827.auth.us-east-1.amazoncognito.com`

No guardar ni publicar claves VAPID privadas, contrasenas ni tokens. Las claves VAPID ya estan configuradas como parametros secretos del stack y variables de entorno de Lambda.

## Datos compartidos

El item `rotacion-rural-main` contiene el estado general:

- Perfil, checklist, diario, mensajes, contactos y agenda.
- Estas secciones se guardan como un documento compartido completo. Si ambos editan exactamente al mismo tiempo, el ultimo guardado puede prevalecer.

Los planes para la vuelta NO viven dentro de ese documento. Cada plan es un item independiente:

```text
rotacion-rural-plan#<id>
```

La app usa `GET`, `POST`, `PUT` y `DELETE` sobre `/plans`. Esto evita que una copia vieja de un telefono pueda borrar toda la lista. El 2026-07-20 se migraron los 4 planes existentes a este formato.

Documentacion detallada de la base: `aws/DATABASE.md`.

## Notificaciones

- Cada cuenta puede elegir su propio mensaje y hora.
- EventBridge ejecuta `NotificationFunction` cada minuto.
- Zona horaria: `America/Argentina/Buenos_Aires`.
- La notificacion se envia a los dispositivos registrados de la otra cuenta, no al emisor.
- Si el dispositivo se registra despues de la hora exacta, Lambda reintenta durante 6 horas, incluso si cruza medianoche.
- Solo se registra como enviada cuando al menos un dispositivo acepta el push.
- El widget "Mensaje recibido" muestra la ultima notificacion guardada para cada usuario.
- El panel incluye "Enviar prueba ahora". Primero guarda el mensaje y luego intenta enviarlo a la otra persona.

Para recibir Web Push en iPhone, la app debe estar agregada a la pantalla de inicio, la persona debe iniciar sesion y tocar "Activar en este navegador". Si se reinstala la PWA o se borran los datos del sitio, hay que activarlas otra vez.

## Despliegue

### AWS

Desde `aws/`:

```powershell
sam build
sam deploy
```

`samconfig.toml` contiene los valores normales. Las claves VAPID no estan en Git; al actualizar el stack hay que conservar los valores ya configurados en Lambda o ingresarlos mediante los parametros de SAM.

### Cloudflare

Desde la raiz del repositorio:

```powershell
.\deploy-cloudflare.ps1
```

El script prepara `.cloudflare-deploy/` y publica el Worker `rotacion-rural-totoe`. No agregar esa carpeta al repositorio.

Cada cambio visual que deba verse en la PWA debe aumentar `CACHE_NAME` en `rotacion-rural-app/service-worker.js`. La version actual es `rotacion-rural-v11`.

## Verificaciones utiles

- Validar infraestructura: `sam validate --lint`.
- Validar JavaScript: `node --check aws/src/state.js`, `node --check aws/src/notifications.js`, `node --check rotacion-rural-app/app.js`.
- Verificar stack: `aws cloudformation describe-stacks --stack-name sam-app --region us-east-1`.
- Ver logs de notificaciones: revisar el grupo de logs de `NotificationFunction` en CloudWatch.
- Probar la funcion desde la app con "Enviar prueba ahora" despues de que ambos dispositivos hayan activado notificaciones.

## Estado al 2026-07-21

- Commit de correccion publicado: `d8badfc` (`Corregir notificaciones y proteger planes compartidos`).
- AWS: `UPDATE_COMPLETE`.
- Cloudflare: publicado con el Worker version `e668be75-de86-48d6-b0a1-48519ff6c557` antes del ultimo commit; los archivos de la app correspondientes ya fueron desplegados.
- Se verificaron 4 planes independientes en DynamoDB.
- Se verifico que intentar actualizar un plan inexistente devuelve `404` y no crea un item vacio.
- No se envio una notificacion real durante la comprobacion tecnica para no enviar mensajes inesperados.

## Criterios para cambios futuros

- No borrar ni modificar manualmente `rotacion-rural-main` sin backup.
- No borrar items `rotacion-rural-plan#...` salvo que se quiera eliminar ese plan puntual.
- Antes de tocar autenticacion, dominios o secretos, revisar `aws/template.yaml`, `aws/samconfig.toml` y `rotacion-rural-app/aws-config.js`.
- Antes de asumir que una actualizacion no llego al iPhone, cerrar y reabrir la PWA para permitir que el service worker nuevo tome control.
