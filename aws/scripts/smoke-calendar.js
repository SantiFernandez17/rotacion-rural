const path = require("node:path");

const modulePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../src/state.js");
const { handler } = require(modulePath);

const planId = `codex-calendar-smoke-${Date.now()}`;

function event(method, requestPath, body) {
  return {
    requestContext: {
      http: { method, path: requestPath },
      authorizer: {
        jwt: {
          claims: {
            email: "codex-smoke@santuli.org",
            sub: "codex-smoke"
          }
        }
      }
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}

async function invoke(method, requestPath, body) {
  const response = await handler(event(method, requestPath, body));
  if (response.statusCode !== 200) {
    throw new Error(`${method} ${requestPath}: ${response.body}`);
  }
  return JSON.parse(response.body);
}

async function run() {
  let created = false;
  try {
    await invoke("POST", "/plans", {
      plan: {
        id: planId,
        title: "Prueba temporal calendario",
        category: "Prueba",
        date: "",
        timeSlot: ""
      }
    });
    created = true;

    const result = await invoke("PUT", `/plans/${planId}`, {
      date: "2026-08-06",
      timeSlot: "morning"
    });
    if (result.plan.date !== "2026-08-06" || result.plan.timeSlot !== "morning") {
      throw new Error("La fecha o la franja no se guardaron correctamente.");
    }

    console.log(`SMOKE_OK id=${planId} date=${result.plan.date} timeSlot=${result.plan.timeSlot}`);
  } finally {
    if (created) {
      await invoke("DELETE", `/plans/${planId}`);
      console.log("SMOKE_DELETE_OK");
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
