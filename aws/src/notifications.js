const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand, PutCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("node:crypto");
const webpush = require("web-push");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.TABLE_NAME;
const settingsPrefix = process.env.NOTIFICATION_SETTINGS_PREFIX || "rotacion-rural-notification-settings#";
const inboxPrefix = process.env.NOTIFICATION_INBOX_PREFIX || "rotacion-rural-notification-inbox#";

exports.handler = async () => {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const settingsResult = await client.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: "begins_with(#id, :prefix)",
    ExpressionAttributeNames: { "#id": "id" },
    ExpressionAttributeValues: { ":prefix": settingsPrefix }
  }));
  const subscriptionsResult = await client.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: "begins_with(#id, :prefix)",
    ExpressionAttributeNames: { "#id": "id" },
    ExpressionAttributeValues: { ":prefix": "rotacion-rural-push#" }
  }));

  const now = new Date();
  let sent = 0;
  let processed = 0;

  for (const settings of settingsResult.Items || []) {
    const local = localDateTime(now, settings.timezone || "America/Argentina/Buenos_Aires");
    if (settings.enabled === false || !settings.message || settings.time !== local.time || settings.lastSentDate === local.date) {
      continue;
    }

    const payload = JSON.stringify({
      title: "Rotacion Rural",
      body: settings.message,
      url: "/",
      sentAt: now.toISOString()
    });

    const recipientEmails = [...new Set(
      (settingsResult.Items || [])
        .map((item) => item.ownerEmail)
        .filter((email) => email && email !== settings.ownerEmail)
    )];
    const recipientSubscriptions = (subscriptionsResult.Items || []).filter((item) => recipientEmails.includes(item.email));

    for (const recipientEmail of recipientEmails) {
      await client.send(new PutCommand({
        TableName: tableName,
        Item: {
          id: notificationInboxId(recipientEmail),
          recipientEmail,
          senderEmail: settings.ownerEmail,
          message: settings.message,
          sentAt: now.toISOString()
        }
      }));
    }

    for (const item of recipientSubscriptions) {
      try {
        await webpush.sendNotification(item.subscription, payload);
        sent += 1;
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          await client.send(new DeleteCommand({ TableName: tableName, Key: { id: item.id } }));
        } else {
          console.error("No se pudo enviar una notificacion", error);
        }
      }
    }

    await client.send(new UpdateCommand({
      TableName: tableName,
      Key: { id: settings.id },
      UpdateExpression: "SET lastSentDate = :date, lastSentAt = :sentAt",
      ExpressionAttributeValues: { ":date": local.date, ":sentAt": now.toISOString() }
    }));
    processed += 1;
  }

  return { ok: true, processed, sent };
};

function notificationInboxId(email) {
  const userId = crypto.createHash("sha256").update(email).digest("hex");
  return `${inboxPrefix}${userId}`;
}

function localDateTime(date, timezone) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`
  };
}
