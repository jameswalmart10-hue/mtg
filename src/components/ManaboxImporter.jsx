import { useState } from 'react'
import scryfallService from '../services/scryfallService'
import manaboxParser from '../services/manaboxParser'
import './ManaboxImporter.css'

function ManaboxImporter({ onImport, onClose }) {
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    try {
      const text = await file.text()
      await processImport(text, file.name)
    } catch (err) {
      console.error('File read error:', err)
      setError(`Failed to read file: ${err.message}`)
    }
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      await processImport(text, 'pasted-deck')
    } catch (err) {
      console.error('Paste error:', err)
      setError(`Failed to paste: ${err.message}. Try using file upload instead.`)
    }
  }

  const processImport = async (text, filename) => {
    setImporting(true)
    setError('')
    setResult(null)
    setProgress({ stage: 'parsing', percent: 0, message: 'Parsing deck file...' })

    try {
      console.log('=== MANABOX IMPORT START ===')
      console.log('File:', filename)
      console.log('Content length:', text.length)

      // Step 1: Parse Manabox format
      const parsedDeck = manaboxParser.parse(text)
      console.log('Parsed deck:', parsedDeck)
      console.log('Commanders:', parsedDeck.commander.length)
      console.log('Cards:', parsedDeck.cards.length)
      console.log('Errors:', parsedDeck.errors.length)

      if (parsedDeck.errors.length > 0) {
        console.warn('Parse errors:', parsedDeck.errors)
      }

      const totalCards = parsedDeck.commander.length + parsedDeck.cards.length

      if (totalCards === 0) {
        throw new Error('No cards found in file. Please check the format.')
      }

      setProgress({ 
        stage: 'parsing', 
        percent: 5, 
        message: `Found ${totalCards} unique cards - looking them up...` 
      })

      // Step 2: Extract unique card names
      const cardNames = manaboxParser.extractCardNames(parsedDeck)
      console.log('Unique card names to look up:', cardNames.length)

      // Step 3: Look up cards directly via Scryfall API (no bulk download needed!)
      // Rate limited to 8/sec, so 100 cards = ~13 seconds
      const estimatedSeconds = Math.ceil(cardNames.length / 8)
      setProgress({ 
        stage: 'matching', 
        percent: 10, 
        message: `Looking up ${cardNames.length} cards via Scryfall (~${estimatedSeconds} seconds)...` 
      })

      const scryfallResults = await scryfallService.findCardsByNames(cardNames, (matchProgress) => {
        setProgress({
          stage: matchProgress.stage,
          percent: 10 + (matchProgress.percent * 0.85), // 10-95%
          message: matchProgress.message
        })
      })

      console.log('Scryfall results:', scryfallResults)
      console.log('Found:', scryfallResults.found.length)
      console.log('Not found:', scryfallResults.notFound.length)

      // Step 4: Merge Scryfall data with parsed deck
      const enhancedDeck = manaboxParser.mergeScryfallData(parsedDeck, scryfallResults)

      console.log('Enhanced deck:', enhancedDeck)

      setProgress({ 
        stage: 'complete', 
        percent: 100, 
        message: 'Import complete!' 
      })

      // Create result summary
      const summary = {
        totalCards,
        foundCards: scryfallResults.found.length,
        notFoundCards: scryfallResults.notFound.length,
        notFoundList: scryfallResults.notFound,
        parseErrors: parsedDeck.errors,
        deck: enhancedDeck
      }

      setResult(summary)

      console.log('=== MANABOX IMPORT COMPLETE ===')

      // If successful and no major issues, auto-import
      if (summary.notFoundCards === 0 && summary.parseErrors.length === 0) {
        setTimeout(() => {
          handleConfirmImport(summary.deck, filename)
        }, 1000)
      }

    } catch (err) {
      console.error('Import error:', err)
      setError(`Import failed: ${err.message}`)
      setImporting(false)
      setProgress(null)
    }
  }

  const handleConfirmImport = (deck, filename) => {
    // Determine deck name from filename or commander
    let deckName = filename.replace('.txt', '').replace('.csv', '')
    
    if (deck.commander.length > 0) {
      deckName = deck.commander[0].name
    }

    // Combine all cards
    const allCards = [...deck.commander, ...deck.cards].filter(card => !card.notFound)

    if (onImport) {
      onImport({
        name: deckName,
        cards: allCards
      })
    }

    setImporting(false)
    if (onClose) onClose()
  }

  return (
    <div className="manabox-importer-overlay" onClick={onClose}>
      <div className="manabox-importer" onClick={(e) => e.stopPropagation()}>
        <div className="importer-header">
          <h2>📥 Import from Manabox</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {!importing && !result && (
          <div className="import-options">
            <div className="import-option">
              <h3>📁 Upload File</h3>
              <p>Export your deck from Manabox as a .txt file, then upload it here.</p>
              <label className="file-upload-btn">
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                Choose File
              </label>
            </div>

            <div className="import-divider">OR</div>

            <div className="import-option">
              <h3>📋 Paste Text</h3>
              <p>Copy your deck list and paste it here.</p>
              <button className="paste-btn" onClick={handlePaste}>
                Paste from Clipboard
              </button>
            </div>
          </div>
        )}

        {importing && progress && (
          <div className="import-progress">
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${progress.percent}%` }}></div>
            </div>
            <p className="progress-message">{progress.message}</p>
            <p className="progress-percent">{Math.floor(progress.percent)}%</p>
          </div>
        )}

        {result && (
          <div className="import-result">
            <h3>✅ Import Summary</h3>
            
            <div className="result-stats">
              <div className="stat">
                <span className="stat-label">Total Cards:</span>
                <span className="stat-value">{result.totalCards}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Successfully Matched:</span>
                <span className="stat-value success">{result.foundCards}</span>
              </div>
              {result.notFoundCards > 0 && (
                <div className="stat">
                  <span className="stat-label">Not Found:</span>
                  <span className="stat-value warning">{result.notFoundCards}</span>
                </div>
              )}
              {result.parseErrors.length > 0 && (
                <div className="stat">
                  <span className="stat-label">Parse Errors:</span>
                  <span className="stat-value error">{result.parseErrors.length}</span>
                </div>
              )}
            </div>

            {result.notFoundCards > 0 && (
              <div className="not-found-section">
                <h4>⚠️ Cards Not Found:</h4>
                <ul>
                  {result.notFoundList.map((name, index) => (
                    <li key={index}>{name}</li>
                  ))}
                </ul>
                <p className="help-text">
                  These cards might have typos or be very new. They won't be imported.
                </p>
              </div>
            )}

            {result.parseErrors.length > 0 && (
              <div className="parse-errors-section">
                <h4>❌ Parse Errors:</h4>
                <ul>
                  {result.parseErrors.map((error, index) => (
                    <li key={index}>
                      <code>{error.line}</code>
                      <span className="error-reason">{error.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="result-actions">
              <button 
                className="import-confirm-btn"
                onClick={() => handleConfirmImport(result.deck, 'imported-deck')}
              >
                Import {result.foundCards} Cards
              </button>
              <button className="import-cancel-btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="import-error">
            <h3>❌ Error</h3>
            <p>{error}</p>
            <button onClick={() => { setError(''); setResult(null); setImporting(false); }}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ManaboxImporter
