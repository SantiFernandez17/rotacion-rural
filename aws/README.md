# Backend AWS

Este backend agrega login por email con Cognito y sincronizacion compartida con DynamoDB.

## Despliegue

Requisitos:

- AWS CLI configurado.
- AWS SAM CLI instalado.
- Un prefijo unico para Cognito, por ejemplo `rotacion-rural-santi-2026`.

En Windows, si todavia no los tenes:

- AWS CLI: https://aws.amazon.com/cli/
- AWS SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

Despues de instalarlos, abrir una terminal nueva y configurar AWS:

```powershell
aws configure
```

Desde la carpeta del repo:

```powershell
cd C:\Users\santi\OneDrive\Documentos\Kubernetes\rotacion-rural-github\aws
sam build
sam deploy --guided
```

Valores sugeridos en `sam deploy --guided`:

- Stack Name: `rotacion-rural`
- AWS Region: `us-east-1`
- FrontendUrl: `https://rotacion-rural.santuli.org`
- LocalUrl: `http://localhost:4174`
- UserPoolDomainPrefix: algo unico, por ejemplo `rotacion-rural-santi-871470318827`
- AllowedEmails: tu mail y el de ella separados por coma

Ejemplo:

```text
santi@example.com,ella@example.com
```

Cuando termine, SAM muestra estos outputs:

- `ApiBaseUrl`
- `CognitoDomain`
- `UserPoolId`
- `UserPoolClientId`
- `Region`

Copialos en `rotacion-rural-app/aws-config.js` y cambia `enabled` a `true`.

## Crear usuarios

En AWS Console:

1. Abrir Cognito.
2. Entrar al User Pool `rotacion-rural-users`.
3. Crear dos usuarios con email: uno para ella y uno para vos.
4. Marcar el email como verificado si Cognito no lo hace automaticamente.

## Datos guardados

La API guarda el contenido general en un documento compartido de DynamoDB. Cada plan para la vuelta se guarda en un item independiente para evitar que un dispositivo desactualizado sobrescriba la lista completa. Las preferencias de notificaciones y las suscripciones Web Push tambien se guardan por separado. La app mantiene una copia local en el iPhone para seguir funcionando si no hay internet.

Para entender el modelo de datos y ver la base completa, leer `aws/DATABASE.md`.
