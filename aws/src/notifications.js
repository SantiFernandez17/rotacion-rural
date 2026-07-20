const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const webpush = require("web-push");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.TABLE_NAME;
const settingsId = process.env.NOTIFICATION_SETTINGS_ID || "rotacion-rural-notification-settings";

exports.handler = async () => {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const settings = await client.send(new GetCommand({ TableName: tableName, Key: { id: settingsId } }));
  if (settings.Item?.enabled === false || !settings.Item?.message) {
    return { ok: true, skipped: true };
  }

  const result = await client.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: "begins_with(#id, :prefix)",
    ExpressionAttributeNames: { "#id": "id" },
    ExpressionAttributeValues: { ":prefix": "rotacion-rural-push#" }
  }));

  const payload = JSON.stringify({
    title: "Rotacion Rural",
    body: settings.Item.message,
    url: "/"
  });
  let sent = 0;

  for (const item of result.Items || []) {
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

  return { ok: true, sent };
};
