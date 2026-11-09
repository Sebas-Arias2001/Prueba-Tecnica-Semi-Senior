# WeKall — Prueba Técnica Desarrollador Semi Senior, Contact Center

Solución completa a la prueba técnica para el rol de Desarrollador Semi Senior de Contact Center en WeKall (Squad Poseidón).

---

## Estructura del repositorio

```
Prueba-Tecnica-Semi-Senior/
├── Parte_A.md              # Cuestionario teórico (SIP, RTP, WebRTC, Contact Center)
├── Parte_B/
│   ├── Backend/            # API REST + motor de eventos (Node.js, Express, TypeScript)
│   └── Frontend/           # Panel de supervisión en tiempo real (React, TypeScript, Vite)
└── README.md
```

- **Parte A:** Respuestas al cuestionario teórico sobre protocolos SIP, RTP, WebRTC y operación de Contact Center. Ver [`PARTE_A.md`](./PARTE_A.md).

- **Parte B:** Sistema de asignación de llamadas con máquina de estados de agentes, criterio FIFO de cola, panel de supervisión en tiempo real vía SSE y suite de pruebas unitarias automatizadas.

---

## Stack tecnológico

| Capa | Tecnologías |
|---|---|
| Backend | Node.js v20+, Express, TypeScript, Server-Sent Events (SSE) |
| Frontend | React 19, TypeScript, Vite |
| Testing | Node.js Native Test Runner, TSX |

---

## Requisitos previos

- Node.js v20 o superior
- npm

Verificar instalación:
```bash
node -v
npm -v
```

---

## Instrucciones de ejecución

### 1. Backend

```bash
cd Parte_B/Backend
npm install
npm run dev
```

El servidor queda disponible en `http://localhost:3000`.  
El stream de eventos en tiempo real (SSE) está en `http://localhost:3000/api/stream`.

### 2. Frontend

Abrir una segunda terminal:

```bash
cd Parte_B/Frontend
npm install
npm run dev
```

Abrir el navegador en la URL indicada por Vite (habitualmente `http://localhost:5173`).

### 3. Pruebas unitarias

```bash
cd Parte_B/Backend
npm test
```

Se ejecutan 20 pruebas unitarias distribuidas en tres archivos:

| Archivo de prueba | Cobertura |
|---|---|
| `agentStateMachine.test.ts` | 10 transiciones estrictas de la máquina de estados |
| `assignmentEngine.test.ts` | Criterio FIFO de asignación de llamadas |
| `eventsIdempotency.test.ts` | Rechazo de eventos duplicados por `eventId` |

### 4. Simulación de la secuencia oficial

Con el backend ya corriendo, ejecutar:

```bash
cd Parte_B/Backend
npm run simulate
```

El script envía la secuencia de eventos definida en el documento de la prueba:

1. `call.incoming` — llamada `c-001` ingresa a la cola `soporte`.
2. `call.answered` — agente `a-1001` contesta la llamada.
3. `call.answered` duplicado — mismo `eventId`, descartado por idempotencia.
4. `call.hangup` — llamada finaliza; el agente pasa a `WRAP_UP` durante 15 segundos y luego regresa automáticamente a `DISPONIBLE`.

---

## Decisiones de diseño

### Máquina de estados del agente

Los agentes transitan por los siguientes estados. Cualquier transición no listada aquí es rechazada explícitamente:

```
OFFLINE -> DISPONIBLE  (login)
DISPONIBLE -> TIMBRANDO  (asignación de llamada)
DISPONIBLE -> PAUSA  (pausa voluntaria)
TIMBRANDO -> EN_LLAMADA  (call.answered)
TIMBRANDO -> DISPONIBLE  (call.hangup sin contestar)
EN_LLAMADA -> WRAP_UP  (call.hangup)
WRAP_UP -> DISPONIBLE  (fin del tiempo de post-llamada)
PAUSA -> DISPONIBLE  (unpause)
DISPONIBLE -> OFFLINE  (logout)
WRAP_UP -> OFFLINE  (logout durante post-llamada)
```

### Criterio FIFO y prevención de asignación doble

- Solo los agentes en estado `DISPONIBLE` son candidatos para recibir una llamada.
- Solo las llamadas en estado `EN_COLA` pueden ser asignadas.
- El motor de asignación (`CallQueueService.tryAssignCall`) opera de forma síncrona dentro del event loop monohilo de Node.js. En cuanto empareja una llamada con un agente, actualiza ambos estados de forma inmediata y consecutiva sin posibilidad de interferencia externa:
  1. La llamada sale de la cola (`queueList.shift()`).
  2. La llamada pasa a `TIMBRANDO` con el `assignedAgentId`.
  3. El agente pasa a `TIMBRANDO`.
