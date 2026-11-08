const http = require("http");

const events = [
  {
    eventId: "e-001",
    ts: "2026-11-10T14:00:00Z",
    type: "call.incoming",
    callId: "c-001",
    queue: "soporte",
    callerId: "+573001112233",
  },
  {
    eventId: "e-002",
    ts: "2026-11-10T14:00:06Z",
    type: "call.answered",
    callId: "c-001",
    agentId: "a-1001",
  },
  {
    eventId: "e-002-dup",
    ts: "2026-11-10T14:00:06Z",
    type: "call.answered",
    callId: "c-001",
    agentId: "a-1001",
  }, // Duplicado a propósito
  {
    eventId: "e-003",
    ts: "2026-11-10T14:04:31Z",
    type: "call.hangup",
    callId: "c-001",
  },
];

async function sendEvent(event) {
  return new Promise((resolve) => {
    const data = JSON.stringify(event);
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path: "/api/events",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          console.log(`Evento ${event.eventId} enviado. Respuesta:`, body);
          resolve();
        });
      },
    );
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("Iniciando simulación de eventos...");
  for (const ev of events) {
    await sendEvent(ev);
    await new Promise((r) => setTimeout(r, 2000)); // Espera 2s entre eventos
  }
  console.log("Simulación finalizada.");
}

run();
