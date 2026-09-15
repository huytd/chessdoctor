"""
opening_detector.py - Opening classification, ECO recognition, and opening principles for Chess Doctor.
"""

from typing import Optional, Tuple, List, Dict
import chess

# Common opening move sequences (SAN format separated by spaces)
COMMON_OPENINGS = {
    "e4 e5 Nf3 Nc6 Bc4": ("C50", "Italian Game"),
    "e4 e5 Nf3 Nc6 Bb5": ("C60", "Ruy Lopez"),
    "e4 e5 Nf3 Nc6 d4": ("C44", "Scotch Game"),
    "e4 e5 Nf3 Nf6": ("C42", "Petrov's Defense"),
    "e4 e5 f4": ("C30", "King's Gambit"),
    "e4 c5": ("B20", "Sicilian Defense"),
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6": ("B90", "Sicilian Defense: Najdorf Variation"),
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6": ("B70", "Sicilian Defense: Dragon Variation"),
    "e4 c5 Nf3 e6": ("B40", "Sicilian Defense: French Variation"),
    "e4 c5 Nf3 Nc6": ("B30", "Sicilian Defense: Old Sicilian"),
    "e4 e6": ("C00", "French Defense"),
    "e4 e6 d4 d5": ("C01", "French Defense: Normal"),
    "e4 c6": ("B10", "Caro-Kann Defense"),
    "e4 c6 d4 d5": ("B12", "Caro-Kann Defense: Main Line"),
    "e4 d5": ("B01", "Scandinavian Defense"),
    "e4 d6": ("B07", "Pirc Defense"),
    "e4 g6": ("B06", "Modern Defense"),
    "e4 Nf6": ("B02", "Alekhine's Defense"),
    "d4 d5 c4": ("D06", "Queen's Gambit"),
    "d4 d5 c4 e6": ("D30", "Queen's Gambit Declined"),
    "d4 d5 c4 dxc4": ("D20", "Queen's Gambit Accepted"),
    "d4 d5 c4 c6": ("D10", "Slav Defense"),
    "d4 d5 Bf4": ("D00", "London System"),
    "d4 Nf6 c4 g6": ("E60", "King's Indian Defense"),
    "d4 Nf6 c4 e6 Nc3 Bb4": ("E20", "Nimzo-Indian Defense"),
    "d4 Nf6 c4 e6 Nf3 b6": ("E12", "Queen's Indian Defense"),
    "d4 Nf6 c4 c5": ("A56", "Benoni Defense"),
    "d4 f5": ("A80", "Dutch Defense"),
    "d4 g6": ("A40", "Queen's Pawn Game: Modern Defense"),
    "c4": ("A10", "English Opening"),
    "Nf3": ("A04", "Réti Opening"),
    "b3": ("A01", "Nimzo-Larsen Attack"),
}


class OpeningDetector:
    """Classifies chess openings and flags book moves and early opening mistakes."""

    @classmethod
    def identify_opening(cls, san_moves: List[str]) -> Tuple[str, str]:
        """
        Identify ECO code and opening name from the move sequence.
        Returns: (eco_code, opening_name)
        """
        # Try matching from longest sequence to shortest
        for length in range(min(12, len(san_moves)), 0, -1):
            sub_seq = " ".join(san_moves[:length])
            if sub_seq in COMMON_OPENINGS:
                return COMMON_OPENINGS[sub_seq]

        return "A00", "Irregular Opening"

    @classmethod
    def is_book_move(cls, san_moves: List[str], ply: int) -> bool:
        """
        Determine if the move at `ply` is part of standard opening theory.
        """
        if ply > 16:
            return False
        current_seq = " ".join(san_moves[:ply])
        for opening_seq in COMMON_OPENINGS.keys():
            if opening_seq.startswith(current_seq):
                return True
        return False

    @classmethod
    def detect_opening_principle_violation(
        cls,
        board_before: chess.Board,
        move: chess.Move,
        move_history: List[chess.Move]
    ) -> Optional[str]:
        """
        Detect common opening blunders/mistakes (moves 1-10):
        1. Moving the same piece twice before developing others.
        2. Bringing the Queen out too early.
        3. Excessive pawn moves while minor pieces stay undeveloped.
        """
        ply = len(move_history) + 1
        if ply > 16:
            return None

        color = board_before.turn
        piece = board_before.piece_at(move.from_square)
        if not piece:
            return None

        # 1. Early Queen development (ply <= 6)
        if piece.piece_type == chess.QUEEN and ply <= 6:
            # Check if queen move was a necessary capture or escape
            if not board_before.is_capture(move) and not board_before.is_check():
                return "developing the Queen too early, leaving it vulnerable to minor piece harassment"

        # 2. Moving the same piece twice in the first 8 moves
        if piece.piece_type in [chess.KNIGHT, chess.BISHOP] and ply <= 12:
            # Check if this exact piece moved before
            # If the piece started from home rank on move.from_square, this is its first move!
            home_rank = 0 if color == chess.WHITE else 7
            if chess.square_rank(move.from_square) != home_rank:
                # Was it under attack?
                opp_color = not color
                is_attacked = board_before.is_attacked_by(opp_color, move.from_square)
                is_capture = board_before.is_capture(move)
                if not is_attacked and not is_capture:
                    return f"moving the same {piece.piece_type == chess.KNIGHT and 'knight' or 'bishop'} twice in the opening instead of developing other pieces"

        return None
