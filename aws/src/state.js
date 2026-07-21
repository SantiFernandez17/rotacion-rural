const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("node:crypto");
const webpush = require("web-push");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.TABLE_NAME;
const stateId = process.env.STATE_ID || "rotacion-rural-main";
const settingsPrefix = process.env.NOTIFICATION_SETTINGS_PREFIX || "rotacion-rural-notification-settings#";
const inboxPrefix = process.env.NOTIFICATION_INBOX_PREFIX || "rotacion-rural-notification-inbox#";
const planPrefix = process.env.PLAN_PREFIX || "rotacion-rural-plan#";
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

  if (method === "GET" && path === "/plans") {
    const result = await client.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: "begins_with(#id, :prefix)",
      ExpressionAttributeNames: { "#id": "id" },
      ExpressionAttributeValues: { ":prefix": planPrefix }
    }));
    let planItems = result.Items || [];

    // Migrate the plans that were previously embedded in the shared state.
    if (!planItems.length) {
      const legacyResult = await client.send(new GetCommand({
        TableName: tableName,
        Key: { id: stateId }
      }));
      const legacyPlans = Array.isArray(legacyResult.Item?.state?.plans)
        ? legacyResult.Item.state.plans
        : [];

      planItems = legacyPlans
        .filter((plan) => String(plan?.title || "").trim())
        .map((plan) => {
          const planId = safePlanId(plan.id);
          return {
            id: `${planPrefix}${planId}`,
            planId,
            title: String(plan.title).trim().slice(0, 120),
            category: String(plan.category || "Plan").slice(0, 40),
            date: String(plan.date || "").slice(0, 10),
            createdBy: String(plan.createdBy || legacyResult.Item?.updatedBy || "unknown").slice(0, 200),
            done: Boolean(plan.done),
            updatedAt: legacyResult.Item?.updatedAt || new Date().toISOString(),
            updatedBy: legacyResult.Item?.updatedBy || "migration"
          };
        });

      await Promise.all(planItems.map((item) => client.send(new PutCommand({ TableName: tableName, Item: item }))));
      if (legacyPlans.length) {
        await client.send(new UpdateCommand({
          TableName: tableName,
          Key: { id: stateId },
          UpdateExpression: "REMOVE #state.#plans",
          ExpressionAttributeNames: { "#state": "state", "#plans": "plans" }
        }));
      }
    }

    return json(200, { plans: planItems.map(toPlan) });
  }

  if (method === "POST" && path === "/plans") {
    const body = parseBody(event.body);
    const input = body?.plan;
    const title = String(input?.title || "").trim();
    if (!title || title.length > 120) {
      return json(400, { message: "El plan debe tener entre 1 y 120 caracteres." });
    }

    const planId = safePlanId(input?.id);
    const item = {
      id: `${planPrefix}${planId}`,
      planId,
      title,
      category: String(input?.category || "Plan").slice(0, 40),
      date: String(input?.date || "").slice(0, 10),
      createdBy: String(email || claims.sub || input?.createdBy || "unknown").slice(0, 200),
      done: Boolean(input?.done),
      updatedAt: new Date().toISOString(),
      updatedBy: email || claims.sub || "unknown"
    };
    await client.send(new PutCommand({ TableName: tableName, Item: item }));
    return json(200, { plan: toPlan(item) });
  }

  if (method === "PUT" && path.startsWith("/plans/")) {
    const planId = decodeURIComponent(path.slice("/plans/".length));
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(planId)) return json(400, { message: "Plan invalido." });
    const body = parseBody(event.body);
    try {
      const result = await client.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: `${planPrefix}${planId}` },
        ConditionExpression: "attribute_exists(id)",
        UpdateExpression: "SET done = :done, updatedAt = :updatedAt, updatedBy = :updatedBy",
        ExpressionAttributeValues: {
          ":done": Boolean(body?.done),
          ":updatedAt": new Date().toISOString(),
          ":updatedBy": email || claims.sub || "unknown"
        },
        ReturnValues: "ALL_NEW"
      }));
      return json(200, { plan: toPlan(result.Attributes) });
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") {
        return json(404, { message: "El plan ya no existe. Sincroniza la lista para actualizarla." });
      }
      throw error;
    }
  }

  if (method === "DELETE" && path.startsWith("/plans/")) {
    const planId = decodeURIComponent(path.slice("/plans/".length));
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(planId)) return json(400, { message: "Plan invalido." });
    await client.send(new DeleteCommand({ TableName: tableName, Key: { id: `${planPrefix}${planId}` } }));
    return json(200, { ok: true });
  }

  if (method === "GET" && path === "/notification-settings") {
    if (!email) return json(401, { message: "La sesion no incluye un email valido." });
    const result = await client.send(new GetCommand({
      TableName: tableName,
      Key: { id: notificationSettingsId(email) }
    }));
    if (!result.Item) {
      await client.send(new PutCommand({
        TableName: tableName,
        Item: {
          id: notificationSettingsId(email),
          ownerEmail: email,
          message: "Buen dia, mi amor. Espero que tengas un lindo dia.",
          enabled: false,
          time: "10:00",
          timezone: "America/Argentina/Buenos_Aires",
          updatedAt: new Date().toISOString(),
          updatedBy: email
        }
      }));
    }
    return json(200, {
      message: result.Item?.message || "Buen dia, mi amor. Espero que tengas un lindo dia.",
      enabled: result.Item ? result.Item.enabled !== false : false,
      time: result.Item?.time || "10:00",
      timezone: result.Item?.timezone || "America/Argentina/Buenos_Aires"
    });
  }

  if (method === "PUT" && path === "/notification-settings") {
    if (!email) return json(401, { message: "La sesion no incluye un email valido." });
    const body = parseBody(event.body);
    const message = String(body?.message || "").trim();
    const time = String(body?.time || "").trim();
    if (!message || message.length > 500) {
      return json(400, { message: "El mensaje debe tener entre 1 y 500 caracteres." });
    }
    if (!isValidTime(time)) {
      return json(400, { message: "La hora debe tener formato HH:MM." });
    }

    await client.send(new UpdateCommand({
      TableName: tableName,
      Key: { id: notificationSettingsId(email) },
      UpdateExpression: "SET ownerEmail = :ownerEmail, #message = :message, enabled = :enabled, #time = :time, timezone = :timezone, updatedAt = :updatedAt, updatedBy = :updatedBy",
      ExpressionAttributeNames: { "#message": "message", "#time": "time" },
      ExpressionAttributeValues: {
        ":ownerEmail": email,
        ":message": message,
        ":enabled": body?.enabled !== false,
        ":time": time,
        ":timezone": "America/Argentina/Buenos_Aires",
        ":updatedAt": new Date().toISOString(),
        ":updatedBy": email
      }
    }));
    return json(200, { ok: true });
  }

  if (method === "GET" && path === "/notification-inbox") {
    if (!email) return json(401, { message: "La sesion no incluye un email valido." });
    const result = await client.send(new GetCommand({
      TableName: tableName,
      Key: { id: notificationInboxId(email) }
    }));
    return json(200, {
      message: result.Item?.message || "",
      sentAt: result.Item?.sentAt || ""
    });
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

  if (method === "POST" && path === "/notification-test") {
    if (!email) return json(401, { message: "La sesion no incluye un email valido." });
    const settings = await client.send(new GetCommand({
      TableName: tableName,
      Key: { id: notificationSettingsId(email) }
    }));
    if (!settings.Item?.message) return json(400, { message: "Guarda primero tu mensaje diario." });

    const subscriptions = await client.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: "begins_with(#id, :prefix)",
      ExpressionAttributeNames: { "#id": "id" },
      ExpressionAttributeValues: { ":prefix": "rotacion-rural-push#" }
    }));
    const recipients = (subscriptions.Items || []).filter((item) => item.email && item.email !== email);
    if (!recipients.length) {
      return json(409, { message: "La otra persona todavia no activo las notificaciones en su dispositivo." });
    }

    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const sentAt = new Date().toISOString();
    const payload = JSON.stringify({ title: "Prueba de Rotacion Rural", body: settings.Item.message, url: "/", sentAt });
    const deliveredEmails = new Set();

    for (const recipient of recipients) {
      try {
        await webpush.sendNotification(recipient.subscription, payload);
        deliveredEmails.add(recipient.email);
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          await client.send(new DeleteCommand({ TableName: tableName, Key: { id: recipient.id } }));
        } else {
          console.error("Fallo el envio de prueba", error);
        }
      }
    }

    for (const recipientEmail of deliveredEmails) {
      await client.send(new PutCommand({
        TableName: tableName,
        Item: {
          id: notificationInboxId(recipientEmail),
          recipientEmail,
          senderEmail: email,
          message: settings.Item.message,
          sentAt
        }
      }));
    }

    if (!deliveredEmails.size) return json(502, { message: "Los dispositivos registrados rechazaron la notificacion. Volve a activarla en el telefono receptor." });
    return json(200, { ok: true, recipients: deliveredEmails.size });
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

function notificationSettingsId(email) {
  const userId = crypto.createHash("sha256").update(email).digest("hex");
  return `${settingsPrefix}${userId}`;
}

function notificationInboxId(email) {
  const userId = crypto.createHash("sha256").update(email).digest("hex");
  return `${inboxPrefix}${userId}`;
}

function toPlan(item = {}) {
  return {
    id: item.planId || String(item.id || "").slice(planPrefix.length),
    title: item.title || "",
    category: item.category || "Plan",
    date: item.date || "",
    createdBy: item.createdBy || "",
    done: Boolean(item.done)
  };
}

function safePlanId(value) {
  const requestedId = String(value || "");
  return /^[a-zA-Z0-9_-]{1,100}$/.test(requestedId) ? requestedId : crypto.randomUUID();
}

function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
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
