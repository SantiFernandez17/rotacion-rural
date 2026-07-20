const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("node:crypto");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.TABLE_NAME;
const stateId = process.env.STATE_ID || "rotacion-rural-main";
const settingsId = process.env.NOTIFICATION_SETTINGS_ID || "rotacion-rural-notification-settings";
const allowedEmails = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

exports.handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {};
  const email = String(claims.email || "").toLowerCase();

  if (allowedEmails.length && !allowedEmails.includes(email)) {
    return json(403, { message: "Usuario no autorizado." });
  }

  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  if (method === "GET" && path === "/state") {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: stateId }
      })
    );

    return json(200, {
      state: result.Item?.state || null,
      updatedAt: result.Item?.updatedAt || null,
      updatedBy: result.Item?.updatedBy || null
    });
  }

  if (method === "PUT" && path === "/state") {
    const body = parseBody(event.body);

    if (!body?.state || typeof body.state !== "object") {
      return json(400, { message: "El body debe incluir { state: {...} }." });
    }

    const item = {
      id: stateId,
      state: body.state,
      updatedAt: new Date().toISOString(),
      updatedBy: email || claims.sub || "unknown"
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item
      })
    );

    return json(200, {
      ok: true,
      updatedAt: item.updatedAt,
      updatedBy: item.updatedBy
    });
  }

  if (method === "GET" && path === "/notification-settings") {
    const result = await client.send(new GetCommand({ TableName: tableName, Key: { id: settingsId } }));
    return json(200, {
      message: result.Item?.message || "Buen dia, mi amor. Espero que tengas un lindo dia.",
      enabled: result.Item?.enabled !== false,
      hour: result.Item?.hour || 10,
      timezone: result.Item?.timezone || "America/Argentina/Buenos_Aires"
    });
  }

  if (method === "PUT" && path === "/notification-settings") {
    const body = parseBody(event.body);
    const message = String(body?.message || "").trim();
    if (!message || message.length > 500) {
      return json(400, { message: "El mensaje debe tener entre 1 y 500 caracteres." });
    }

    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        id: settingsId,
        message,
        enabled: body?.enabled !== false,
        hour: 10,
        timezone: "America/Argentina/Buenos_Aires",
        updatedAt: new Date().toISOString(),
        updatedBy: email || claims.sub || "unknown"
      }
    }));
    return json(200, { ok: true });
  }

  if (method === "POST" && path === "/push-subscription") {
    const body = parseBody(event.body);
    const subscription = body?.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return json(400, { message: "La suscripcion Web Push no es valida." });
    }

    const endpointId = crypto.createHash("sha256").update(subscription.endpoint).digest("hex");
    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        id: `rotacion-rural-push#${endpointId}`,
        subscription,
        email: email || claims.sub || "unknown",
        updatedAt: new Date().toISOString()
      }
    }));
    return json(200, { ok: true });
  }

  return json(405, { message: "Metodo no permitido." });
};

function parseBody(body) {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  };
}
