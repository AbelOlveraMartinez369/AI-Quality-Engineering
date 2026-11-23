// Carga las variables del .env antes de crear el cliente (OPIK_URL_OVERRIDE, etc.)
import 'dotenv/config';
// Importa el cliente de Opik desde el SDK
import { Opik } from 'opik';

// Exporta una única instancia del cliente para reutilizarla en todo el proyecto
export const opikClient = new Opik({
  // URL de la API de Opik: el frontend (puerto 5173) reenvía /api al backend
  apiUrl: process.env.OPIK_URL_OVERRIDE ?? 'http://localhost:5173/api',
  // Nombre del proyecto donde aparecerán los traces en el dashboard
  projectName: process.env.OPIK_PROJECT_NAME ?? 'ai-quality-engineering',
  // API key: solo se usa en Opik Cloud; en local queda sin definir
  apiKey: process.env.OPIK_API_KEY,
  // Workspace: solo se usa en Opik Cloud; en local queda sin definir
  workspaceName: process.env.OPIK_WORKSPACE,
});