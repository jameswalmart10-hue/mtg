// Step 1: Analyze deck and return structured needs
// Fast function - reads deck only, no collection needed
// Uses fetch directly (no SDK required)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const { apiKey, deck, commander } = JSON.parse(event.body)

    if (!apiKey || !deck || !commander) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing apiKey, deck, or commander' })
      }
    }

    const deckList = deck.cards.map(card =>
      `${card.name} | ${card.type || ''} | ${card.cmc || 0}CMC | ${card.keywords?.join(', ') || ''} | ${card.oracleText || ''}`
    ).join('\n')

    const commanderInfo = `${commander.name} | ${commander.type || ''} | ${commander.oracleText || ''}`

    const prompt = `You are a Magic: The Gathering Commander deck analyst.

COMMANDER:
${commanderInfo}

CURRENT DECK (${deck.cards.length} cards):
${deckList}

Analyze this deck and return ONLY a JSON object (no other text, no markdown) with this exact structure:

{
  "deckStrategy": "2-3 sentence summary of what this deck is trying to do",
  "gaps": ["specific gap 1", "specific gap 2", "specific gap 3"],
  "wantedKeywords": ["Flying", "Lifelink"],
  "synergyOracleTerms": ["wall", "defender", "toughness"],
  "wantedCreatureTypes": ["Wall", "Wizard"],
  "wantBigCreatures": false,
  "minPower": null,
  "needsRemoval": true,
  "needsRamp": true,
  "needsCardDraw": true,
  "needsBoardWipes": false,
  "needsCounterspells": false,
  "needsProtection": false,
  "needsLandFetch": false,
  "needsGraveyard": false,
  "needsTokens": false,
  "needsTutor": false,
  "removalCount": 4,
  "rampCount": 8,
  "cardDrawCount": 5,
  "idealRemovalCount": 8,
  "idealRampCount": 10,
  "idealCardDrawCount": 10,
  "additionalOracleTerms": ["other relevant term"],
  "cmcCurveNote": "curve is top-heavy, needs more 2-3 drops"
}

Be precise. IMPORTANT RULES:
1. Read commander oracle text CAREFULLY - if commander draws cards, needsCardDraw threshold is lower (6-8 ok).
2. If commander makes mana or cheats costs, needsRamp threshold is lower (6-8 ok).
3. Count flying+reach creatures in the deck list - if below 8 total, include Flying and Reach in wantedKeywords.
4. If commander has flying, include Flying in wantedKeywords for air defense support.
5. The wantedKeywords, synergyOracleTerms, and wantedCreatureTypes search the player collection - include ALL relevant synergy terms.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) {
      const errData = await response.json()
      throw new Error(`Anthropic API error: ${response.status} - ${JSON.stringify(errData)}`)
    }

    const data = await response.json()
    const responseText = data.content[0].text.trim()

    console.log('Deck needs raw response:', responseText)

    // Parse JSON - strip any markdown fences if present
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('AI did not return valid JSON')
    }

    const needs = JSON.parse(jsonMatch[0])

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ needs })
    }

  } catch (error) {
    console.error('Error in analyze-deck-needs:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    }
  }
}
