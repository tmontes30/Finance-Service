// parse-bank-statement — Supabase Edge Function
// Receives a bank statement image (base64) and uses Gemini Vision (free tier)
// to extract transactions as structured JSON.
//
// Setup:
//   1. Get a free API key at https://aistudio.google.com
//   2. In Supabase Dashboard → Edge Functions → Secrets, add GEMINI_API_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!req.headers.get('Authorization')) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  let imageBase64: string;
  let mimeType: string;
  try {
    const body = await req.json();
    imageBase64 = body.imageBase64;
    mimeType    = body.mimeType || 'image/jpeg';
  } catch (_) {
    return new Response('Invalid request body', { status: 400, headers: corsHeaders });
  }

  if (!imageBase64) {
    return new Response('Missing imageBase64', { status: 400, headers: corsHeaders });
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return new Response('GEMINI_API_KEY not configured', { status: 500, headers: corsHeaders });
  }

  const currentYear = new Date().getFullYear();
  const prompt = `Extrae todas las transacciones de este estado de cuenta bancario.
Devuelve un array JSON con objetos: {"date": "YYYY-MM-DD", "amount": number (positivo), "description": string, "type": "gasto"|"ingreso"}.
- "gasto": dinero que salió (débito, cargo, compra, pago, transferencia enviada).
- "ingreso": dinero que entró (crédito, abono, transferencia recibida, depósito, sueldo).
Si el año no aparece en la imagen, usa ${currentYear}.
Responde ÚNICAMENTE con el array JSON válido, sin texto adicional ni bloques markdown.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    return new Response(`Gemini API error: ${err}`, { status: 502, headers: corsHeaders });
  }

  const result = await response.json();
  let transactions: unknown[] = [];
  try {
    const raw = (result.candidates[0].content.parts[0].text as string)
      .replace(/```(?:json)?\n?/g, '').trim();
    transactions = JSON.parse(raw);
  } catch (_) {
    transactions = [];
  }

  return new Response(JSON.stringify({ transactions }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
