# Chess Doctor

Chess Doctor is a Python tool that analyzes chess games from PGN files using the Stockfish chess engine to identify blunders, mistakes, and inaccuracies.

## Features

- Analyzes chess games from PGN (Portable Game Notation) files
- Uses Stockfish chess engine for accurate evaluations
- Identifies blunders, mistakes, and inaccuracies
- Shows position evaluation after each move
- Provides explanations for suboptimal moves
- Suggests best move alternatives with tactical explanations
- **Automatic Stockfish detection** - no need to provide engine path
- **Detailed positional analysis** - explains strategic mistakes beyond tactics

## Requirements

- Python 3.6 or higher
- Stockfish chess engine
- python-chess library

## Installation

1. Clone this repository or download the source code.

2. Install the required Python packages:

```bash
pip install -r requirements.txt
```

3. Install Stockfish:
   - **Linux**: `sudo apt-get install stockfish` (Debian/Ubuntu) or use your distribution's package manager
   - **macOS**: `brew install stockfish` (using Homebrew)
   - **Windows**: Download from the [official Stockfish website](https://stockfishchess.org/download/) and install

## Usage

Simply run:

```bash
python main.py path/to/your/game.pgn
```

The program will automatically detect your Stockfish installation. No additional configuration required in most cases.

If Stockfish can't be found automatically (rare), you can specify its location:

```bash
python main.py path/to/your/game.pgn --engine path/to/stockfish
```

## Interpreting Results

The program will analyze each move and classify them as:

- **Blunder**: A very bad move that significantly worsens the position (≥ 3 pawns worse)
- **Mistake**: A bad move that noticeably worsens the position (≥ 1 pawn worse)
- **Inaccuracy**: A suboptimal move (≥ 0.5 pawns worse)
- **Good move**: A move that doesn't significantly worsen the position

For blunders, mistakes, and inaccuracies, Chess Doctor will also provide:
- The best move you could have played instead
- A clear explanation of why your move was suboptimal
- Tactical opportunities that were missed
- Positional factors such as center control, king safety, and piece development

## Example Output

Here's an example of what the analysis output looks like:

```
Analyzing game: Carlsen, Magnus vs. Nepomniachtchi, Ian
Event: World Chess Championship 2021
Date: 2021.11.26
------------------------------------------------------------
1. e4 e5
2. Nf3 Nc6
3. Bb5 a6
4. Ba4 Nf6
5. O-O Nxe4

  ♚ Black's move: Nxe4 (mistake, eval: PovScore(Cp(+64), WHITE))
  ✓ Better move: Be7
  ℹ Why: Nxe4 missed a check. Be7 would be better.

6. d4 b5
7. Bb3 d5
8. dxe5 Be6
9. Nbd2 Be7

  ♔ White's move: Nbd2 (inaccuracy, eval: PovScore(Cp(-24), BLACK))
  ✓ Better move: Qe2
  ℹ Why: Qe2 is better than Nbd2 because it improves king safety and provides better control of the center.

10. Bc2 O-O
11. Nb3 Qd7

  ♚ Black's move: Qd7 (mistake, eval: PovScore(Cp(+355), WHITE))
  ✓ Better move: f5
  ℹ Why: f5 is better than Qd7 because it improves piece development and creates a better pawn structure.
```

The format clearly shows:
- The full sequence of moves on a single line
- Detailed analysis for problematic moves only
- Player indicators (♔ for White, ♚ for Black)
- Clear explanations that directly state what opportunities were missed
- Better move suggestions with reasoning
- Positional factors that explain strategic errors (not just tactical ones)

## Customization

You can adjust the analysis parameters by modifying the constants in the `ChessDoctor` class:

- `depth`: Search depth for standard Stockfish evaluation (default: 18)
- `time_limit`: Time limit per position in seconds (default: 0.5)
- `deep_analysis_depth`: Search depth for blunder/mistake analysis (default: 22)
- `deep_analysis_time`: Time limit for deep analysis (default: 1.0)
- Thresholds for classifying moves (in centipawns)

## License

MIT 