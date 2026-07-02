const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.TABLE_NAME;
const stateId = process.env.STATE_ID || "rotacion-rural-main";
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

  if (event.requestContext.http.method === "GET") {
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

  if (event.requestContext.http.method === "PUT") {
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
