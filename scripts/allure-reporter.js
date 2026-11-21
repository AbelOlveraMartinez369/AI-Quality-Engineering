// Importa el módulo fs para escribir archivos
const fs = require('fs');
// Importa path para construir rutas
const path = require('path');
// Importa crypto para generar UUIDs únicos
const crypto = require('crypto');

// Exporta el hook afterAll que Promptfoo ejecutará al terminar
module.exports = {
  // Función que recibe el contexto de la evaluación
  afterAll: async (context) => {
    // Define el directorio de salida de Allure
    const allureDir = path.resolve('allure-results');
    // Crea el directorio si no existe
    if (!fs.existsSync(allureDir)) fs.mkdirSync(allureDir, { recursive: true });

    // Itera sobre cada resultado de la evaluación
    for (const result of context.results) {
      // Genera un UUID único para este resultado
      const uuid = crypto.randomUUID();
      // Extrae el nombre del test (la pregunta)
      const testName = result.testCase?.vars?.question || 'Prompt evaluation';
      // Determina el estado: passed si el test pasó, failed si no
      const status = result.success ? 'passed' : 'failed';
      // Extrae la razón del fallo si existe
      const statusMessage = result.gradingResult?.reason || '';

      // Construye el objeto con el formato que Allure espera
      const allureResult = {
        // UUID único del resultado
        uuid: uuid,
        // Nombre del test que se mostrará en el reporte
        name: testName,
        // Nombre completo (usado para historial)
        fullName: `Promptfoo.${testName}`,
        // Estado del test (passed/failed)
        status: status,
        // Detalles del estado (mensaje de error o razón)
        statusDetails: {
          // Mensaje que explica por qué pasó o falló
          message: statusMessage,
        },
        // Etapa en la que terminó el test
        stage: 'finished',
        // Timestamp de inicio (ahora menos la latencia)
        start: Date.now() - (result.latencyMs || 0),
        // Timestamp de fin (ahora)
        stop: Date.now(),
        // Etiquetas para organizar en el reporte
        labels: [
          // Etiqueta de suite
          { name: 'suite', value: 'Quality Gate de IA' },
          // Etiqueta de capa
          { name: 'layer', value: 'ai-evals' },
          // Etiqueta del proveedor evaluado
          { name: 'provider', value: result.provider?.id || 'unknown' },
        ],
        // Pasos del test (la pregunta y la respuesta)
        steps: [
          {
            // Nombre del paso: la pregunta
            name: 'Pregunta',
            // Estado del paso
            status: 'passed',
            // Etapa del paso
            stage: 'finished',
            // Timestamp de inicio
            start: Date.now() - (result.latencyMs || 0),
            // Timestamp de fin
            stop: Date.now(),
            // Adjunto con la pregunta
            attachments: [
              {
                // Nombre del adjunto
                name: 'Input',
                // Tipo de contenido
                type: 'text/plain',
                // Contenido de la pregunta
                source: '',
              },
            ],
          },
          {
            // Nombre del paso: la respuesta
            name: 'Respuesta',
            // Estado del paso (passed/failed según el resultado)
            status: result.success ? 'passed' : 'failed',
            // Etapa del paso
            stage: 'finished',
            // Timestamp de inicio
            start: Date.now() - (result.latencyMs || 0),
            // Timestamp de fin
            stop: Date.now(),
          },
        ],
      };

      // Escribe el archivo con el nombre que Allure espera: {uuid}-result.json
      fs.writeFileSync(
        path.join(allureDir, `${uuid}-result.json`),
        JSON.stringify(allureResult, null, 2)
      );
    }

    // Imprime en consola cuántos resultados se generaron
    console.log(`✅ Generados ${context.results.length} resultados para Allure en ${allureDir}`);
  },
};