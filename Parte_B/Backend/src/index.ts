import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import centerRoutes from './routes/centerRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json());

// Soportar rutas con y sin prefijo /api
app.use('/api', centerRoutes);
app.use('/', centerRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BACKEND] Servidor Contact Center corriendo en puerto ${PORT}`);
  console.log(`[BACKEND] Stream SSE disponible en http://localhost:${PORT}/stream`);
  console.log(`[BACKEND] Receptor de eventos en http://localhost:${PORT}/events`);
});

export default app;
