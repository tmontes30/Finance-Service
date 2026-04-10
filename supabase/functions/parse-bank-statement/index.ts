// parse-bank-statement — Supabase Edge Function
// Receives a bank statement image (base64) and uses Claude Vision
// to extract transactions as structured JSON.
//
// Setup:
//   supabase functions deploy parse-bank-statement
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
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

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 500, headers: corsHeaders });
  }

  const currentYear = new Date().getFullYear();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `Extrae todas las transacciones de este estado de cuenta bancario.
Devuelve un array JSON con objetos: {"date": "YYYY-MM-DD", "amount": number (positivo), "description": string, "type": "gasto"|"ingreso"}.
- "gasto": dinero que salió (débito, cargo, compra, pago, transferencia enviada).
- "ingreso": dinero que entró (crédito, abono, transferencia recibida, depósito, sueldo).
Si el año no aparece en la imagen, usa ${currentYear}.
Responde ÚNICAMENTE con el array JSON válido, sin texto adicional ni bloques markdown.`,
          },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return new Response(`Claude API error: ${err}`, { status: 502, headers: corsHeaders });
  }

  const result = await response.json();
  let transactions: unknown[] = [];
  try {
    // Strip markdown code fences if Claude wraps the JSON
    const raw = (result.content[0].text as string).replace(/```(?:json)?\n?/g, '').trim();
    transactions = JSON.parse(raw);
  } catch (_) {
    transactions = [];
  }

  return new Response(JSON.stringify({ transactions }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
