# Prueba-Tecnica-Semi-Senior
Este repositorio sera creado de manera publica para la realizacion y respuesta de la prueba tecnica para el puesto de trabajo Desarrollador Semi-Senior Contact Center.

Prueba_tecnica_Contact_Center_SemiSenior.pdf
Este PDF contiene la informacion necesaria para la realizacion de las pruebas

Parte_A.md
En este archivo se encuentra la primera parte de la prueba, donde se realizaron preguntas y respuestas sobre SIP, RTP, Websocket y manejo de insidentes.

Parte_B:
En esta segunda parte de las pruebas estara el desarrollo de una interface web que permitira recibir, gestionar y finalizar llamadas.

Stack Tecnológico
Lenguaje: TypeScript / JavaScript (Node.js)
Framework: Express.js
Comunicación en Tiempo Real: Server-Sent Events (SSE) / WebSockets
Configuración: dotenv, cors, ts-node

Estructura:
Parte_B/
├── src/
│   ├── models/           # Interfaces y tipos (Agente, Cola, Llamada, Estados)
│   ├── services/         # Lógica de negocio (Máquina de estados, Motor de asignación)
│   ├── controllers/      # Controladores de las peticiones REST
│   ├── routes/           # Rutas de la API (events, agents, queues)
│   └── index.ts          # Servidor principal (Express + SSE/WebSockets)
├── package-lock.json
├── package.json
└── tsconfig.json

