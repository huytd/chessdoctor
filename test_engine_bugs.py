import pytest
import chess
import chess.engine
from chess_evaluator import score_to_cp, format_score, classify_move, cp_to_win_prob
from situation_recognizer import SituationRecognizer
from engine import ChessDoctor

def test_mate_score_handling_no_crash():
    # Forced mate in 1: Black king on h8, White Queen on g7 delivered mate
    s_mate = chess.engine.PovScore(chess.engine.Mate(1), chess.WHITE)
    cp = score_to_cp(s_mate.white())
    assert cp > 9000
    assert format_score(s_mate, chess.WHITE) == "M1"

    # Mate against
    s_mated = chess.engine.PovScore(chess.engine.Mate(-1), chess.WHITE)
    cp_lost = score_to_cp(s_mated.white())
    assert cp_lost < -9000
    assert format_score(s_mated, chess.WHITE) == "-M1"

def test_edge_file_outpost_no_crash():
    board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    # Should not raise ValueError on edge squares
    for sq in [chess.A4, chess.A5, chess.H4, chess.H5, chess.A1, chess.H8]:
        res = SituationRecognizer.is_true_outpost(board, sq, chess.WHITE)
        assert isinstance(res, bool)

def test_file_control_detected():
    # Board with an open d-file
    board = chess.Board("r1b1k2r/ppp2ppp/2n5/8/8/2N5/PPP2PPP/R3K2R w KQkq - 0 1")
    move = chess.Move(chess.A1, chess.D1)
    file_ctrl = SituationRecognizer.detect_file_control(board, move)
    assert file_ctrl is not None
    assert "open file" in file_ctrl

def test_7th_rank_rook_detected():
    # White rook moves to 7th rank (d7)
    board = chess.Board("4k3/4bppp/8/8/3R4/8/PPP2PPP/4K3 w - - 0 1")
    move = chess.Move(chess.D4, chess.D7)
    file_ctrl = SituationRecognizer.detect_file_control(board, move)
    assert file_ctrl is not None
    assert "7th rank" in file_ctrl

def test_king_safety_corner_no_wrap_around():
    # King on h1, pawns on g2 and h2
    board = chess.Board("6k1/5ppp/8/8/8/8/6PP/7K w - - 0 1")
    move = chess.Move(chess.H1, chess.G1)
    flaw = SituationRecognizer.detect_king_safety_flaw(board, board.copy(), move)
    # Moving king safely should not falsely claim wrap-around threats
    assert flaw is None

def test_hanging_piece_detection():
    # White plays 1. e4 e5 2. Nf3 Nc6 3. Bc4
    # Black blunders 3... f5? 4. exf5
    # Let's test a direct hanging piece
    board_before = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2")
    # Black blunders queen to e4 (undefended under pawn/knight attack)
    blunder_move = chess.Move.from_uci("d8f6") # safe
    board_after = board_before.copy()
    board_after.push(blunder_move)
    assert SituationRecognizer.detect_hanging_piece_blunder(board_before, board_after, blunder_move) is None

def test_analyze_game_pgn_string():
    pgn_text = """[Event "Test"]
[Site "Local"]
[Date "2025.01.01"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 1-0
"""
    with ChessDoctor() as doc:
        res = doc.analyze_game(pgn_text)
        assert len(res["errors"]) == 0
        assert len(res["moves"]) == 5
        assert res["game_info"]["white"] == "Player1"
        assert res["game_info"]["opening"] == "Italian Game"
        assert res["game_info"]["eco"] == "C50"

def test_threat_and_refutation_line_generation():
    # Scholar's mate attempt / blunder game:
    # 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6?? 4. Qxf7#
    pgn_text = """[Event "Test"]
1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0
"""
    with ChessDoctor() as doc:
        res = doc.analyze_game(pgn_text)
        assert len(res["errors"]) == 0
        moves = res["moves"]
        # Move 2. Qh5 threatens Qxf7# or Qxe5+
        qh5_move = moves[2]
        analysis_qh5 = qh5_move["analysis"]
        assert "threats_created" in analysis_qh5

        # Move 3... Nf6 blunders mate in 1
        nf6_move = moves[5]
        analysis_nf6 = nf6_move["analysis"]
        assert analysis_nf6.get("refutation") is not None
        assert analysis_nf6.get("refutation_variation") != ""
        assert analysis_nf6.get("refutation_from") == "h5"
        assert analysis_nf6.get("refutation_to") == "f7"

