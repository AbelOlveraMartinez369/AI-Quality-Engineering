// Importa el módulo fs para leer archivos del sistema
import fs from 'fs';
// Importa path para construir rutas de archivos de forma segura
import path from 'path';
// Importa dotenv para cargar las variables del archivo .env
import dotenv from 'dotenv';

// Carga las variables de entorno desde el archivo .env
dotenv.config();

// Lee la ruta del archivo que contiene la API Key desde el .env
const apiKeyFile = process.env.DEEPSEEK_API_KEY_FILE;

// Verifica que la variable exista
if (!apiKeyFile) {
  // Si no existe, lanza un error claro
  throw new Error('Falta DEEPSEEK_API_KEY_FILE en el archivo .env');
}

// Resuelve la ruta absoluta del archivo (reemplaza ~ por el home del usuario)
const resolvedPath = apiKeyFile.replace('~', process.env.HOME || '');

// Lee el contenido del archivo y lo pone en process.env.DEEPSEEK_API_KEY
process.env.DEEPSEEK_API_KEY = fs.readFileSync(resolvedPath, 'utf-8').trim();
