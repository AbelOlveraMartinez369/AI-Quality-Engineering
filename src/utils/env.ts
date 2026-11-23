// Importa el módulo fs para leer archivos del sistema
import fs from 'fs';
// Importa dotenv para cargar las variables del archivo .env
import dotenv from 'dotenv';

// Carga las variables del archivo .env (si no existe, como en CI, no pasa nada)
dotenv.config();

// Solo busca el archivo secreto si la API key NO está ya en el entorno
if (!process.env.DEEPSEEK_API_KEY) {
  // Lee la ruta del archivo que contiene la API key
  const apiKeyFile = process.env.DEEPSEEK_API_KEY_FILE;

  // Si tampoco hay ruta, falla con un mensaje claro
  if (!apiKeyFile) {
    throw new Error('Falta DEEPSEEK_API_KEY o DEEPSEEK_API_KEY_FILE (revisa tu .env)');
  }

  // Reemplaza el ~ inicial por la carpeta home del usuario
  const resolvedPath = apiKeyFile.replace(/^~/, process.env.HOME || '');

  // Lee el archivo, quita espacios o saltos de línea y lo guarda en el entorno
  process.env.DEEPSEEK_API_KEY = fs.readFileSync(resolvedPath, 'utf-8').trim();
}