# Chess Doctor

Chess Doctor is a chess game analysis tool that uses the Stockfish engine to analyze chess games and provide insights on moves. It can identify mistakes, inaccuracies, and blunders, and suggest better alternatives with explanations.

## Features

- Analyze chess games from PGN notation
- Interactive chessboard to visualize the game
- Move-by-move analysis with evaluations
- Identification of mistakes, inaccuracies, and blunders
- Suggested better moves with explanations
- Works as both a web application and a command-line tool

## Requirements

- Python 3.7+
- Stockfish chess engine (must be installed separately)

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/chessdoctor.git
   cd chessdoctor
   ```

2. Install the required Python packages:
   ```
   pip install -r requirements.txt
   ```

3. Install Stockfish:
   - **Linux**: `sudo apt-get install stockfish` (Debian/Ubuntu)
   - **macOS**: `brew install stockfish` (using Homebrew)
   - **Windows**: Download from [https://stockfishchess.org/download/](https://stockfishchess.org/download/) and install

## Usage

### Web Application

1. Start the web server:
   ```
   python main.py serve
   ```

2. Open your browser and navigate to `http://localhost:5000`

3. Paste your PGN notation into the text area and click "Analyze Game"

4. Use the navigation buttons to move through the game and see the analysis

### Command-Line Tool

Analyze a PGN file:
```
python main.py --pgn path/to/your/game.pgn
```

Specify a custom Stockfish path (if not in standard location):
```
python main.py --pgn path/to/your/game.pgn --engine path/to/stockfish
```

## PGN Format

PGN (Portable Game Notation) is a standard format for recording chess games. Here's an example:

```
[Event "Casual Game"]
[Site "London"]
[Date "1851.??.??"]
[Round "?"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 
9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 
16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 
22. Qf6+ Nxf6 23. Be7# 1-0
```

## License

MIT

## Acknowledgments

- [Stockfish](https://stockfishchess.org/) - The powerful open-source chess engine
- [python-chess](https://python-chess.readthedocs.io/) - Chess library for Python
- [chessboard.js](https://chessboardjs.com/) - JavaScript chessboard library
- [chess.js](https://github.com/jhlywa/chess.js) - JavaScript chess library 