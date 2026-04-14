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
    const { audioBase64, mimeType, audioFeatures } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    let prompt = '';

    // If we have actual audio data, use multimodal
    if (audioBase64) {
      const base64Data = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
      const actualMimeType = mimeType || 'audio/webm';

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
                  type: 'input_audio',
                  input_audio: {
                    data: base64Data,
                    format: actualMimeType.includes('webm') ? 'webm' : 'mp4',
                  },
                },
                {
                  type: 'text',
                 text: `Analyze the tone, pace, energy, and emotional qualities of this voice recording.

Return ONLY a valid JSON object (no markdown, no explanation) in exactly this format:
{
  "mood": "energetic|calm|focused|creative|motivated|sad|anxious|bored|unmotivated|curious",
  "confidence": 0.0-1.0,
  "suggestedDifficulty": "easy|medium|moderate|hard",
  "voiceTone": "brief description of voice tone",
  "speechDetected": true|false
}

Mood rules based on voice:
- Fast speech, high energy, enthusiastic tone → "energetic"
- Slow, soft, relaxed speech → "calm"
- Clear, deliberate, steady pace → "focused"
- Varied pitch, expressive, curious → "creative"
- Confident, strong, clear voice → "motivated"
- Quiet, shaky, low monotone, sighing → "sad"
- Rapid, uneven, high-pitched, breathless → "anxious"
- Flat, monotone, low effort, trailing off → "bored"
- Very low energy, mumbling, disengaged → "unmotivated"
- Inquisitive inflection, rising tones, questioning → "curious"

Difficulty mapping:
- Sad/unmotivated/very soft → "easy"
- Calm/bored/normal pace → "medium"
- Focused/curious/clear speech → "moderate"
- Energetic/anxious/fast/enthusiastic → "hard"

If no speech is detected, return speechDetected: false with reasonable defaults.`,
                },
              ],
            },
          ],
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'AI credits required.' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const aiResult = await response.json();
      const content = aiResult.choices?.[0]?.message?.content || '';

      let parsed;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        parsed = {
          mood: 'focused',
          confidence: 0.5,
          suggestedDifficulty: 'moderate',
          voiceTone: 'Could not parse voice',
          speechDetected: false,
        };
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback: use audio features (energy level, variance) to infer mood via text
    if (audioFeatures) {
      const { avgLevel, maxLevel, variance } = audioFeatures;

      prompt = `Based on these voice audio analysis features, infer the speaker's emotional state:
- Average volume level: ${(avgLevel * 100).toFixed(1)}% of max
- Peak volume level: ${(maxLevel * 100).toFixed(1)}% of max  
- Volume variance: ${(variance * 100).toFixed(1)}% (high variance = more expressive speech)

Return ONLY a valid JSON object in exactly this format:
{
  "mood": "energetic|calm|focused|creative|motivated|sad|anxious|bored|unmotivated|curious",
  "confidence": 0.0-1.0,
  "suggestedDifficulty": "easy|medium|moderate|hard",
  "voiceTone": "brief description",
  "speechDetected": true
}

Rules:
- High avg + high variance → "energetic" → "hard"
- Low avg + low variance → "calm" → "easy"
- Medium avg + low variance → "focused" → "moderate"
- Medium avg + high variance → "creative" → "moderate"
- High avg + low variance → "motivated" → "hard"
- Very low avg + very low variance → "sad" or "unmotivated" → "easy"
- High variance + medium avg → "anxious" → "hard"
- Low avg + zero variance → "bored" → "medium"
- Medium avg + medium variance + rising patterns → "curious" → "moderate"`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const aiResult = await response.json();
      const content = aiResult.choices?.[0]?.message?.content || '';

      let parsed;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        // Derive from features directly as last resort
        const energy = avgLevel;
        let mood: string, difficulty: string;
        if (energy > 0.6) { mood = 'energetic'; difficulty = 'hard'; }
        else if (energy > 0.4) { mood = 'motivated'; difficulty = 'moderate'; }
        else if (energy > 0.25) { mood = 'focused'; difficulty = 'medium'; }
        else { mood = 'calm'; difficulty = 'easy'; }

        parsed = { mood, confidence: 0.6, suggestedDifficulty: difficulty, voiceTone: 'Inferred from volume', speechDetected: true };
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'No audio data or features provided' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('detect-voice-emotion error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