- La cola respeta el orden de llegada (FIFO): la primera llamada en espera es siempre la primera en ser asignada.

### Control de idempotencia

Se mantiene un `Set<string>` de `eventId` procesados. Si llega un evento con un identificador ya registrado, se descarta sin modificar ningún estado. Esto previene efectos duplicados ante reenvíos del sistema de telefonía.

---

## Supuestos

1. **Almacenamiento en memoria:** Según el requerimiento del documento, toda la información de agentes, llamadas, colas y eventos procesados se mantiene en estructuras `Map` y `Set` en memoria. No hay base de datos.

2. **Datos iniciales:**
   - Colas preconfiguradas: `soporte` y `ventas` (tiempo máximo de espera: 60 segundos cada una). Si llega un evento con una cola no registrada, se crea automáticamente.
   - Agentes preconfigurados:
     - `a-1001`: Carlos Pérez — extensión 1001 — colas: `soporte`, `ventas`
     - `a-1002`: Ana Gómez — extensión 1002 — colas: `soporte`
     - `a-1003`: Juan Rodríguez — extensión 1003 — colas: `ventas`

3. **Login previo en la simulación:** El script de prueba verifica que el agente `a-1001` esté en `DISPONIBLE` antes de iniciar la secuencia de eventos, realizando el login si es necesario.

4. **Cálculo de espera:** La métrica "espera más larga en este momento" se calcula en tiempo real como la diferencia entre `Date.now()` y el `timestamps.incoming` de cada llamada que sigue en estado `EN_COLA`. Si la cola está vacía, el valor es `0s`.

---

## Qué quedó pendiente

El alcance de la prueba no incluyó los siguientes puntos, que se implementarían con tiempo adicional:

- **Persistencia con base de datos:** Capa relacional con TypeORM o Prisma, historial de transiciones con Event Sourcing y empaquetado en `docker-compose.yml`.
- **Integración con telefonía real:** Conexión a Asterisk vía AMI/ARI para capturar eventos reales (`QueueCallerJoin`, `AgentConnect`, `Hangup`) y webphone WebRTC embebido.
- **Manejo de no contesta:** Temporizador de timbrado configurable; si el agente no contesta, pasa a `PAUSA` y la llamada regresa al inicio de la cola.
- **Métricas avanzadas:** ASA (Average Speed of Answer), AHT (Average Handle Time) y SLA con umbral configurable (ej: 80/20).
- **Autenticación y roles:** Tokens JWT con diferenciación de permisos entre Supervisor y Agente.

---

## Uso de inteligencia artificial

Se utilizaron herramientas de IA (Gemini y Claude) como apoyo en las siguientes tareas:

- Creación de la estructura de carpetas del proyecto.
- Generación de las pruebas unitarias y verificación de la cobertura de las 10 transiciones estrictas de la máquina de estados, el criterio FIFO de asignación y el manejo de eventos duplicados, usando el runner nativo de Node.js.
- Validación del funcionamiento del código y resolución de errores durante el desarrollo.

En ningún caso se delegó la lógica de negocio central ni las decisiones de arquitectura a la IA; su rol fue de asistencia y verificación.

---

## API REST

El backend expone las siguientes rutas bajo el prefijo `/api/`.

### Recibir evento de telefonía

```bash
# Llamada entrante
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"e-100","ts":"2026-11-10T14:00:00Z","type":"call.incoming","callId":"c-100","queue":"soporte","callerId":"+573001234567"}'

# Llamada contestada
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"e-101","ts":"2026-11-10T14:00:05Z","type":"call.answered","callId":"c-100","agentId":"a-1001"}'

# Llamada colgada
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"e-102","ts":"2026-11-10T14:03:00Z","type":"call.hangup","callId":"c-100"}'
```

### Gestión de agentes

```bash
curl -X GET  http://localhost:3000/api/agents                          # Listar agentes
curl -X POST http://localhost:3000/api/agents/a-1001/login             # Login
curl -X POST http://localhost:3000/api/agents/a-1001/logout            # Logout
curl -X POST http://localhost:3000/api/agents/a-1001/pause  \
  -H "Content-Type: application/json" -d '{"reason":"Almuerzo"}'       # Pausar
curl -X POST http://localhost:3000/api/agents/a-1001/unpause           # Despausar
```

### Colas y stream

```bash
curl -X GET http://localhost:3000/api/queues   # Listar colas y métricas
curl -N    http://localhost:3000/api/stream    # Stream SSE en tiempo real
```
