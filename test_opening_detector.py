import pytest
import chess
from opening_detector import OpeningDetector

def test_identify_opening():
    moves = ["e4", "e5", "Nf3", "Nc6", "Bc4"]
    eco, name = OpeningDetector.identify_opening(moves)
    assert eco == "C50"
    assert name == "Italian Game"

    sicilian = ["e4", "c5"]
    eco, name = OpeningDetector.identify_opening(sicilian)
    assert eco == "B20"
    assert name == "Sicilian Defense"

def test_is_book_move():
    moves = ["e4", "e5", "Nf3"]
    assert OpeningDetector.is_book_move(moves, 1) is True # 1. e4
    assert OpeningDetector.is_book_move(moves, 2) is True # 1... e5
    assert OpeningDetector.is_book_move(moves, 3) is True # 2. Nf3
    # Nonsense move
    nonsense = ["h4", "a6"]
    assert OpeningDetector.is_book_move(nonsense, 1) is False

def test_detect_early_queen():
    board = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2")
    # White plays 2. Qh5?!
    move = chess.Move.from_uci("d1h5")
    violation = OpeningDetector.detect_opening_principle_violation(board, move, [chess.Move.from_uci("e2e4"), chess.Move.from_uci("e7e5")])
    assert violation is not None
    assert "Queen too early" in violation
