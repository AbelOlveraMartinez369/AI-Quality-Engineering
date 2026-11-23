// Importa el agente con tracing y evaluación
import { askQAWithTracing } from './qaAgentWithTracing';
// Importa el cliente de Opik para enviar los datos pendientes al final
import { opikClient } from '../utils/opikConfig';

// Preguntas que simulan el uso real del agente
const QUESTIONS: string[] = [
  // Pregunta técnica básica
  '¿Qué es un test de regresión?',
  // Pregunta técnica con comparación
  '¿Cuál es la diferencia entre un test unitario y un test de integración?',
  // Pregunta trampa: el modelo NO debe inventar un nombre
  '¿Cuál es el nombre del CEO de PetClinic?',
  // Pregunta de metodología
  '¿Para qué sirve el patrón Page Object en automatización?',
];

// Puntaje promedio mínimo aceptable (se puede cambiar con la variable MIN_AVG_SCORE)
const MIN_AVG_SCORE = Number(process.env.MIN_AVG_SCORE ?? '0.7');

// Función principal del monitor
async function main(): Promise<void> {
  // Aquí se guardan los puntajes de cada pregunta
  const scores: number[] = [];

  // Recorre las preguntas una por una
  for (const question of QUESTIONS) {
    // Ejecuta el agente: responde, califica y registra el trace
    const result = await askQAWithTracing(question);
    // Guarda el puntaje
    scores.push(result.score);
    // Muestra el resultado en consola
    console.log(`📊 ${result.score.toFixed(2)} | ${question}`);
  }

  // Calcula el promedio
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;

  // Envía todos los datos pendientes a Opik
  await opikClient.flush();

  // Muestra el promedio contra el umbral
  console.log(`\n📈 Puntaje promedio: ${average.toFixed(2)} (mínimo aceptable: ${MIN_AVG_SCORE})`);

  // Si el promedio no llega al mínimo, termina con código de error
  if (average < MIN_AVG_SCORE) {
    console.error('❌ La calidad promedio está por debajo del umbral.');
    process.exitCode = 1;
  } else {
    console.log('✅ La calidad promedio cumple el umbral.');
  }
}

// Ejecuta el monitor y maneja errores inesperados
main().catch((error) => {
  // Muestra el error en consola
  console.error(error);
  // Termina con código de error
  process.exitCode = 1;
});
