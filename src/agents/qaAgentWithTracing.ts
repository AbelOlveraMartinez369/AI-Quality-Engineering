// Carga la API key de DeepSeek (debe ir PRIMERO, antes de crear cualquier cliente)
import '../utils/env';
// Importa el SDK de OpenAI, que es compatible con la API de DeepSeek
import OpenAI from 'openai';
// Importa el cliente de Opik ya configurado
import { opikClient } from '../utils/opikConfig';

// Modelo de DeepSeek que usa el agente y el juez
export const MODEL = 'deepseek-flash';

// Instrucción de sistema del agente de QA
const SYSTEM_PROMPT =
  'Eres un asistente de QA experto. Responde de forma clara, concisa y precisa. ' +
  'Si no sabes la respuesta, di "No tengo suficiente información para responder".';

// Instrucción del juez: criterios de calidad y formato de salida obligatorio
export const JUDGE_PROMPT =
  'Eres un evaluador estricto de respuestas de un asistente de QA. ' +
  'Califica del 0 al 1 considerando: 1) corrección técnica, 2) claridad, ' +
  '3) honestidad (si no sabe algo, debe admitirlo y NO inventar). ' +
  'Responde SOLO con un JSON válido con este formato exacto: ' +
  '{"score": 0.0, "reason": "explicación breve en español"}';

// Cliente de DeepSeek (usa el formato de OpenAI con otra URL base)
export const deepseek = new OpenAI({
  // URL base de la API de DeepSeek
  baseURL: 'https://api.deepseek.com',
  // API key cargada por env.ts
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// Tipo del resultado que devuelve el agente
export interface QAResult {
  // Respuesta del asistente
  answer: string;
  // Puntaje del juez entre 0 y 1
  score: number;
  // Razón que dio el juez
  reason: string;
}

// Tipo del trace de Opik (para pasarlo a la función del juez)
type OpikTrace = ReturnType<typeof opikClient.trace>;

// Función del juez: califica una respuesta y registra su propio span
async function judgeAnswer(
  // Trace al que pertenece este span
  trace: OpikTrace,
  // Pregunta original
  question: string,
  // Respuesta que se va a calificar
  answer: string,
): Promise<{ score: number; reason: string }> {
  // Crea un span para la llamada del juez
  const judgeSpan = trace.span({
    // Nombre del span
    name: 'deepseek-judge',
    // Tipo llm: es una llamada a un modelo
    type: 'llm',
    // Entrada del span: lo que se le muestra al juez
    input: { question, answer },
  });

  try {
    // Pide al juez que califique la respuesta
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

    // Busca el primer bloque { ... } dentro del texto (por si el juez agrega texto extra)
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

    // Guarda en el span lo que respondió el juez
    judgeSpan.update({ output: { score, reason } });
    // Cierra el span
    judgeSpan.end();

    // Devuelve puntaje y razón
    return { score, reason };
  } catch (error) {
    // Registra el error en el span del juez
    judgeSpan.update({ output: { error: error instanceof Error ? error.message : 'Error desconocido' } });
    // Cierra el span
    judgeSpan.end();
    // Vuelve a lanzar el error
    throw error;
  }
}

// Función principal: responde, califica y registra todo en Opik
export async function askQAWithTracing(question: string): Promise<QAResult> {
  // Crea el trace: el registro completo de esta operación
  const trace = opikClient.trace({
    // Nombre que verás en el dashboard
    name: 'qa-agent-query',
    // Entrada del trace: la pregunta del usuario
    input: { question },
    // Metadatos para filtrar y analizar después
    metadata: { model: MODEL },
  });

  // Crea un span para la llamada del agente al modelo
  const llmSpan = trace.span({
    // Nombre del span
    name: 'deepseek-answer',
    // Tipo llm: es una llamada a un modelo
    type: 'llm',
    // Entrada del span: lo que se le envía al modelo
    input: { system: SYSTEM_PROMPT, question },
  });

  // Marca el momento de inicio para medir la latencia
  const startedAt = Date.now();

  try {
    // Llama al modelo de DeepSeek
    const completion = await deepseek.chat.completions.create({
      // Modelo a usar
      model: MODEL,
      // Mensajes: instrucción de sistema + pregunta del usuario
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
      // Temperatura baja para respuestas más estables
      temperature: 0.2,
    });

    // Extrae el texto de la respuesta (si viene vacío, usa un texto por defecto)
    const answer = completion.choices[0]?.message?.content?.trim() || 'Sin respuesta';

    // Guarda la salida y las métricas en el span
    llmSpan.update({
      // Salida del span: la respuesta del modelo
      output: { answer },
      // Métricas: modelo, latencia y tokens consumidos
      metadata: {
        model: MODEL,
        latencyMs: Date.now() - startedAt,
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      },
    });
    // Cierra el span del agente
    llmSpan.end();

    // El juez califica la respuesta (crea su propio span dentro del trace)
    const { score, reason } = await judgeAnswer(trace, question, answer);

    // Guarda la salida final del trace, incluyendo el puntaje
    trace.update({ output: { answer, qualityScore: score } });
    // Cierra el trace
    trace.end();

    // Registra el puntaje como feedback score del trace: es lo que Opik grafica
    await opikClient.logTracesFeedbackScores([
      // Id del trace + nombre de la métrica + valor + razón
      { id: trace.data.id, name: 'answer_quality', value: score, reason },
    ]);

    // Devuelve el resultado completo
    return { answer, score, reason };
  } catch (error) {
    // Convierte el error en texto
    const message = error instanceof Error ? error.message : 'Error desconocido';
    // Registra el error en el trace
    trace.update({ output: { error: message } });
    // Cierra el trace
    trace.end();
    // Vuelve a lanzar el error para que no se oculte
    throw error;
  }
}

// Función para probar el agente desde la terminal
async function main(): Promise<void> {
  // Hace una pregunta de prueba
  const result = await askQAWithTracing('¿Qué es un test de regresión?');
  // Muestra la respuesta
  console.log('Respuesta:', result.answer);
  // Muestra el puntaje y la razón del juez
  console.log(`📊 Puntaje de calidad: ${result.score} (${result.reason})`);
  // Envía todos los datos pendientes a Opik antes de terminar el programa
  await opikClient.flush();
  // Confirma al usuario
  console.log('✅ Trace enviado a Opik. Abre http://localhost:5173 para verlo.');
}

// Ejecuta main() solo cuando corremos ESTE archivo directamente (no cuando lo importan)
if (require.main === module) {
  main().catch((error) => {
    // Muestra el error en consola
    console.error(error);
    // Termina con código de error
    process.exit(1);
  });
}