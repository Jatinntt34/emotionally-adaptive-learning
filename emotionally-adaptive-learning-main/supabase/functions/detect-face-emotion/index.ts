import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'No image data provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Strip data URL prefix if present
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`,
                },
              },
              {
                type: 'text',
                text: `Analyze the facial expression in this image and detect the emotional state.
                
Return ONLY a valid JSON object (no markdown, no explanation) in exactly this format:
{
  "mood": "energetic|calm|focused|creative|motivated|sad|anxious|bored|unmotivated|curious",
  "confidence": 0.0-1.0,
  "suggestedDifficulty": "easy|medium|moderate|hard",
  "emotionDetails": "brief description of detected expression",
  "faceDetected": true|false
}

Mood mapping rules:
- Happy, excited, enthusiastic, big smile → "energetic"
- Relaxed, peaceful, serene, gentle smile → "calm"
- Concentrated, serious, determined, furrowed brow → "focused"
- Curious, playful, expressive, raised eyebrows → "creative"
- Confident, alert, ready, strong posture → "motivated"
- Downcast eyes, frown, drooping, teary → "sad"
- Wide eyes, tense jaw, worried look, restless → "anxious"
- Blank stare, disinterested, yawning, flat expression → "bored"
- Slouched, apathetic, tired but not sad, low energy → "unmotivated"
- Tilted head, squinting, leaning in, thoughtful → "curious"

Difficulty mapping based on mood and energy:
- Sad/unmotivated/tired → "easy" (lower cognitive load, small wins)
- Calm/bored/relaxed → "medium" (gentle engagement)
- Focused/curious/creative → "moderate" (balanced challenge)
- Energetic/excited/motivated/anxious → "hard" (channel energy into challenge)

If no face is detected, return faceDetected: false with reasonable defaults.`,
              },
            ],
          },
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits required. Please add credits to your workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';

    // Parse the JSON from AI response
    let parsed;
    try {
      // Extract JSON if wrapped in markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error('Failed to parse AI response:', content);
      parsed = {
        mood: 'focused',
        confidence: 0.5,
        suggestedDifficulty: 'moderate',
        emotionDetails: 'Could not parse expression',
        faceDetected: false,
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('detect-face-emotion error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
