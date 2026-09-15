# WhyBlunder

WhyBlunder is a powerful chess game analyzer that runs entirely in your browser using WebAssembly. It uses the Stockfish engine (compiled to WASM) to provide detailed analysis of chess games — no server or installation required.

<img width="1418" alt="image" src="https://github.com/user-attachments/assets/750a4c91-aafc-42d9-a491-adb01199c853" />

## Features

- Analyze chess games from PGN notation
- Identify blunders, mistakes, and inaccuracies
- Suggest better moves with detailed explanations
- Interactive web UI to visualize the analysis
- Runs 100% in-browser — no backend, no installation

## Usage

Simply open the app in your browser:

👉 **[whyblunder.vercel.app](https://whyblunder.vercel.app)**

1. Paste a PGN (Portable Game Notation) of a chess game into the text area
2. Click **Analyze Game**
3. Once analysis is complete, you can:
   - View the game move by move using the navigation buttons
   - See analysis for each move, with mistakes and blunders highlighted
   - Click on any move in the analysis panel to jump to that position

## Running Locally

The frontend is a static site — just serve the repo root with any static file server:

```bash
# Using Python's built-in server
python3 -m http.server 3030
# Then open http://localhost:3030
```

Or use any other static server (e.g. `npx serve .`).

## Deployment

The app is deployed as a static site on [Vercel](https://vercel.com).

## Acknowledgements

- [Stockfish](https://stockfishchess.org/) — The powerful chess engine (compiled to WebAssembly)
- [chessboard.js](https://chessboardjs.com/) — JavaScript chessboard component
- [chess.js](https://github.com/jhlywa/chess.js) — JavaScript chess library
