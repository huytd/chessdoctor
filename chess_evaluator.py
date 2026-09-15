"""
chess_evaluator.py - Score evaluation, win probability, and move classification for Chess Doctor.
"""

import math
from typing import Optional, Tuple, Dict, Any
import chess
import chess.engine

# Constant for representing forced mate in centipawns
MATE_SCORE_CP = 10000


def score_to_cp(score: chess.engine.Score, mate_score: int = MATE_SCORE_CP) -> int:
    """
    Safely convert a chess.engine.Score object to centipawns.
    Never returns None, even for mate scores.
    """
    if score.is_mate():
        mate_moves = score.mate()
        if mate_moves is None:
            return 0
        if mate_moves > 0:
            return mate_score - mate_moves * 10
        else:
            return -mate_score - mate_moves * 10
    cp = score.score()
    return cp if cp is not None else 0


def pov_score_to_cp(pov_score: chess.engine.PovScore, color: chess.Color = chess.WHITE) -> int:
    """Get score in centipawns from the given color's perspective."""
    return score_to_cp(pov_score.pov(color))


def cp_to_win_prob(cp: int) -> float:
    """
    Convert centipawns to win probability (0.0 to 1.0) using a logistic model.
    0 cp = 0.50 win probability.
    +400 cp (+4 pawns) ~= 0.90 win probability.
    -400 cp (-4 pawns) ~= 0.10 win probability.
    """
    # Clamp to prevent overflow in math.exp
    cp_clamped = max(-MATE_SCORE_CP, min(MATE_SCORE_CP, cp))
    try:
        # Standard logistic formula: 1 / (1 + 10^(-cp / 400))
        # Equivalent to 1 / (1 + exp(-cp * ln(10) / 400))
        return 1.0 / (1.0 + math.pow(10.0, -cp_clamped / 400.0))
    except OverflowError:
        return 1.0 if cp_clamped > 0 else 0.0


def score_to_win_prob(pov_score: chess.engine.PovScore, color: chess.Color) -> float:
    """Get win probability from the given player's perspective."""
    cp = pov_score_to_cp(pov_score, color)
    return cp_to_win_prob(cp)


def format_score(pov_score: chess.engine.PovScore, color: chess.Color = chess.WHITE) -> str:
    """Format a PovScore into human-readable notation (+1.25, -0.40, M2, -M4)."""
    score = pov_score.pov(color)
    if score.is_mate():
        moves = score.mate()
        if moves is not None:
            return f"M{moves}" if moves > 0 else f"-M{abs(moves)}"
        return "Mate"
    cp = score.score()
    if cp is None:
        return "0.00"
    sign = "+" if cp >= 0 else ""
    return f"{sign}{cp / 100.0:.2f}"


def classify_move(
    wp_before: float,
    wp_after: float,
    played_is_best: bool = False,
    is_book: bool = False,
    is_sacrifice: bool = False,
    is_only_move: bool = False,
    mate_missed: bool = False
) -> Tuple[str, str, float]:
    """
    Classify a move based on win probability difference and context.
    
    Returns:
        (ui_quality, detailed_quality, wp_loss)
        ui_quality: one of 'good move', 'inaccuracy', 'mistake', 'blunder' (for UI compatibility)
        detailed_quality: 'brilliant', 'great', 'best', 'excellent', 'good', 'book', 
                          'inaccuracy', 'mistake', 'blunder', 'missed win'
        wp_loss: loss in win probability (0.0 to 1.0)
    """
    if is_book:
        return "good move", "book", 0.0

    wp_loss = max(0.0, wp_before - wp_after)

    # If the played move was the engine's #1 choice
    if played_is_best:
        if is_sacrifice and wp_after >= 0.60:
            return "good move", "brilliant", wp_loss
        if is_only_move and wp_after >= 0.50:
            return "good move", "great", wp_loss
        if wp_loss <= 0.01:
            return "good move", "best", wp_loss
        return "good move", "excellent", wp_loss

    # If position remains completely winning despite a sub-optimal move
    # e.g., +15 drops to +10, wp goes from 0.99 to 0.96. Player is still crushing.
    if wp_before >= 0.95 and wp_after >= 0.90:
        if wp_loss < 0.15:
            return "good move", "good", wp_loss
        else:
            return "inaccuracy", "inaccuracy", wp_loss

    # Missed win: was winning decisively (wp >= 0.85), but threw away the advantage (wp < 0.55)
    if (wp_before >= 0.85 and wp_after < 0.55) or mate_missed:
        return "blunder", "missed win", wp_loss

    # Thresholds based on win probability loss
    if wp_loss >= 0.22:
        return "blunder", "blunder", wp_loss
    elif wp_loss >= 0.10:
        return "mistake", "mistake", wp_loss
    elif wp_loss >= 0.04:
        return "inaccuracy", "inaccuracy", wp_loss
    elif wp_loss <= 0.015:
        return "good move", "excellent", wp_loss
    else:
        return "good move", "good", wp_loss
