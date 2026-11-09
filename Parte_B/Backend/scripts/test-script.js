/**
 * Script de prueba oficial para la simulación de eventos en tiempo real.
 * Ejecuta la secuencia exacta descrita en el documento de la prueba técnica:
 * 1. call.incoming
 * 2. call.answered
 * 3. call.answered (duplicado con el mismo eventId)
 * 4. call.hangup
 *
 * Muestra el comportamiento del backend y la actualización en vivo del tablero.
 */

const http = require('http');

const BASE_URL = process.env.API_URL || 'http://127.0.0.1:3000';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = body ? JSON.stringify(body) : null;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => (responseBody += chunk));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              data: responseBody ? JSON.parse(responseBody) : null,
            });
          } catch (e) {
            resolve({ status: res.statusCode, data: responseBody });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (data) req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {

  try {
    // 0. Verificar y loguear al agente Carlos Pérez (a-1001) para que esté DISPONIBLE
    console.log('[PASO 0] Asegurando que el agente a-1001 (Carlos Pérez) esté en DISPONIBLE...');
    const loginRes = await makeRequest('POST', '/api/agents/a-1001/login');
    console.log('Respuesta Login:', loginRes.data);
    await sleep(2000);

    // Secuencia oficial requerida en el documento:
    const sequence = [
      {
        description: '1. Entrada de llamada entrante c-001 a la cola "soporte"',
        event: {
          eventId: 'e-001',
          ts: '2026-11-10T14:00:00Z',
          type: 'call.incoming',
          callId: 'c-001',
          queue: 'soporte',
          callerId: '+573001112233',
        },
        waitAfter: 4000, // 4 segundos para observar al agente en estado TIMBRANDO
      },
      {
        description: '2. Agente a-1001 contesta la llamada c-001 (call.answered)',
        event: {
          eventId: 'e-002',
          ts: '2026-11-10T14:00:06Z',
          type: 'call.answered',
          callId: 'c-001',
          agentId: 'a-1001',
        },
        waitAfter: 4000, // 4 segundos para observar al agente EN_LLAMADA
      },
      {
        description: '3. Envío de evento duplicado a propósito (mismo eventId e-002)',
        event: {
          eventId: 'e-002',
          ts: '2026-11-10T14:00:06Z',
          type: 'call.answered',
          callId: 'c-001',
          agentId: 'a-1001',
        },
        waitAfter: 3000,
      },
      {
        description: '4. Fin de la llamada (call.hangup) -> pasa a WRAP_UP por 15s',
        event: {
          eventId: 'e-003',
          ts: '2026-11-10T14:04:31Z',
          type: 'call.hangup',
          callId: 'c-001',
        },
        waitAfter: 16000, // 16s para ver el conteo de WRAP_UP y el retorno automático a DISPONIBLE
      },
    ];

    for (const step of sequence) {
      console.log(`\n----------------------------------------------------`);
      console.log(`> ${step.description}`);
      console.log('Enviando payload:', JSON.stringify(step.event));

      const res = await makeRequest('POST', '/api/events', step.event);
      console.log(`Respuesta [HTTP ${res.status}]:`, res.data);

      console.log(`Pausando ${step.waitAfter / 1000}s para apreciar el estado en el tablero...`);
      await sleep(step.waitAfter);
    }

    console.log('\n====================================================');
    console.log('   SIMULACIÓN COMPLETADA CON ÉXITO                  ');
    console.log('====================================================');
  } catch (err) {
    console.error('\n[ERROR] No se pudo conectar con el backend. ¿Está corriendo en el puerto 3000?', err.message);
  }
}

run();
