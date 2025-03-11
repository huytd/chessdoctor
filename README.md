# Chess Doctor

Chess Doctor is a powerful chess game analyzer that uses the Stockfish engine to provide detailed analysis of chess games. It identifies mistakes, blunders, and suggests better moves with explanations.

## Features

- Analyze chess games from PGN notation
- Identify blunders, mistakes, and inaccuracies
- Suggest better moves with detailed explanations
- Interactive web UI to visualize the analysis
- RESTful API for integration with other applications

## Requirements

- Python 3.7+
- Stockfish chess engine
- Flask
- Requests
- python-chess

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/chessdoctor.git
   cd chessdoctor
   ```

2. Install the required Python packages:
   ```
   pip install flask requests python-chess
   ```

3. Install Stockfish:
   - **Linux**: `sudo apt-get install stockfish` (Debian/Ubuntu)
   - **macOS**: `brew install stockfish` (using Homebrew)
   - **Windows**: Download from [stockfishchess.org](https://stockfishchess.org/download/) and install

## Running the Application

The application consists of two parts:
1. The Chess Doctor API (main.py)
2. The Web UI (app.py)

### Running the API

```
python main.py
```

By default, the API runs on port 5000. You can specify a different port or Stockfish engine path:

```
python main.py --port 5001 --engine /path/to/stockfish
```

### Running the Web UI

```
python app.py
```

The web UI runs on port 8080 by default and connects to the API on localhost:5000.

You can configure the API host and port using environment variables:

```
API_HOST=localhost API_PORT=5001 python app.py
```

## Using the Web UI

1. Open your browser and navigate to `http://localhost:8080`
2. Paste a PGN (Portable Game Notation) of a chess game into the text area
3. Click "Analyze Game"
4. Once analysis is complete, you can:
   - View the game move by move using the navigation buttons
   - See analysis for each move, with mistakes and blunders highlighted
   - Click on any move in the analysis panel to jump to that position

## API Endpoints

### `/analyze` (POST)

Analyzes a chess game from PGN notation.

**Request:**
```json
{
  "pgn": "[PGN string of the chess game]"
}
```

**Response:**
```json
{
  "game_info": {
    "white": "Player Name",
    "black": "Opponent Name",
    "event": "Tournament Name",
    "date": "2023.01.01"
  },
  "moves": [
    {
      "move_number": 1,
      "ply": 1,
      "move": "e4",
      "player": "White",
      "is_white": true,
      "quality": "good move",
      "evaluation": "PovScore(Cp(+20), WHITE)",
      "notation": "1. e4"
    },
    // More moves...
  ],
  "errors": []
}
```

## CLI Mode

You can also run Chess Doctor in CLI mode to analyze a PGN file directly:

```
python main.py --cli --pgn_file game.pgn
```

## License

[MIT License](LICENSE)

## Acknowledgements

- [Stockfish](https://stockfishchess.org/) - The powerful chess engine used for analysis
- [python-chess](https://python-chess.readthedocs.io/) - Chess library for Python
- [chessboard.js](https://chessboardjs.com/) - JavaScript chessboard component
- [chess.js](https://github.com/jhlywa/chess.js) - JavaScript chess library 