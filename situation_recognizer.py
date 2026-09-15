"""
situation_recognizer.py - Tactical and positional pattern recognition for Chess Doctor.
"""

from typing import List, Dict, Optional, Tuple, Set, Any
import chess

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 100
}

PIECE_NAMES = {
    chess.PAWN: "pawn",
    chess.KNIGHT: "knight",
    chess.BISHOP: "bishop",
    chess.ROOK: "rook",
    chess.QUEEN: "queen",
    chess.KING: "king"
}


class SituationRecognizer:
    """Detects tactical motifs, positional advantages, and blunder causes."""

    @staticmethod
    def get_piece_name(board: chess.Board, square: chess.Square) -> str:
        piece = board.piece_at(square)
        return PIECE_NAMES.get(piece.piece_type, "piece") if piece else "piece"

    # -------------------------------------------------------------------------
    # Tactical Motifs
    # -------------------------------------------------------------------------

    @classmethod
    def detect_threats_created(
        cls,
        board_after: chess.Board,
        move: chess.Move
    ) -> List[Dict[str, Any]]:
        """
        Detect direct attacks and threats created by the moved piece against enemy targets.
        Returns a list of threat dictionaries with coordinate, target piece, and status.
        """
        piece = board_after.piece_at(move.to_square)
        if not piece:
            return []

        color = piece.color
        opp_color = not color
        threats = []

        attacked_squares = board_after.attacks(move.to_square)
        attacker_val = PIECE_VALUES.get(piece.piece_type, 1)

        for sq in attacked_squares:
            target = board_after.piece_at(sq)
            if not target or target.color != opp_color:
                continue

            target_val = PIECE_VALUES.get(target.piece_type, 1)
            is_defended = board_after.is_attacked_by(opp_color, sq)
            target_name = PIECE_NAMES.get(target.piece_type, "piece")

            if target.piece_type == chess.KING:
                threats.append({
                    "from": chess.square_name(move.to_square),
                    "to": chess.square_name(sq),
                    "target": target_name,
                    "is_check": True,
                    "is_undefended": True,
                    "description": "checks the enemy King"
                })
            elif not is_defended:
                threats.append({
                    "from": chess.square_name(move.to_square),
                    "to": chess.square_name(sq),
                    "target": target_name,
                    "is_check": False,
                    "is_undefended": True,
                    "description": f"attacks undefended {target_name} on {chess.square_name(sq)}"
                })
            elif target_val >= attacker_val:
                threats.append({
                    "from": chess.square_name(move.to_square),
                    "to": chess.square_name(sq),
                    "target": target_name,
                    "is_check": False,
                    "is_defended": True,
                    "description": f"attacks the {target_name} on {chess.square_name(sq)}"
                })

        return threats

    @classmethod
    def detect_fork(cls, board_after: chess.Board, move: chess.Move) -> Optional[Dict[str, Any]]:
        """
        Detect if the move creates a fork / double attack.
        A fork occurs when the moved piece attacks >= 2 enemy pieces that are:
        - King (check)
        - Undefended
        - Higher value than the attacker
        """
        piece = board_after.piece_at(move.to_square)
        if not piece:
            return None
        attacker_val = PIECE_VALUES.get(piece.piece_type, 0)
        color = piece.color
        opp_color = not color

        attacked_squares = board_after.attacks(move.to_square)
        valuable_targets = []

        for sq in attacked_squares:
            target = board_after.piece_at(sq)
            if not target or target.color != opp_color:
                continue

            target_val = PIECE_VALUES.get(target.piece_type, 0)
            is_defended = board_after.is_attacked_by(opp_color, sq)

            # Target is king (check), undefended, or higher value
            if target.piece_type == chess.KING or not is_defended or target_val > attacker_val:
                valuable_targets.append({
                    "square": chess.square_name(sq),
                    "piece_type": target.piece_type,
                    "name": PIECE_NAMES.get(target.piece_type, "piece")
                })

        if len(valuable_targets) >= 2:
            names = [t["name"] for t in valuable_targets[:2]]
            return {
                "type": "fork",
                "attacker": PIECE_NAMES.get(piece.piece_type, "piece"),
                "targets": names,
                "description": f"forking the {names[0]} and {names[1]}"
            }
        return None

    @classmethod
    def detect_pin(cls, board_after: chess.Board, move: chess.Move) -> Optional[Dict[str, Any]]:
        """
        Detect if the move creates an absolute or relative pin on an enemy piece.
        """
        piece = board_after.piece_at(move.to_square)
        if not piece or piece.piece_type not in [chess.BISHOP, chess.ROOK, chess.QUEEN]:
            return None

        color = piece.color
        opp_color = not color

        opp_king = board_after.king(opp_color)
        if opp_king is None:
            return None

        # Direct python-chess check for pinned pieces
        pinned_pieces = []
        between_bb = chess.between(move.to_square, opp_king)
        ray_squares = chess.SquareSet(between_bb)

        for sq in chess.SQUARES:
            target = board_after.piece_at(sq)
            if target and target.color == opp_color and target.piece_type != chess.KING:
                if board_after.is_pinned(opp_color, sq):
                    # Check if our moved piece is the one creating the pin
                    if sq in ray_squares or sq == move.to_square:
                        pinned_pieces.append(PIECE_NAMES.get(target.piece_type, "piece"))

        if pinned_pieces:
            return {
                "type": "pin",
                "pinned": pinned_pieces[0],
                "description": f"pinning the enemy {pinned_pieces[0]} to the King"
            }
        return None

    @classmethod
    def detect_hanging_piece_blunder(
        cls,
        board_before: chess.Board,
        board_after: chess.Board,
        played_move: chess.Move
    ) -> Optional[Dict[str, Any]]:
        """
        Detect if the played move hung a piece:
        1. Put moved piece on an attacked square without sufficient defense.
        2. Moved a defender away, leaving another piece hanging.
        """
        color = board_before.turn
        opp_color = not color
        moved_piece = board_before.piece_at(played_move.from_square)
        if not moved_piece:
            return None

        # 1. Did the moved piece land on an undefended/attacked square?
        to_sq = played_move.to_square
        is_attacked = board_after.is_attacked_by(opp_color, to_sq)
        is_defended = board_after.is_attacked_by(color, to_sq)

        # Check if attackers > defenders or piece is captured by lower value
        attackers = list(board_after.attackers(opp_color, to_sq))
        if attackers:
            min_attacker_val = min(
                PIECE_VALUES.get(board_after.piece_at(a).piece_type, 0)
                for a in attackers if board_after.piece_at(a)
            )
            moved_val = PIECE_VALUES.get(moved_piece.piece_type, 0)

            # Completely undefended under attack, or attacked by cheaper piece (e.g. pawn attacks queen)
            if (not is_defended) or (min_attacker_val < moved_val):
                return {
                    "type": "hanging_piece",
                    "piece": PIECE_NAMES.get(moved_piece.piece_type, "piece"),
                    "square": chess.square_name(to_sq),
                    "description": f"leaves the {PIECE_NAMES.get(moved_piece.piece_type, 'piece')} hanging on {chess.square_name(to_sq)}"
                }

        # 2. Did moving this piece leave ANOTHER friendly piece hanging?
        for sq in chess.SQUARES:
            if sq == to_sq:
                continue
            p = board_after.piece_at(sq)
            if p and p.color == color and p.piece_type != chess.KING:
                # Was it attacked before?
                attacked_now = board_after.is_attacked_by(opp_color, sq)
                defended_now = board_after.is_attacked_by(color, sq)
                attacked_before = board_before.is_attacked_by(opp_color, sq)
                defended_before = board_before.is_attacked_by(color, sq)

                # If it was defended before, but now undefended and under attack
                if attacked_now and not defended_now and defended_before:
                    return {
                        "type": "removed_defender",
                        "piece": PIECE_NAMES.get(p.piece_type, "piece"),
                        "square": chess.square_name(sq),
                        "description": f"removes the defense of the {PIECE_NAMES.get(p.piece_type, 'piece')} on {chess.square_name(sq)}"
                    }

        return None

    @classmethod
    def detect_skewer(cls, board_after: chess.Board, move: chess.Move) -> Optional[Dict[str, Any]]:
        """Detect if the moved piece skewers a higher-value piece into a piece behind it."""
        piece = board_after.piece_at(move.to_square)
        if not piece or piece.piece_type not in [chess.BISHOP, chess.ROOK, chess.QUEEN]:
            return None

        color = piece.color
        opp_color = not color

        for target_sq in board_after.attacks(move.to_square):
            target = board_after.piece_at(target_sq)
            if not target or target.color != opp_color:
                continue

            # Target must be valuable (King or Queen)
            if target.piece_type in [chess.KING, chess.QUEEN]:
                # Look for an enemy piece behind target along the same line
                for sq in chess.SQUARES:
                    if sq != target_sq and sq != move.to_square:
                        if chess.square_distance(move.to_square, sq) > chess.square_distance(move.to_square, target_sq):
                            between_bb = chess.between(move.to_square, sq)
                            if target_sq in chess.SquareSet(between_bb):
                                behind = board_after.piece_at(sq)
                                if behind and behind.color == opp_color and behind.piece_type != chess.PAWN:
                                    return {
                                        "type": "skewer",
                                        "front": PIECE_NAMES.get(target.piece_type, "piece"),
                                        "behind": PIECE_NAMES.get(behind.piece_type, "piece"),
                                        "description": f"skewering the {PIECE_NAMES.get(target.piece_type, 'piece')} and the {PIECE_NAMES.get(behind.piece_type, 'piece')}"
                                    }
        return None

    @classmethod
    def detect_discovered_attack(
        cls,
        board_before: chess.Board,
        board_after: chess.Board,
        move: chess.Move
    ) -> Optional[Dict[str, Any]]:
        """Detect if moving this piece revealed a discovered attack/check from a friendly piece."""
        color = board_before.turn
        opp_color = not color

        # Check sliding pieces of player
        for sq in chess.SQUARES:
            p = board_before.piece_at(sq)
            if not p or p.color != color or p.piece_type not in [chess.BISHOP, chess.ROOK, chess.QUEEN]:
                continue
            if sq == move.from_square:
                continue

            attacks_before = board_before.attacks(sq)
            attacks_after = board_after.attacks(sq)

            new_attacks = attacks_after - attacks_before
            for target_sq in new_attacks:
                target = board_after.piece_at(target_sq)
                if target and target.color == opp_color and target.piece_type != chess.PAWN:
                    if target.piece_type == chess.KING:
                        return {
                            "type": "discovered_check",
                            "description": "delivering a discovered check"
                        }
                    else:
                        return {
                            "type": "discovered_attack",
                            "target": PIECE_NAMES.get(target.piece_type, "piece"),
                            "description": f"unleashing a discovered attack on the enemy {PIECE_NAMES.get(target.piece_type, 'piece')}"
                        }
        return None

    # -------------------------------------------------------------------------
    # Positional & Strategic Motifs
    # -------------------------------------------------------------------------

    @classmethod
    def is_true_outpost(cls, board: chess.Board, square: chess.Square, color: chess.Color) -> bool:
        """
        Check if square is a true outpost:
        1. On ranks 4-6 for White, or ranks 3-5 for Black.
        2. Defended by friendly pawn.
        3. Cannot be attacked by enemy pawns on adjacent files (enemy pawns have passed or are captured).
        """
        rank = chess.square_rank(square)
        file = chess.square_file(square)

        if color == chess.WHITE:
            if rank not in [3, 4, 5]:  # 4th, 5th, 6th rank
                return False
        else:
            if rank not in [2, 3, 4]:  # 3rd, 4th, 5th rank
                return False

        # 1. Defended by a friendly pawn?
        friendly_defenders = board.attackers(color, square)
        pawn_defended = any(
            board.piece_at(sq) and board.piece_at(sq).piece_type == chess.PAWN
            for sq in friendly_defenders
        )
        if not pawn_defended:
            return False

        # 2. Can enemy pawns on adjacent files ever attack this square?
        opp_color = not color
        adjacent_files = [f for f in [file - 1, file + 1] if 0 <= f <= 7]

        for adj_file in adjacent_files:
            for r in range(8):
                sq = chess.square(adj_file, r)
                p = board.piece_at(sq)
                if p and p.piece_type == chess.PAWN and p.color == opp_color:
                    # For white, an enemy pawn on rank > square rank can advance down to attack
                    if color == chess.WHITE and r > rank:
                        return False
                    # For black, an enemy pawn on rank < square rank can advance up to attack
                    if color == chess.BLACK and r < rank:
                        return False

        return True

    @classmethod
    def detect_file_control(cls, board_before: chess.Board, move: chess.Move) -> Optional[str]:
        """
        Detect if the move places a Rook on an open or semi-open file, or on the 7th rank.
        Note: board_before has the piece on move.from_square.
        """
        piece = board_before.piece_at(move.from_square)
        if not piece or piece.piece_type not in [chess.ROOK, chess.QUEEN]:
            return None

        color = piece.color
        opp_color = not color
        to_sq = move.to_square
        file = chess.square_file(to_sq)
        rank = chess.square_rank(to_sq)

        # Check 7th rank (2nd rank for Black)
        if piece.piece_type == chess.ROOK:
            if (color == chess.WHITE and rank == 6) or (color == chess.BLACK and rank == 1):
                return "placing the rook on the 7th rank"

        # Check pawns on the file
        friendly_pawns = 0
        opp_pawns = 0
        for r in range(8):
            sq = chess.square(file, r)
            p = board_before.piece_at(sq)
            if p and p.piece_type == chess.PAWN:
                if p.color == color:
                    friendly_pawns += 1
                else:
                    opp_pawns += 1

        if friendly_pawns == 0 and opp_pawns == 0:
            return "taking control of the open file"
        elif friendly_pawns == 0 and opp_pawns > 0:
            return "controlling the semi-open file"

        return None

    @classmethod
    def detect_passed_pawn(cls, board_after: chess.Board, move: chess.Move) -> bool:
        """Check if the move creates or advances a passed pawn."""
        piece = board_after.piece_at(move.to_square)
        if not piece or piece.piece_type != chess.PAWN:
            return False

        color = piece.color
        opp_color = not color
        file = chess.square_file(move.to_square)
        rank = chess.square_rank(move.to_square)

        files_to_check = [f for f in [file - 1, file, file + 1] if 0 <= f <= 7]

        for f in files_to_check:
            for r in range(8):
                if color == chess.WHITE and r > rank:
                    p = board_after.piece_at(chess.square(f, r))
                    if p and p.piece_type == chess.PAWN and p.color == opp_color:
                        return False
                elif color == chess.BLACK and r < rank:
                    p = board_after.piece_at(chess.square(f, r))
                    if p and p.piece_type == chess.PAWN and p.color == opp_color:
                        return False
        return True

    @classmethod
    def detect_king_safety_flaw(
        cls,
        board_before: chess.Board,
        board_after: chess.Board,
        move: chess.Move
    ) -> Optional[str]:
        """Detect if the move weakened the castled king's pawn shelter or lost castling rights."""
        color = board_before.turn
        piece = board_before.piece_at(move.from_square)
        if not piece:
            return None

        # Lost castling rights unnecessarily without castling
        if piece.piece_type == chess.KING and not board_before.is_castling(move):
            if board_before.has_castling_rights(color):
                return "forfeiting castling rights and leaving the king in the center"

        # Moving f/g/h pawns in front of a castled king
        if piece.piece_type == chess.PAWN:
            king_sq = board_after.king(color)
            if king_sq is not None:
                # Is king castled on kingside (g1/g8) or queenside (c1/c8)?
                king_file = chess.square_file(king_sq)
                move_file = chess.square_file(move.from_square)
                if abs(king_file - move_file) <= 1:
                    # Pawn was right in front of king
                    if (color == chess.WHITE and king_sq in [chess.G1, chess.H1, chess.C1, chess.B1]) or \
                       (color == chess.BLACK and king_sq in [chess.G8, chess.H8, chess.C8, chess.B8]):
                        return "weakening the defensive pawn shield around your King"

        return None

    # -------------------------------------------------------------------------
    # Comprehensive Cause-and-Effect Explainer
    # -------------------------------------------------------------------------

    @classmethod
    def explain_blunder_or_mistake(
        cls,
        board_before: chess.Board,
        board_after: chess.Board,
        played_move: chess.Move,
        best_move: chess.Move,
        refutation_move: Optional[chess.Move] = None,
        refutation_pv: Optional[List[chess.Move]] = None
    ) -> Tuple[str, List[str]]:
        """
        Generate a clear, dual-sided explanation:
        1. Why played_move was bad (what it walked into or hung).
        2. What the opponent threatens / played (refutation).
        3. Why best_move was the right solution.

        Returns:
            (explanation_string, list_of_tactical_and_positional_tags)
        """
        color = board_before.turn
        color_name = "White" if color == chess.WHITE else "Black"
        opp_name = "Black" if color == chess.WHITE else "White"

        san_played = board_before.san(played_move)
        san_best = board_before.san(best_move)

        tags = []
        blunder_reason = None

        # Check 1: Hanging piece
        hanging = cls.detect_hanging_piece_blunder(board_before, board_after, played_move)
        if hanging:
            tags.append("Hanging Piece")
            blunder_reason = hanging["description"]

        # Check 2: King safety flaw
        if not blunder_reason:
            ks = cls.detect_king_safety_flaw(board_before, board_after, played_move)
            if ks:
                tags.append("King Safety")
                blunder_reason = ks

        # Check 3: Opponent's refutation move
        refutation_effect = None
        if refutation_move and board_after.is_legal(refutation_move):
            san_ref = board_after.san(refutation_move)
            board_after_ref = board_after.copy()
            board_after_ref.push(refutation_move)

            # Check if refutation delivers checkmate
            if board_after_ref.is_checkmate():
                tags.append("Checkmate")
                refutation_effect = f"allows {san_ref}# delivering checkmate"

            # Check if refutation forks
            if not refutation_effect:
                fork = cls.detect_fork(board_after_ref, refutation_move)
                if fork:
                    tags.append("Fork")
                    refutation_effect = f"allows {san_ref} {fork['description']}"

            # Check if refutation pins
            if not refutation_effect:
                pin = cls.detect_pin(board_after_ref, refutation_move)
                if pin:
                    tags.append("Pin")
                    refutation_effect = f"allows {san_ref} {pin['description']}"

            # Check if refutation captures the moved piece
            if not refutation_effect and refutation_move.to_square == played_move.to_square:
                captured = PIECE_NAMES.get(board_before.piece_at(played_move.from_square).piece_type, "piece")
                refutation_effect = f"allows {san_ref} capturing your {captured}"

            # Default refutation mention
            if not refutation_effect:
                refutation_effect = f"gives {opp_name} the initiative with {san_ref}"

        # Check 4: Best move strengths
        board_after_best = board_before.copy()
        board_after_best.push(best_move)
        best_reason = None

        # Tactical strength in best move?
        best_fork = cls.detect_fork(board_after_best, best_move)
        if best_fork:
            tags.append("Tactical Fork")
            best_reason = f"delivers a {best_fork['description']}"

        if not best_reason and board_before.is_capture(best_move):
            captured_piece = cls.get_piece_name(board_before, best_move.to_square)
            best_reason = f"captures the {captured_piece}"

        if not best_reason:
            file_ctrl = cls.detect_file_control(board_before, best_move)
            if file_ctrl:
                tags.append("File Control")
                best_reason = file_ctrl

        if not best_reason:
            if cls.is_true_outpost(board_after_best, best_move.to_square, color):
                tags.append("Outpost")
                best_reason = "places your knight on a powerful outpost"

        if not best_reason and cls.detect_passed_pawn(board_after_best, best_move):
            tags.append("Passed Pawn")
            best_reason = "creates a dangerous passed pawn"

        if not best_reason:
            best_reason = "maintains optimal piece activity and board control"

        # Assemble full explanation
        parts = []
        if blunder_reason and refutation_effect:
            parts.append(f"{san_played} {blunder_reason} and {refutation_effect}.")
        elif blunder_reason:
            parts.append(f"{san_played} {blunder_reason}.")
        elif refutation_effect:
            parts.append(f"{san_played} {refutation_effect}.")
        else:
            parts.append(f"{san_played} concedes the advantage to {opp_name}.")

        parts.append(f"{san_best} was better because it {best_reason}.")

        return " ".join(parts), list(set(tags))

    @classmethod
    def explain_good_move(
        cls,
        board_before: chess.Board,
        move: chess.Move,
        is_best: bool = False
    ) -> Tuple[str, List[str]]:
        """Explain the positive tactical or positional merits of a good move."""
        color = board_before.turn
        san = board_before.san(move)
        board_after = board_before.copy()
        board_after.push(move)

        tags = []
        reasons = []

        if board_after.is_checkmate():
            tags.append("Checkmate")
            return f"Checkmate! {san} delivers mate and finishes the game.", tags

        if "+" in san:
            tags.append("Check")
            reasons.append("gives a forcing check")

        if board_before.is_capture(move):
            captured = cls.get_piece_name(board_before, move.to_square)
            reasons.append(f"captures the {captured}")

        fork = cls.detect_fork(board_after, move)
        if fork:
            tags.append("Fork")
            reasons.append(fork["description"])

        file_ctrl = cls.detect_file_control(board_before, move)
        if file_ctrl:
            tags.append("File Control")
            reasons.append(file_ctrl)

        if cls.is_true_outpost(board_after, move.to_square, color):
            tags.append("Outpost")
            reasons.append("anchors a strong outpost")

        if cls.detect_passed_pawn(board_after, move):
            tags.append("Passed Pawn")
            reasons.append("advances a passed pawn toward promotion")

        if board_before.is_castling(move):
            tags.append("Castling")
            reasons.append("safeguards the king and activates the rook")

        p = board_before.piece_at(move.from_square)
        if p and p.piece_type in [chess.KNIGHT, chess.BISHOP]:
            home_rank = 0 if color == chess.WHITE else 7
            if chess.square_rank(move.from_square) == home_rank:
                tags.append("Development")
                reasons.append(f"develops the {PIECE_NAMES[p.piece_type]} to an active square")

        prefix = "Best move! " if is_best else "Strong move. "
        if reasons:
            return f"{prefix}{san} {', and '.join(reasons)}.", tags
        return f"{prefix}{san} maintains a solid position and harmonious coordination.", tags
