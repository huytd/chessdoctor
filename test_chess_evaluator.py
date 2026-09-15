import pytest
import chess
import chess.engine
from chess_evaluator import (
    score_to_cp,
    pov_score_to_cp,
    cp_to_win_prob,
    score_to_win_prob,
    format_score,
    classify_move,
    MATE_SCORE_CP
)

def test_score_to_cp():
    # Centipawns score
    s1 = chess.engine.Cp(150)
    assert score_to_cp(s1) == 150

    # Mate scores
    s_mate_win = chess.engine.Mate(1)
    assert score_to_cp(s_mate_win) == MATE_SCORE_CP - 10

    s_mate_loss = chess.engine.Mate(-2)
    assert score_to_cp(s_mate_loss) == -MATE_SCORE_CP + 20

def test_format_score():
    s_cp = chess.engine.PovScore(chess.engine.Cp(75), chess.WHITE)
    assert format_score(s_cp, chess.WHITE) == "+0.75"
    assert format_score(s_cp, chess.BLACK) == "-0.75"

    s_mate = chess.engine.PovScore(chess.engine.Mate(3), chess.WHITE)
    assert format_score(s_mate, chess.WHITE) == "M3"
    assert format_score(s_mate, chess.BLACK) == "-M3"

def test_cp_to_win_prob():
    # 0 cp = 50%
    assert pytest.approx(cp_to_win_prob(0), 0.01) == 0.50
    # +400 cp = ~90%
    assert pytest.approx(cp_to_win_prob(400), 0.02) == 0.909
    # -400 cp = ~9%
    assert pytest.approx(cp_to_win_prob(-400), 0.02) == 0.091

def test_classify_move():
    # Sub-optimal move in a completely winning position (+15 to +10) should NOT be a blunder
    # wp_before = 0.99, wp_after = 0.95
    ui_q, det_q, loss = classify_move(0.99, 0.95, played_is_best=False)
    assert ui_q == "good move"

    # Game-losing blunder from equal position
    # wp_before = 0.50, wp_after = 0.15
    ui_q, det_q, loss = classify_move(0.50, 0.15, played_is_best=False)
    assert ui_q == "blunder"
    assert det_q == "blunder"

    # Missed win: 0.90 -> 0.40
    ui_q, det_q, loss = classify_move(0.90, 0.40, played_is_best=False)
    assert ui_q == "blunder"
    assert det_q == "missed win"

    # Top engine choice
    ui_q, det_q, loss = classify_move(0.60, 0.60, played_is_best=True)
    assert ui_q == "good move"
    assert det_q == "best"

    # Brilliant sacrifice
    ui_q, det_q, loss = classify_move(0.70, 0.75, played_is_best=True, is_sacrifice=True)
    assert ui_q == "good move"
    assert det_q == "brilliant"
