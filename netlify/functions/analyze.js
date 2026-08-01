// netlify/functions/analyze.js
// Netlify provides a modern Node.js environment where fetch is built-in (Node 18+)

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: { message: "Method Not Allowed" } }) };
  }

  try {
    const { image, category } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      return { 
        statusCode: 500, 
        headers,
        body: JSON.stringify({ error: { message: "GEMINI_API_KEY environment variable is missing on Netlify." } }) 
      };
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

    const promptText = `You are an expert toxicologist and cosmetic/food scientist. Analyze the ingredient list in this image for the product category: "${category || 'general'}".
    Extract all ingredients from the image label and classify them into three arrays: "beneficial", "harmful", and "neutral".
    
    For each ingredient, output an object with these exact keys:
    - "name": String name of ingredient
    - "role": Short function/role (e.g. "Vitamin B3", "UV Filter", "Preservative", "Solvent")
    - "description": Detailed text. ALWAYS describe Human Health impact FIRST, followed by Environmental impact if applicable. Format as: "Human Health: ... \\nEnvironment: ..."
    - "emphasis": A concise 1-sentence summary of the impact
    - "banStatus": Global or country ban information (or "Not globally banned")
    - "evaluations": Recent health board evaluations (e.g. FDA, EU SCCS, CIR, GRAS)

    Return ONLY valid JSON with keys: "beneficial", "harmful", "neutral". Ensure proper escaping.`;

    const modelsToTry = [
      'gemini-2.5-flash',
      'gemini-3.5-flash',
      'gemini-2.0-flash',
      'gemini-flash-latest'
    ];

    let response = null;
    let lastErrorMsg = "";

    for (const modelName of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: promptText },
                { inline_data: { mime_type: mimeType, data: base64Data } }
              ]
            }],
            generationConfig: {
              response_mime_type: "application/json"
            }
          })
        });

        if (res.ok) {
          response = res;
          break;
        } else {
          const errBody = await res.json().catch(() => ({}));
          lastErrorMsg = errBody.error?.message || `HTTP Status ${res.status}`;
        }
      } catch (netErr) {
        lastErrorMsg = netErr.message;
      }
    }

    if (!response) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: { message: lastErrorMsg || "Failed to reach Gemini API." } })
      };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: { message: err.message } })
    };
  }
};
