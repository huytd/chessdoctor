import pytest
import chess
from situation_recognizer import SituationRecognizer

def test_detect_fork():
    # Setup a knight fork position
    # White knight on c7 forks Black King on e8 and Black Rook on a8
    board = chess.Board("r3k3/8/8/8/8/8/8/4K3 w - - 0 1")
    # Add white knight to e6 moving to c7
    board.set_piece_at(chess.E6, chess.Piece(chess.KNIGHT, chess.WHITE))
    move = chess.Move(chess.E6, chess.C7)
    board_after = board.copy()
    board_after.push(move)

    fork = SituationRecognizer.detect_fork(board_after, move)
    assert fork is not None
    assert fork["type"] == "fork"
    assert "king" in fork["targets"]
    assert "rook" in fork["targets"]

def test_detect_hanging_piece():
    # White plays 1. e4 (normal) then Black plays 1... g5?? leaving pawn on g5 undefended
    board = chess.Board()
    board.push_san("e4")
    # Black blunders queen to e4
    board_before = board.copy()
    move = chess.Move.from_uci("d8e7") # 1... Qe7 (still defended)
    # Let's test a real blunder: Black plays 1... h5, then White plays 2. Qh5
    board = chess.Board("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1")
    # Black blunders knight to h6, where Bishop on c1 attacks it or d5
    # Let's test putting Queen on e4 for free
    board = chess.Board("rnb1kbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2")
    # Black plays ...Qe7 vs ...Nf6
    # Let's construct an explicit hanging piece move:
    board_before = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2")
    # White blunders queen to e5 (hanging, black pawn on d7/f7 or knight can take)
    # Put white bishop on e5 where black pawn d7 can capture it
    board_before = chess.Board("rnbqkbnr/pppp1ppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1")
    board_before.set_piece_at(chess.E2, chess.Piece(chess.BISHOP, chess.WHITE))
    move = chess.Move(chess.E2, chess.D3) # safe
    board_after = board_before.copy()
    board_after.push(move)
    assert SituationRecognizer.detect_hanging_piece_blunder(board_before, board_after, move) is None

    # Now blunder: Bishop to e6 (attacked by d7 pawn)
    blunder_move = chess.Move(chess.E2, chess.E6)
    board_after_blunder = board_before.copy()
    board_after_blunder.push(blunder_move)
    hanging = SituationRecognizer.detect_hanging_piece_blunder(board_before, board_after_blunder, blunder_move)
    assert hanging is not None
    assert hanging["piece"] == "bishop"

def test_true_outpost():
    # Knight on d5 for White with pawn on e4 or c4, black pawns on c7/e7 traded or behind
    board = chess.Board("r1bqk2r/pp2bppp/2n5/3N4/4P3/8/PPP2PPP/R1BQK2R w KQkq - 0 1")
    # Knight on d5: rank 4 (0-indexed rank 4 = rank 5 in chess notation)
    # Defended by e4 pawn
    # Black has no pawns on c or e file ahead of d5 (c-pawn is gone, e-pawn is gone)
    is_outpost = SituationRecognizer.is_true_outpost(board, chess.D5, chess.WHITE)
    assert is_outpost is True

    # Edge files should not crash!
    # Test a4, a5, h4, h5
    assert SituationRecognizer.is_true_outpost(board, chess.A4, chess.WHITE) is False
    assert SituationRecognizer.is_true_outpost(board, chess.H5, chess.WHITE) is False

def test_detect_file_control():
    # Rook moves to open d-file
    board = chess.Board("r1b1k2r/ppp2ppp/2n5/8/8/2N5/PPP2PPP/R3K2R w KQkq - 0 1")
    # d-file has no pawns!
    # Rook on a1 moves to d1
    move = chess.Move(chess.A1, chess.D1)
    file_ctrl = SituationRecognizer.detect_file_control(board, move)
    assert file_ctrl == "taking control of the open file"

def test_explain_blunder_or_mistake():
    board_before = chess.Board("r1bqkb1r/pppp1ppp/2n5/4p3/4n3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4")
    # White blunders King to e2?
    played_move = chess.Move(chess.E1, chess.E2)
    best_move = chess.Move(chess.D2, chess.D4)
    board_after = board_before.copy()
    board_after.push(played_move)
    # Opponent refutation: Black plays ...d5 or ...Bc5+
    refutation_move = chess.Move(chess.D7, chess.D5)

    exp, tags = SituationRecognizer.explain_blunder_or_mistake(
        board_before,
        board_after,
        played_move,
        best_move,
        refutation_move
    )
    assert "Ke2" in exp
    assert "d4" in exp
    assert "forfeiting castling rights" in exp
    assert "King Safety" in tags
