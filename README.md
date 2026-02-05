# 🎴 MTG Deck Analyzer

AI-powered Magic: The Gathering deck builder with card collection management and strategic analysis.

## ✨ Features

- **Deck Import**: Paste your deck lists in MTGO/Arena format
- **Card Database**: Automatic card data fetching from Scryfall API
- **Visual Deck View**: See all your cards with images
- **Multi-Select Management**: Select and manage multiple cards at once
- **Collection Tracking**: Keep track of all your cards
- **AI Analysis**: Get strategic improvement suggestions powered by Claude AI
- **Mobile-Friendly**: Works great on phones and tablets
- **Offline Support**: Installable as a Progressive Web App (PWA)

## 🚀 Quick Start - Deploy to Netlify

### Method 1: Drag & Drop (Easiest)

1. **Create a free Netlify account**: Go to [netlify.com](https://netlify.com) and sign up

2. **Deploy the app**:
   - In Netlify, click "Sites" → "Add new site" → "Deploy manually"
   - Drag the entire `dist` folder from this project into the upload area
   - Done! Your app is live

3. **Get your URL**: Netlify will give you a URL like `https://random-name-12345.netlify.app`

4. **Add to your phone home screen**:
   - Open the URL on your phone
   - iPhone: Tap Share → Add to Home Screen
   - Android: Tap Menu → Add to Home Screen

### Method 2: GitHub (Better for updates)

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **Connect Netlify to GitHub**:
   - In Netlify: "Add new site" → "Import from Git"
   - Connect your GitHub repo
   - Build settings:
     - Build command: `npm run build`
     - Publish directory: `dist`
   - Deploy!

3. **Auto-updates**: Now every time you push to GitHub, Netlify auto-deploys

## 📱 How to Use

### Importing a Deck

1. Go to "Import Deck" tab
2. Paste your deck list in this format:
   ```
   1 Sauron, the Dark Lord (LTR) 224
   1 Command Tower (LTC) 301
   1 Sol Ring (C21) 263
   ```
3. Click "Import Deck"
4. Wait for cards to load from Scryfall (takes ~30 seconds)

### Managing Your Decks

- **View Decks**: Click "My Decks" to see all saved decks
- **Select Cards**: Click any card to select/deselect
- **Multi-Select**: Use "Select All" to select everything
- **Remove Cards**: Select cards → "Remove from Deck"
- **Add to Collection**: Select cards → "Add to Collection"

### Using AI Analysis

1. **Get an API Key**:
   - Go to [console.anthropic.com](https://console.anthropic.com)
   - Create a free account
   - Go to "API Keys" → "Create Key"
   - Copy the key (starts with `sk-ant-`)

2. **Analyze Your Deck**:
   - Open a deck → Click "AI Analysis"
   - Paste your API key when prompted
   - Click "Analyze Deck"
   - Wait 10-30 seconds for results

3. **Cost**: About $0.01-0.05 per analysis (Claude charges per use)

## 🔧 Local Development

Want to modify the code? Here's how:

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 💾 Data Storage

- **All data saved locally** in your browser (localStorage)
- **No cloud storage** - your data stays on your device
- **Backup tip**: Export your collection as text occasionally

## 🐛 Troubleshooting

### Cards won't load
- Check the deck format matches examples
- Make sure set codes are correct (3 letters)
- Try importing fewer cards at once

### AI Analysis fails
- Verify your API key is correct
- Check you have API credits at console.anthropic.com
- Make sure you're connected to internet

### App won't install on phone
- Use Chrome/Safari (not Firefox)
- Make sure you're on HTTPS (Netlify provides this)
- Try "Add to Home Screen" from browser menu

## 📝 Deck Format Examples

**Standard Format:**
```
1 Card Name (SET) 123
4 Another Card (ABC) 456
```

**With Commander Header:**
```
// COMMANDER
1 Sauron, the Dark Lord (LTR) 224

// DECK
1 Command Tower (LTC) 301
1 Sol Ring (C21) 263
```

**With 'x' notation:**
```
1x Card Name (SET) 123
4x Another Card (ABC) 456
```

## 🎯 Tips & Tricks

1. **Start small**: Import 10-20 cards first to test
2. **Use AI wisely**: Analysis costs money - save your best decks first
3. **Build collection**: Add cards from decks to collection for better AI suggestions
4. **Take screenshots**: Save AI analysis results for reference
5. **Backup regularly**: Your data is only in your browser

## 🔐 Privacy & Security

- **No account required**
- **No data sent to servers** (except AI analysis)
- **API key stored locally** in your browser
- **Your cards, your data** - completely private

## 🆘 Need Help?

Common issues and solutions:

- **"API key invalid"**: Make sure you copied the full key from Anthropic
- **"Card not found"**: Check set code and collector number
- **"Can't save decks"**: Enable cookies/storage in browser
- **Page blank after deploy**: Check _redirects file is in dist folder

## 🚀 Future Features (Coming Soon)

- [ ] Export deck to MTGO/Arena format
- [ ] Deck comparison tool
- [ ] Mana curve visualization
- [ ] Price tracking (TCGPlayer integration)
- [ ] Share decks via link

## 📄 License

MIT - Free to use and modify!

---

**Built with:** React, Vite, Scryfall API, Claude AI

**Need more help?** Check the Issues tab or ask me!
