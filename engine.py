"""
engine.py - Core Chess Doctor game analyzer with Stockfish and situation recognition.
"""

import os
import sys
import shutil
import io
from typing import Optional, List, Dict, Any
import chess
import chess.pgn
import chess.engine

from chess_evaluator import (
    score_to_win_prob,
    format_score,
    pov_score_to_cp,
    classify_move
)
from situation_recognizer import SituationRecognizer
from opening_detector import OpeningDetector


class ChessDoctor:
    """Analyzes chess games using Stockfish and intelligent situation recognition."""

    def __init__(
        self,
        stockfish_path: Optional[str] = None,
        depth: int = 18,
        time_limit: float = 0.25,
        threads: int = 2,
        hash_mb: int = 64
    ):
        """Initialize analyzer with Stockfish engine."""
        if not stockfish_path:
            stockfish_path = self._find_stockfish()

        if not stockfish_path or not os.path.exists(stockfish_path):
            raise FileNotFoundError(
                f"Stockfish engine not found at '{stockfish_path}'. "
                "Please install Stockfish and provide the path using --engine."
            )

        self.stockfish_path = stockfish_path
        self.depth = depth
        self.time_limit = time_limit
        self.threads = threads
        self.hash_mb = hash_mb
        self.engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)

        # Configure engine options
        try:
            self.engine.configure({"Threads": self.threads, "Hash": self.hash_mb})
        except Exception:
            pass

        self._eval_cache: Dict[str, Any] = {}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def close(self):
        """Cleanly shutdown the Stockfish subprocess."""
        if hasattr(self, "engine") and self.engine is not None:
            try:
                self.engine.quit()
            except Exception:
                pass
            self.engine = None

    def _find_stockfish(self) -> Optional[str]:
        """Attempt to locate Stockfish binary in common locations."""
        which_sf = shutil.which("stockfish")
        if which_sf and os.path.exists(which_sf):
            return which_sf

        common_locations = [
            "/home/king/.local/bin/stockfish",
            "/usr/local/bin/stockfish",
            "/usr/bin/stockfish",
            "/usr/games/stockfish",
            "/opt/homebrew/bin/stockfish",
            os.path.expanduser("~/.local/bin/stockfish"),
            os.path.expanduser("~/stockfish"),
            "C:/Program Files/Stockfish/stockfish.exe",
        ]
        for loc in common_locations:
            if os.path.exists(loc):
                return loc

        return None

    def _format_pv(self, board: chess.Board, pv_moves: List[chess.Move], max_moves: int = 5) -> str:
        """Format a principal variation into readable standard algebraic notation."""
        if not pv_moves:
            return ""
        b = board.copy()
        tokens = []
        for i, m in enumerate(pv_moves[:max_moves]):
            if not b.is_legal(m):
                break
            san = b.san(m)
            if b.turn == chess.WHITE:
                tokens.append(f"{b.fullmove_number}. {san}")
            else:
                if i == 0:
                    tokens.append(f"{b.fullmove_number}... {san}")
                else:
                    tokens.append(san)
            b.push(m)
        return " ".join(tokens)

    def analyze_game(self, pgn_input: str, depth: Optional[int] = None) -> Dict[str, Any]:
        """
        Analyze a game from a PGN file path or PGN text string and return JSON analysis data.
        """
        analysis_data: Dict[str, Any] = {
            "game_info": {},
            "moves": [],
            "errors": []
        }
        target_depth = depth if depth is not None else self.depth

        try:
            if os.path.isfile(pgn_input):
                with open(pgn_input, "r", encoding="utf-8", errors="replace") as f:
                    game = chess.pgn.read_game(f)
            else:
                game = chess.pgn.read_game(io.StringIO(pgn_input))

            if not game:
                error_msg = "Could not parse game from PGN input"
                analysis_data["errors"].append(error_msg)
                return analysis_data

            # Extract headers
            analysis_data["game_info"] = {
                "white": game.headers.get("White", "Unknown"),
                "black": game.headers.get("Black", "Unknown"),
                "event": game.headers.get("Event", "Unknown"),
                "date": game.headers.get("Date", "Unknown"),
                "eco": game.headers.get("ECO", ""),
                "opening": game.headers.get("Opening", "")
            }

            all_moves = list(game.mainline_moves())
            san_moves = []
            temp_board = game.board()
            for m in all_moves:
                san_moves.append(temp_board.san(m))
                temp_board.push(m)

            # Auto-detect opening if header is missing or irregular
            if not analysis_data["game_info"]["opening"] or analysis_data["game_info"]["opening"] == "Unknown":
                detected_eco, detected_opening = OpeningDetector.identify_opening(san_moves)
                analysis_data["game_info"]["eco"] = detected_eco
                analysis_data["game_info"]["opening"] = detected_opening

            board = game.board()
            ply = 0
            move_history = []
            current_move_line = ""

            for i, move in enumerate(all_moves):
                try:
                    san_move = san_moves[i]
                    is_white_move = (ply % 2 == 0)
                    move_number = (ply // 2) + 1
                    player = "White" if is_white_move else "Black"
                    turn_color = board.turn

                    if is_white_move:
                        current_move_line = f"{move_number}. {san_move}"
                    else:
                        current_move_line += f" {san_move}"

                    board_before_move = board.copy()

                    # Single-pass MultiPV=3 search on board before move
                    fen_before = board_before_move.fen()
                    if fen_before in self._eval_cache:
                        multipv_res = self._eval_cache[fen_before]
                    else:
                        multipv_res = self.engine.analyse(
                            board_before_move,
                            chess.engine.Limit(depth=target_depth, time=self.time_limit),
                            multipv=min(3, board_before_move.legal_moves.count())
                        )
                        self._eval_cache[fen_before] = multipv_res

                    best_entry = multipv_res[0] if multipv_res else {}
                    best_pv = best_entry.get("pv", [])
                    best_move = best_pv[0] if best_pv else move
                    best_score = best_entry.get("score", chess.engine.PovScore(chess.engine.Cp(0), chess.WHITE))
                    best_san = board_before_move.san(best_move) if best_move else san_move
                    wp_best = score_to_win_prob(best_score, turn_color)

                    # Check if played move was best or found in MultiPV
                    played_is_best = (move == best_move)
                    played_score = None
                    refutation_move = None
                    refutation_pv = None

                    if played_is_best:
                        played_score = best_score
                        if len(best_pv) > 1:
                            refutation_move = best_pv[1]
                            refutation_pv = best_pv[1:]
                    else:
                        for entry in multipv_res[1:]:
                            entry_pv = entry.get("pv", [])
                            if entry_pv and entry_pv[0] == move:
                                played_score = entry.get("score", None)
                                break

                    # Advance board with the played move
                    board.push(move)
                    ply += 1
                    move_history.append(move)

                    # If not found in MultiPV, evaluate board after move to get score & refutation
                    if played_score is None or not refutation_move:
                        post_res = self.engine.analyse(
                            board,
                            chess.engine.Limit(depth=max(8, target_depth - 2), time=self.time_limit),
                            multipv=1
                        )
                        if post_res and len(post_res) > 0:
                            # Evaluation after move from opponent's turn -> invert for player
                            played_score = post_res[0]["score"]
                            if "pv" in post_res[0] and len(post_res[0]["pv"]) > 0:
                                refutation_move = post_res[0]["pv"][0]
                                refutation_pv = post_res[0]["pv"]
                        else:
                            played_score = best_score

                    wp_played = score_to_win_prob(played_score, turn_color)

                    # Check opening book
                    is_book = OpeningDetector.is_book_move(san_moves, ply)

                    # Classify move quality
                    ui_quality, detailed_quality, wp_loss = classify_move(
                        wp_before=wp_best,
                        wp_after=wp_played,
                        played_is_best=played_is_best,
                        is_book=is_book
                    )

                    # Generate explanation and tags
                    if ui_quality != "good move":
                        explanation, tags = SituationRecognizer.explain_blunder_or_mistake(
                            board_before_move,
                            board,
                            move,
                            best_move if best_move else move,
                            refutation_move,
                            refutation_pv
                        )
                        # Check opening principle violation
                        op_violation = OpeningDetector.detect_opening_principle_violation(
                            board_before_move, move, move_history[:-1]
                        )
                        if op_violation and "Development" not in tags:
                            explanation = f"{san_move} was a mistake: {op_violation}. {board_before_move.san(best_move)} was better."
                            tags.append("Opening Principle")
                    else:
                        explanation, tags = SituationRecognizer.explain_good_move(
                            board_before_move,
                            move,
                            is_best=played_is_best
                        )

                    # Detect direct threats created by the played move on the board
                    threats_created = SituationRecognizer.detect_threats_created(board, move)

                    best_pv_formatted = self._format_pv(board_before_move, best_pv)
                    ref_san = None
                    ref_from = None
                    ref_to = None
                    ref_pv_formatted = ""

                    if refutation_move and board.is_legal(refutation_move):
                        ref_san = board.san(refutation_move)
                        ref_from = chess.square_name(refutation_move.from_square)
                        ref_to = chess.square_name(refutation_move.to_square)
                        if refutation_pv:
                            ref_pv_formatted = self._format_pv(board, refutation_pv)

                    move_data = {
                        "move_number": move_number,
                        "ply": ply,
                        "move": san_move,
                        "player": player,
                        "is_white": is_white_move,
                        "quality": ui_quality,
                        "detailed_quality": detailed_quality,
                        "evaluation": format_score(played_score, chess.WHITE),
                        "score_cp": pov_score_to_cp(played_score, turn_color),
                        "win_probability": round(wp_played, 3),
                        "win_prob_loss": round(wp_loss, 3),
                        "tags": tags,
                        "notation": current_move_line,
                        "analysis": {
                            "best_move": best_san,
                            "explanation": explanation,
                            "best_evaluation": format_score(best_score, chess.WHITE),
                            "principal_variation": best_pv_formatted,
                            "tags": tags,
                            "refutation": ref_san,
                            "refutation_variation": ref_pv_formatted,
                            "refutation_from": ref_from,
                            "refutation_to": ref_to,
                            "threats_created": threats_created
                        }
                    }

                    analysis_data["moves"].append(move_data)

                except Exception as e:
                    error_msg = f"Error analyzing move {ply + 1}: {str(e)}"
                    analysis_data["errors"].append(error_msg)
                    continue

        except FileNotFoundError:
            analysis_data["errors"].append(f"PGN file '{pgn_file_path}' not found")
        except Exception as e:
            analysis_data["errors"].append(f"Analysis failed: {str(e)}")

        return analysis_data