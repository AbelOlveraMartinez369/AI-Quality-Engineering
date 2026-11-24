// Importa el prompt del juez, el modelo y el cliente de DeepSeek del agente de producción.
// Así calibramos EXACTAMENTE el mismo juez que usa el agente (no una copia que pueda cambiar).
import { JUDGE_PROMPT, MODEL, deepseek } from '../agents/qaAgentWithTracing';
// Importa fs para leer el dataset desde el disco
import fs from 'fs';
// Importa path para construir la ruta al dataset
import path from 'path';

// Forma de cada caso del dataset dorado
interface GoldenCase {
  // Identificador del caso (G = respuesta buena, B = respuesta mala)
  id: string;
  // Pregunta original
  question: string;
  // Respuesta que el juez va a calificar
  answer: string;
  // Etiqueta correcta que conocemos de antemano
  expected: 'good' | 'bad';
  // Dificultad del caso
  difficulty: 'claro' | 'sutil';
}

// Veredicto que devuelve el juez
interface Verdict {
  // Puntaje entre 0 y 1
  score: number;
  // Razón que dio el juez
  reason: string;
}

// Puntaje mínimo para considerar que el juez "aprobó" una respuesta (se puede cambiar con JUDGE_PASS_SCORE)
const PASS_SCORE = Number(process.env.JUDGE_PASS_SCORE ?? '0.7');
// Exactitud mínima aceptable del juez (se puede cambiar con MIN_JUDGE_ACCURACY)
const MIN_ACCURACY = Number(process.env.MIN_JUDGE_ACCURACY ?? '0.85');

// Le pide al juez que califique una respuesta (misma lógica que el agente de producción)
async function askJudge(question: string, answer: string): Promise<Verdict> {
  // Llama al modelo con el MISMO prompt, modelo y temperatura que usa el agente
  const completion = await deepseek.chat.completions.create({
    // Modelo del juez
    model: MODEL,
    // Mensajes: criterios del juez + pregunta y respuesta a evaluar
    messages: [
      { role: 'system', content: JUDGE_PROMPT },
      { role: 'user', content: `Pregunta: ${question}\n\nRespuesta a evaluar: ${answer}` },
    ],
    // Temperatura mínima para que el juez sea lo más estable posible
    temperature: 0,
  });

  // Texto crudo que devolvió el juez
  const raw = completion.choices[0]?.message?.content ?? '';

  // Valores por defecto si no se puede interpretar la respuesta del juez
  let score = 0;
  let reason = 'No se pudo interpretar la respuesta del juez';

  // Busca el primer bloque { ... } dentro del texto
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      // Convierte el JSON del juez en objeto
      const parsed = JSON.parse(match[0]) as { score?: unknown; reason?: unknown };
      // Convierte el puntaje a número
      const value = Number(parsed.score);
      // Si es un número válido, lo limita al rango 0 a 1
      if (Number.isFinite(value)) score = Math.min(1, Math.max(0, value));
      // Si hay razón en texto, la usa
      if (typeof parsed.reason === 'string') reason = parsed.reason;
    } catch {
      // Si el JSON viene mal formado se conservan los valores por defecto
    }
  }

  // Devuelve el veredicto
  return { score, reason };
}

// Función principal de la calibración
async function main(): Promise<void> {
  // Ruta al dataset dorado (se ejecuta desde la raíz del proyecto)
  const file = path.resolve('datasets/judge-golden.json');
  // Lee y convierte el dataset
  const cases = JSON.parse(fs.readFileSync(file, 'utf-8')) as GoldenCase[];

  // Filas para la tabla de resultados
  const rows: Array<Record<string, string>> = [];
  // Motivos de los errores del juez, para mostrarlos al final
  const mistakes: string[] = [];
  // Contadores globales
  let correct = 0;
  let falsePass = 0;
  let falseFail = 0;
  // Contadores por dificultad
  const byDifficulty: Record<string, { total: number; correct: number }> = {};

  // Recorre los casos uno por uno
  for (const c of cases) {
    // El juez califica la respuesta
    const verdict = await askJudge(c.question, c.answer);
    // ¿El juez la consideró buena?
    const judgedGood = verdict.score >= PASS_SCORE;
    // ¿Realmente era buena?
    const expectedGood = c.expected === 'good';
    // ¿El juez acertó?
    const ok = judgedGood === expectedGood;

    // Actualiza los contadores
    if (ok) correct += 1;
    else if (judgedGood && !expectedGood) falsePass += 1;
    else falseFail += 1;

    // Actualiza el conteo por dificultad
    byDifficulty[c.difficulty] ??= { total: 0, correct: 0 };
    byDifficulty[c.difficulty].total += 1;
    if (ok) byDifficulty[c.difficulty].correct += 1;

    // Texto del resultado para la tabla
    const resultado = ok ? '✅ acierto' : judgedGood ? '❌ FALSO APROBADO' : '❌ FALSO RECHAZO';
    // Agrega la fila a la tabla
    rows.push({
      id: c.id,
      dificultad: c.difficulty,
      esperado: c.expected,
      puntaje: verdict.score.toFixed(2),
      resultado,
    });
    // Si el juez se equivocó, guarda el motivo
    if (!ok) mistakes.push(`${c.id} (${resultado}): ${verdict.reason}`);
  }

  // Muestra la tabla completa
  console.table(rows);

  // Calcula la exactitud global
  const accuracy = correct / cases.length;
  // Muestra el resumen global
  console.log(`\n🎯 Exactitud del juez: ${(accuracy * 100).toFixed(1)}% (${correct}/${cases.length})`);
  console.log(`   Umbral para considerar "buena" una respuesta: ${PASS_SCORE}`);
  console.log(`   Falsos aprobados (respuesta mala que pasó): ${falsePass}`);
  console.log(`   Falsos rechazos (respuesta buena castigada): ${falseFail}`);

  // Muestra la exactitud por dificultad
  for (const [difficulty, stats] of Object.entries(byDifficulty)) {
    console.log(`   Casos ${difficulty}s: ${stats.correct}/${stats.total}`);
  }

  // Si hubo errores, muestra por qué el juez se equivocó
  if (mistakes.length > 0) {
    console.log('\n🔎 Dónde se equivocó el juez:');
    for (const mistake of mistakes) console.log(`   - ${mistake}`);
  }

  // Decide el código de salida según la exactitud mínima
  if (accuracy < MIN_ACCURACY) {
    console.error(`\n❌ El juez NO está calibrado: exactitud por debajo de ${(MIN_ACCURACY * 100).toFixed(0)}%.`);
    process.exit(1);
  }
  console.log(`\n✅ El juez está calibrado: exactitud igual o mayor a ${(MIN_ACCURACY * 100).toFixed(0)}%.`);
  // Termina explícitamente con éxito
  process.exit(0);
}

// Ejecuta la calibración y maneja errores inesperados
main().catch((error) => {
  // Muestra el error en consola
  console.error(error);
  // Termina con código de error
  process.exit(1);
});
