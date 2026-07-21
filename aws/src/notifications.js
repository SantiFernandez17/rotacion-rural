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
    const scheduledMinute = timeToMinutes(settings.time);
    const currentMinute = timeToMinutes(local.time);
    const crossedMidnight = currentMinute < scheduledMinute;
    const minutesLate = crossedMidnight
      ? currentMinute + 24 * 60 - scheduledMinute
      : currentMinute - scheduledMinute;
    const dueDate = crossedMidnight ? previousDate(local.date) : local.date;
    if (
      settings.enabled === false ||
      !settings.message ||
      scheduledMinute < 0 ||
      minutesLate > 360 ||
      settings.lastSentDate === dueDate
    ) {
      continue;
    }

    const payload = JSON.stringify({
      title: "Rotacion Rural",
      body: settings.message,
      url: "/",
      sentAt: now.toISOString()
    });

    const recipientEmails = [...new Set([
      ...(settingsResult.Items || []).map((item) => item.ownerEmail),
      ...(subscriptionsResult.Items || []).map((item) => item.email)
    ].filter((email) => email && email !== settings.ownerEmail))];
    const recipientSubscriptions = (subscriptionsResult.Items || []).filter((item) => recipientEmails.includes(item.email));

    let inboxDelivered = false;
    if (settings.lastInboxDate !== dueDate) {
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
        inboxDelivered = true;
      }
    }

    let sentForSetting = 0;
    for (const item of recipientSubscriptions) {
      try {
        await webpush.sendNotification(item.subscription, payload);
        sent += 1;
        sentForSetting += 1;
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          await client.send(new DeleteCommand({ TableName: tableName, Key: { id: item.id } }));
        } else {
          console.error("No se pudo enviar una notificacion", error);
        }
      }
    }

    const updates = [];
    const values = {};
    if (inboxDelivered) {
      updates.push("lastInboxDate = :inboxDate");
      values[":inboxDate"] = dueDate;
    }
    if (sentForSetting > 0) {
      updates.push("lastSentDate = :sentDate", "lastSentAt = :sentAt");
      values[":sentDate"] = dueDate;
      values[":sentAt"] = now.toISOString();
      processed += 1;
    }
    if (updates.length) {
      await client.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: settings.id },
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeValues: values
      }));
    }
  }

  console.log(JSON.stringify({ processed, sent }));
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

function timeToMinutes(value = "") {
  if (!/^\d{2}:\d{2}$/.test(value)) return -1;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function previousDate(value) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
