exports.handler = async (event, context) => {
  // Helper to return JSON responses
  const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: JSON.stringify(body)
  })

  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, { message: 'OK' })
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  try {
    const { apiKey, deckData } = JSON.parse(event.body)

    if (!apiKey) {
      return jsonResponse(400, { error: 'API key is required' })
    }

    if (!deckData) {
      return jsonResponse(400, { error: 'Deck data is required' })
    }

    console.log('Making request to Anthropic API...')

    // Make the request to Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: deckData
        }]
      })
    })

    console.log('Response status:', response.status)

    const data = await response.json()

    if (!response.ok) {
      console.error('API error:', data)
      return jsonResponse(response.status, data)
    }

    console.log('Success!')
    return jsonResponse(200, data)

  } catch (error) {
    console.error('Function error:', error)
    return jsonResponse(500, { 
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    })
  }
}
