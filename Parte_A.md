Parte A — Cuestionario de telefonía y Contact Center
1.Flujo SIP.
Describe los mensajes principales de una llamada básica entre dos teléfonos, desde quese marca hasta que se cuelga.
R//En un flujo SIP tenemos: 
INVITE - Cuando el telefono origen solicita la llamda al destinado.
RING 108 - Conecto la llamda y empezo a sonar.
200 OK - Nos Indica que la llamda fue aceptada por el destinatario
ACK - Confirma el 200 OK e incia el flujo de audio.
BYE - Indica que uno de los dos colgo la llamada.

2.SIP y RTP.
¿Qué transporta cada uno? Si un agente oye al cliente pero el cliente no lo oye a él, ¿quérevisarías primero?
R//El SIP permite el control de la llamda como: marcar,contestar,sonar,colgar.
El RTP permite el flujo de audio en la llamda.

Validar que los perifericos esten bien conectados y los permisos de los dispositivos aceptados en el navegador. Si esto se encuentra bien debemos revisar si el flujo RTP bloqueo la IP o el puerto publico de retorno esta mal traducido en la cabecera.


3.WebRTC.
¿Qué necesita un webphone en el navegador para hacer llamadas? ¿Por qué suele fallarsi la página no está en HTTPS?
R//Necesita conexion a un servidor de señalizacion como Asterisk con websockets seguros.

Falla por protocolo de privacidad y seguridad, los navegadores modernos rechazan las APIs de captura de medios si esta no es segura.


4.Métricas.
Explica con tus palabras qué son ASA, AHT y tasa de abandono.
R//ASA- Es el tiempo promedio que espera un cliente en la cola antes de llegar un agente.
AHT - Es el tiempo total que gasta un agente atendiendo una llamada.
tasa de abandono - Es el porcentaje de llamadas que entrar a la cola y cuelgan antes de ser atendidos por un agente.


5.Diagnóstico.
Un agente aparece como Disponible en el tablero, pero no le entran llamadas mientras la cola tiene clientes esperando. Lista tres hipótesis y cómo verificarías cada una.
R//Hipotesis:
1 - Algo muy comun en procesos es cuando un agente cierra una sesion pero el sistema lo sigue reconociendo como en una sesion activa, por ende no le asigna una nueva.
Verificacion: Revisaria los logs en el backend buscando su ultimo cierre y el proceso que lo llevo al cambio de estado o si se quedo atrapado.

2 - Otro error puede ser del backend, el agente realizo una llamada pero quedo atrapado por el websocket en estado timbrando pero este evento no se envio y siguio en estado Disponible.
verificacion: Observar la consola del navegador en el network y el estado real del agente en el JSON devuelto por la API Rest, este debe coincidir con la UI.

3 - El agente esta marcado como Disponible de forma global pero su perfil no esta en la cola especifica donde estan esperando los cliente, por ejemplo el pertenece a ventas pero la cola esta en soporte.
verificacion: Validaria su area en la DB o en el backend que si coincida a la cola asignada para su ID.