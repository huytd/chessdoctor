import chess
import chess.pgn
import chess.engine
import os
import sys

class ChessDoctor:
    def __init__(self, stockfish_path=None):
        """Initialize the chess analyzer with Stockfish engine."""
        # Try to find Stockfish in common locations if not provided
        if not stockfish_path:
            stockfish_path = self._find_stockfish()
        
        if not stockfish_path or not os.path.exists(stockfish_path):
            print(f"Error: Stockfish engine not found at {stockfish_path}")
            print("Please install Stockfish and provide the path using --engine option")
            sys.exit(1)
            
        self.engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        
        # Configure analysis settings
        self.depth = 18
        self.time_limit = 0.5  # seconds per position
        
        # Thresholds for classifying moves (in centipawns)
        self.blunder_threshold = -300  # -3 pawns or worse
        self.mistake_threshold = -100  # -1 pawn or worse
        self.inaccuracy_threshold = -50  # -0.5 pawn or worse
        
        # For full analysis, we need a deeper search
        self.deep_analysis_depth = 30
        self.deep_analysis_time = 2.0  # seconds per position for deep analysis
    
    def _find_stockfish(self):
        """Attempt to locate Stockfish executable in common locations."""
        common_locations = [
            "stockfish",  # If it's in PATH
            "/usr/local/bin/stockfish",
            "/usr/bin/stockfish",
            "/opt/homebrew/bin/stockfish",
            "C:/Program Files/Stockfish/stockfish.exe",
            "/opt/local/bin/stockfish",  # MacPorts
            os.path.expanduser("~/stockfish"),
            os.path.expanduser("~/.local/bin/stockfish"),
            # Additional common locations
            "/usr/games/stockfish",
            "C:/Program Files (x86)/Stockfish/stockfish.exe",
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "stockfish")  # Same directory as script
        ]
        
        # Try using 'which' or 'where' command to find stockfish
        try:
            # On Unix-like systems
            if sys.platform != "win32":
                import subprocess
                result = subprocess.run(["which", "stockfish"], 
                                       stdout=subprocess.PIPE, 
                                       stderr=subprocess.PIPE,
                                       text=True)
                if result.returncode == 0:
                    path = result.stdout.strip()
                    if path and os.path.exists(path):
                        return path
            else:
                # On Windows
                result = subprocess.run(["where", "stockfish"], 
                                       stdout=subprocess.PIPE, 
                                       stderr=subprocess.PIPE,
                                       text=True)
                if result.returncode == 0:
                    path = result.stdout.strip().split('\n')[0]  # Take first result
                    if path and os.path.exists(path):
                        return path
        except Exception:
            # If 'which' or 'where' fails, continue with the common locations
            pass
        
        for location in common_locations:
            try:
                # Check if we can start the engine
                engine = chess.engine.SimpleEngine.popen_uci(location)
                engine.quit()
                print(f"Found Stockfish at: {location}")
                return location
            except (chess.engine.EngineTerminatedError, FileNotFoundError):
                continue
                
        return None
    
    def _get_principal_variation(self, board, pv_moves, max_depth=4):
        """
        Extract and format the principal variation (expected line of play).
        
        Args:
            board: The chess board position
            pv_moves: List of moves in the principal variation
            max_depth: Maximum number of moves to include in the line
            
        Returns:
            A formatted string representing the expected line of play
        """
        if not pv_moves:
            return ""
            
        # Create a copy of the board to avoid modifying the original
        board_copy = board.copy()
        
        # Format the principal variation
        pv_line = []
        move_number = board_copy.fullmove_number
        is_white_to_move = board_copy.turn == chess.WHITE
        
        # Limit the depth of the line
        pv_moves = pv_moves[:max_depth]
        
        for i, move in enumerate(pv_moves):
            try:
                # Format move with proper numbering
                if is_white_to_move or i == 0:
                    # Start a new move pair with number for white's move or first move in line
                    san_move = board_copy.san(move)
                    if is_white_to_move:
                        pv_line.append(f"{move_number}.{san_move}")
                    else:
                        pv_line.append(f"{move_number}...{san_move}")
                else:
                    # Just add black's move without number
                    san_move = board_copy.san(move)
                    pv_line.append(san_move)
                
                # Make the move on our copy board
                board_copy.push(move)
                
                # Update move number and turn
                is_white_to_move = board_copy.turn == chess.WHITE
                if is_white_to_move:
                    move_number += 1
                    
            except Exception as e:
                # If there's an error with this move, stop adding to the line
                break
                
        # Join the formatted moves
        return " ".join(pv_line)
    
    def _get_best_move_and_explanation(self, board, played_move=None):
        """Get the best move and explanation for the current position."""
        try:
            # Get a deeper analysis for important positions
            result = self.engine.analyse(
                board, 
                chess.engine.Limit(depth=self.deep_analysis_depth, time=self.deep_analysis_time),
                multipv=3  # Get top 3 best moves
            )
            
            best_moves = []
            best_pv_lines = []
            
            for pv_info in result:
                move = pv_info["pv"][0]
                score = pv_info["score"].white()
                best_moves.append((move, score))
                
                # Store the principal variation for each candidate move
                if "pv" in pv_info and len(pv_info["pv"]) > 0:
                    pv_line = self._get_principal_variation(board, pv_info["pv"])
                    best_pv_lines.append(pv_line)
                else:
                    best_pv_lines.append("")
            
            # If no played move is provided, just return the best move
            if not played_move:
                return best_moves[0][0], best_moves
                
            # Check if played move is in top 3
            is_played_move_top = any(played_move == move for move, _ in best_moves)
            played_move_index = None
            for i, (move, _) in enumerate(best_moves):
                if played_move == move:
                    played_move_index = i
                    break
            
            # Best move is the first one
            best_move, best_score = best_moves[0]
            best_pv = best_pv_lines[0] if best_pv_lines else ""
            
            # Prepare explanation
            san_best = board.san(best_move)
            san_played = board.san(played_move)
            
            # First, get the position after the played move
            board_after_played = board.copy()
            board_after_played.push(played_move)
            played_position_score = self._get_position_evaluation(board_after_played)
            
            # Then, get the position after the best move
            board_after_best = board.copy()
            board_after_best.push(best_move)
            best_position_score = self._get_position_evaluation(board_after_best)
            
            # Calculate the difference
            is_white_to_move = board.turn == chess.WHITE
            if is_white_to_move:
                # From white's perspective
                score_diff = played_position_score.white().score() - best_position_score.white().score()
            else:
                # From black's perspective
                score_diff = best_position_score.white().score() - played_position_score.white().score()
            
            # Build explanation based on the context
            if is_played_move_top:
                if played_move_index == 0:
                    # It's the absolute best move
                    explanation = self._analyze_best_move_strength(board, played_move)
                else:
                    # It's among the top moves but not the absolute best
                    explanation = self._analyze_good_alternative(board, played_move, best_move, best_score, played_position_score)
            else:
                # Get tactical themes based on position and score difference
                missed_opportunities = []
                
                # Check for piece hanging or capture missed
                try:
                    if abs(score_diff) >= 100:  # 1 pawn or more
                        # Correct way to check for legal captures in python-chess
                        has_captures = any(board.is_capture(move) for move in board.legal_moves)
                        if has_captures and not board.is_capture(played_move):
                            missed_opportunities.append("a capture opportunity")
                            
                        # Check if best move is a capture
                        if board.is_capture(best_move):
                            missed_opportunities.append("material gain")
                except Exception:
                    pass
                
                # Check for tactical themes
                try:
                    if "+" in san_best:
                        missed_opportunities.append("a check")
                except Exception:
                    pass
                
                # Generate explanation based on themes
                if missed_opportunities:
                    if len(missed_opportunities) == 1:
                        explanation = f"{san_played} missed {missed_opportunities[0]}. {san_best} would be better."
                    else:
                        opportunities_text = " and ".join(missed_opportunities)
                        explanation = f"{san_played} missed {opportunities_text}. {san_best} would be better."
                else:
                    # Enhanced positional analysis when no tactical themes are found
                    try:
                        positional_factors = self._analyze_positional_differences(board, played_move, best_move)
                        
                        if positional_factors:
                            explanation = f"{san_best} is better than {san_played} because it {positional_factors}."
                        else:
                            # Still fallback to generic if no specifics found
                            explanation = f"{san_best} would give better position control than {san_played}."
                    except Exception:
                        # Fallback to generic explanation if positional analysis fails
                        explanation = f"{san_best} would give better position control than {san_played}."
            
            return best_move, best_moves, explanation, best_pv
            
        except Exception as e:
            # Return a very basic explanation if everything fails
            if played_move and board:
                try:
                    # Try to get the best move directly from Stockfish with minimal analysis
                    result = self.engine.play(board, chess.engine.Limit(depth=10, time=0.1))
                    best_move = result.move
                    
                    if best_move:
                        san_best = board.san(best_move)
                        san_played = board.san(played_move)
                        return best_move, [], f"{san_best} would be a better move than {san_played}.", ""
                    
                except Exception:
                    pass
            
            # If all else fails
            raise Exception(f"Unable to analyze position: {str(e)}")
    
    def _analyze_best_move_strength(self, board, move):
        """Analyze why a move is the absolute best move."""
        try:
            san_move = board.san(move)
            
            # Look for tactical or positional themes
            board_after = board.copy()
            board_after.push(move)
            
            # Get a longer line to see what this move enables
            pv_line = []
            try:
                result = self.engine.analyse(
                    board_after, 
                    chess.engine.Limit(depth=18, time=0.3),
                    multipv=1
                )
                if result and len(result) > 0 and "pv" in result[0]:
                    pv_line = result[0]["pv"]
            except Exception:
                pass
            
            # Check for special tactical patterns
            if "+" in san_move:
                return f"Excellent! {san_move} is the best move, giving a powerful check that limits opponent's options."
                
            if board.is_capture(move):
                captured_piece = self._get_captured_piece_name(board, move)
                if captured_piece:
                    return f"Perfect! {san_move} is the strongest move, capturing the {captured_piece} with clear advantage."
                else:
                    return f"Perfect! {san_move} is the strongest move, with a tactically sound capture."
            
            # Look at the next moves in the line
            if pv_line and len(pv_line) >= 2:
                next_move = pv_line[0]
                if board_after.is_capture(next_move):
                    return f"Excellent! {san_move} is the best move, setting up a strong capture on the next move."
                
                if "+" in board_after.san(next_move):
                    return f"Perfect! {san_move} is the best move, preparing a strong check on the next move."
            
            # If no clear tactical pattern, analyze the position
            position_strength = self._analyze_positional_strengths(board, move)
            if position_strength:
                return f"Perfect choice! {san_move} is the best move, {position_strength}."
            
            # Generic fallback for best move
            return f"Excellent! {san_move} is the best move, giving you the strongest position."
            
        except Exception as e:
            # Fallback
            return f"Excellent! This is the strongest move in the position."
    
    def _analyze_good_alternative(self, board, played_move, best_move, best_score, played_score):
        """Analyze a move that's good but not the absolute best."""
        try:
            san_played = board.san(played_move)
            san_best = board.san(best_move)
            
            # Calculate how close this move is to the best move
            # For score comparison, we need to get the score values, not the PovScore objects
            try:
                played_cp = played_score.white().score()
                best_cp = best_score.score()
                
                # If the scores are very close (within 0.2 pawns)
                if abs(played_cp - best_cp) < 20:
                    # Practically equal
                    position_strengths = self._analyze_positional_strengths(board, played_move)
                    if position_strengths:
                        return f"Very good! {san_played} is almost as strong as the top engine choice ({san_best}), {position_strengths}."
                    return f"Very good! {san_played} is practically equal to the top engine choice ({san_best})."
                
                # If the scores are close (within 0.5 pawns)
                elif abs(played_cp - best_cp) < 50:
                    position_strengths = self._analyze_positional_strengths(board, played_move)
                    if position_strengths:
                        return f"{san_played} is a strong alternative to {san_best}, {position_strengths}."
                    return f"{san_played} is a strong alternative to the top engine choice ({san_best})."
            except Exception:
                pass
            
            # If we can't compare scores or they're not very close, do a positional comparison
            board_after_played = board.copy()
            board_after_played.push(played_move)
            
            position_strengths = self._analyze_positional_strengths(board, played_move)
            if position_strengths:
                return f"{san_played} is among the top choices, {position_strengths}."
            
            # Check if it's a similar type of move to the best move
            if self._is_similar_move_type(board, played_move, best_move):
                return f"{san_played} follows a similar plan to the top engine choice ({san_best})."
            
            # Generic fallback
            return f"{san_played} is among the top choices in this position."
            
        except Exception as e:
            # Fallback
            return f"This is among the strongest options in this position."
    
    def _get_captured_piece_name(self, board, move):
        """Get the name of the piece being captured, if any."""
        if not board.is_capture(move):
            return None
            
        to_square = move.to_square
        piece = board.piece_at(to_square)
        
        # For en passant, the piece won't be on the to_square
        if not piece and board.is_en_passant(move):
            return "pawn"
        
        if not piece:
            return None
            
        piece_names = {
            chess.PAWN: "pawn",
            chess.KNIGHT: "knight",
            chess.BISHOP: "bishop",
            chess.ROOK: "rook",
            chess.QUEEN: "queen",
            chess.KING: "king"  # Unlikely, but for completeness
        }
        
        return piece_names.get(piece.piece_type)
    
    def _analyze_positional_strengths(self, board, move):
        """Analyze the positional strengths of a move."""
        try:
            # Use our existing analysis, but only return the explanation, not update factors
            factors = []
            
            board_after = board.copy()
            board_after.push(move)
            
            # Get piece types
            piece = board.piece_at(move.from_square)
            if not piece:
                return None
            
            player_color = board.turn
            
            # Check common positional strengths based on piece type
            if piece.piece_type == chess.PAWN:
                # Check for pawn advances
                if player_color == chess.WHITE and chess.square_rank(move.to_square) >= 5:
                    factors.append("advancing a pawn toward promotion")
                elif player_color == chess.BLACK and chess.square_rank(move.to_square) <= 2:
                    factors.append("advancing a pawn toward promotion")
                    
                # Check for center control with pawns
                if move.to_square in [chess.parse_square(s) for s in ["d4", "e4", "d5", "e5"]]:
                    factors.append("controlling the center with a pawn")
            
            elif piece.piece_type == chess.KNIGHT:
                # Check for knight outposts
                if self._is_outpost(board_after, move.to_square, player_color):
                    factors.append("placing your knight on a strong outpost")
                    
                # Check for knight fork potential
                attack_count = 0
                for square in range(64):
                    target_piece = board_after.piece_at(square)
                    if target_piece and target_piece.color != player_color:
                        if board_after.is_attacked_by(player_color, square):
                            attack_count += 1
                
                if attack_count >= 2:
                    factors.append("creating knight pressure on multiple pieces")
            
            elif piece.piece_type == chess.BISHOP:
                # Check for bishop on long diagonal
                long_diagonals = [
                    [chess.parse_square(s) for s in ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"]],
                    [chess.parse_square(s) for s in ["a8", "b7", "c6", "d5", "e4", "f3", "g2", "h1"]]
                ]
                
                for diagonal in long_diagonals:
                    if move.to_square in diagonal:
                        factors.append("placing your bishop on a powerful long diagonal")
                        break
                
                # Check for fianchetto
                fianchetto_squares = [
                    chess.parse_square("g2"), chess.parse_square("b2"),
                    chess.parse_square("g7"), chess.parse_square("b7")
                ]
                
                if move.to_square in fianchetto_squares:
                    factors.append("fianchettoing your bishop")
            
            elif piece.piece_type == chess.ROOK:
                # Check for rook on open file
                if self._check_file_control(board_after, move, player_color):
                    factors.append("placing your rook on an open file")
                
                # Check for rook on 7th rank
                if player_color == chess.WHITE and chess.square_rank(move.to_square) == 6:
                    factors.append("placing your rook on the 7th rank")
                elif player_color == chess.BLACK and chess.square_rank(move.to_square) == 1:
                    factors.append("placing your rook on the 7th rank")
            
            elif piece.piece_type == chess.QUEEN:
                # Check for queen activity
                attack_count = 0
                for square in range(64):
                    if board_after.is_attacked_by(player_color, square):
                        attack_count += 1
                
                if attack_count >= 16:
                    factors.append("maximizing your queen's activity")
            
            elif piece.piece_type == chess.KING:
                # Check for castling
                if board.is_castling(move):
                    if chess.square_file(move.to_square) < 4:
                        factors.append("castling queenside for king safety")
                    else:
                        factors.append("castling kingside for king safety")
                
                # Check for king activity in endgame
                if self._is_endgame(board):
                    central_distance = self._distance_to_center(move.to_square)
                    if central_distance <= 2:
                        factors.append("centralizing your king in the endgame")
            
            # If we found factors, format them into a natural explanation
            if factors:
                if len(factors) == 1:
                    return factors[0]
                elif len(factors) == 2:
                    return f"{factors[0]} and {factors[1]}"
                else:
                    return f"{', '.join(factors[:-1])}, and {factors[-1]}"
            
            return None
        except Exception:
            return None
    
    def _is_similar_move_type(self, board, move1, move2):
        """Check if two moves are similar in type (e.g., both captures, both checks)."""
        try:
            # Check if both are captures
            both_captures = board.is_capture(move1) and board.is_capture(move2)
            
            # Check if both are checks
            board_after1 = board.copy()
            board_after1.push(move1)
            is_check1 = board_after1.is_check()
            
            board_after2 = board.copy()
            board_after2.push(move2)
            is_check2 = board_after2.is_check()
            
            both_checks = is_check1 and is_check2
            
            # Check if both are by the same piece type
            piece1 = board.piece_at(move1.from_square)
            piece2 = board.piece_at(move2.from_square)
            same_piece_type = piece1 and piece2 and piece1.piece_type == piece2.piece_type
            
            # Check if both go to a similar area (e.g., both to the center)
            to_square1 = move1.to_square
            to_square2 = move2.to_square
            similar_destination = (abs(chess.square_file(to_square1) - chess.square_file(to_square2)) <= 1 and
                                  abs(chess.square_rank(to_square1) - chess.square_rank(to_square2)) <= 1)
            
            return both_captures or both_checks or (same_piece_type and similar_destination)
        except Exception:
            return False
    
    def _is_endgame(self, board):
        """Determine if the position is likely in the endgame phase."""
        # Simple heuristic: count major pieces
        white_major_pieces = 0
        black_major_pieces = 0
        
        for square in range(64):
            piece = board.piece_at(square)
            if piece:
                if piece.piece_type in [chess.QUEEN, chess.ROOK]:
                    if piece.color == chess.WHITE:
                        white_major_pieces += 1
                    else:
                        black_major_pieces += 1
        
        # Endgame if both sides have 0-1 major pieces
        return white_major_pieces <= 1 and black_major_pieces <= 1
    
    def _distance_to_center(self, square):
        """Calculate the distance of a square from the center of the board."""
        file = chess.square_file(square)
        rank = chess.square_rank(square)
        
        # Distance from file to center (d or e file)
        file_distance = min(abs(file - 3), abs(file - 4))
        
        # Distance from rank to center (4th or 5th rank)
        rank_distance = min(abs(rank - 3), abs(rank - 4))
        
        # Manhattan distance
        return file_distance + rank_distance
    
    def _analyze_positional_differences(self, board, played_move, best_move):
        """Analyze positional differences between played move and best move."""
        try:
            # Create boards for after the played move and after the best move
            board_after_played = board.copy()
            board_after_played.push(played_move)
            
            board_after_best = board.copy()
            board_after_best.push(best_move)
            
            # Get piece counts for both resulting positions
            played_white_pieces = self._count_pieces(board_after_played, chess.WHITE)
            played_black_pieces = self._count_pieces(board_after_played, chess.BLACK)
            best_white_pieces = self._count_pieces(board_after_best, chess.WHITE)
            best_black_pieces = self._count_pieces(board_after_best, chess.BLACK)
            
            factors = []
            
            # Whose perspective are we analyzing from
            player_color = board.turn
            opponent_color = not player_color
            
            # For easier reference
            san_best = board.san(best_move)
            san_played = board.san(played_move)
            
            # Check if the moves are different piece types
            piece_played = board.piece_at(played_move.from_square)
            piece_best = board.piece_at(best_move.from_square)
            
            if piece_played and piece_best and piece_played.piece_type != piece_best.piece_type:
                if piece_best.piece_type > piece_played.piece_type:  # Higher value piece is generally better
                    factors.append(f"uses a stronger piece ({san_best.strip('+')})")
            
            # Look for specific piece placements
            try:
                # Analyze center control (e4, d4, e5, d5)
                # Define center squares using chess.square notation
                e4 = chess.parse_square("e4")
                d4 = chess.parse_square("d4")
                e5 = chess.parse_square("e5")
                d5 = chess.parse_square("d5")
                center_squares = [e4, d4, e5, d5]
                
                played_center_control = self._count_controlled_squares(board_after_played, center_squares, player_color)
                best_center_control = self._count_controlled_squares(board_after_best, center_squares, player_color)
                
                # More sensitive threshold
                if best_center_control > played_center_control:
                    factors.append("provides better control of the center")
                
                # Check if the move goes to a central square
                if best_move.to_square in center_squares and not played_move.to_square in center_squares:
                    factors.append("occupies a central square")
            except Exception:
                pass  # Skip this analysis if it fails
            
            # Analyze piece activity and board control
            try:
                played_activity = self._count_squares_controlled(board_after_played, player_color)
                best_activity = self._count_squares_controlled(board_after_best, player_color)
                
                # More sensitive threshold
                if best_activity > played_activity + 2:
                    factors.append("increases piece activity")
            except Exception:
                pass
            
            # Analyze piece development
            try:
                played_development = self._count_developed_pieces(board_after_played, player_color)
                best_development = self._count_developed_pieces(board_after_best, player_color)
                
                # More sensitive threshold
                if best_development > played_development:
                    factors.append("improves piece development")
                
                # Check if in opening and castling is available
                if self._is_in_opening(board) and not board.is_check():
                    if self._move_helps_castling(board, best_move, player_color) and not self._move_helps_castling(board, played_move, player_color):
                        factors.append("helps prepare for castling")
            except Exception:
                pass  # Skip this analysis if it fails
            
            # Check king safety
            try:
                played_king_safety = self._evaluate_king_safety(board_after_played, player_color)
                best_king_safety = self._evaluate_king_safety(board_after_best, player_color)
                
                # More sensitive threshold
                if best_king_safety > played_king_safety:
                    factors.append("improves king safety")
            except Exception:
                pass  # Skip this analysis if it fails
            
            # Check pawn structure
            try:
                played_pawn_structure = self._evaluate_pawn_structure(board_after_played, player_color)
                best_pawn_structure = self._evaluate_pawn_structure(board_after_best, player_color)
                
                # More sensitive threshold
                if best_pawn_structure > played_pawn_structure:
                    factors.append("creates a better pawn structure")
                
                # Check for pawn advances toward promotion
                if piece_best and piece_best.piece_type == chess.PAWN:
                    best_pawn_advance = self._evaluate_pawn_advance(best_move, player_color)
                    played_pawn_advance = 0
                    if piece_played and piece_played.piece_type == chess.PAWN:
                        played_pawn_advance = self._evaluate_pawn_advance(played_move, player_color)
                    
                    if best_pawn_advance > played_pawn_advance:
                        factors.append("advances a pawn closer to promotion")
            except Exception:
                pass  # Skip this analysis if it fails
            
            # Mobility (how many legal moves there are)
            try:
                board_after_played_copy = board_after_played.copy()
                board_after_best_copy = board_after_best.copy()
                
                # Try to make a null move to switch turns
                try:
                    board_after_played_copy.push(chess.Move.null())
                    played_mobility = len(list(board_after_played_copy.legal_moves))
                    board_after_played_copy.pop()
                except Exception:
                    # If null move doesn't work, just count current legal moves
                    played_mobility = len(list(board_after_played.legal_moves))
                
                try:
                    board_after_best_copy.push(chess.Move.null())
                    best_mobility = len(list(board_after_best_copy.legal_moves))
                    board_after_best_copy.pop()
                except Exception:
                    best_mobility = len(list(board_after_best.legal_moves))
                
                # Player's mobility
                played_own_mobility = len(list(board_after_played.legal_moves))
                best_own_mobility = len(list(board_after_best.legal_moves))
                if best_own_mobility > played_own_mobility + 2:
                    factors.append("increases your mobility")
                
                # Opponent's mobility
                if best_mobility < played_mobility - 2:  # Significant difference in opponent's mobility
                    factors.append("restricts opponent's mobility")
            except Exception:
                pass  # Skip this analysis if it fails
            
            # Check if the move attacks an opponent piece
            try:
                if self._move_attacks_piece(board, best_move, opponent_color) and not self._move_attacks_piece(board, played_move, opponent_color):
                    factors.append("puts pressure on opponent's pieces")
            except Exception:
                pass
            
            # Check if the move defends a piece under attack
            try:
                if self._move_defends_piece(board, best_move, player_color) and not self._move_defends_piece(board, played_move, player_color):
                    factors.append("defends a vulnerable piece")
            except Exception:
                pass
            
            # Check for control of important files or diagonals
            try:
                best_file_control = self._check_file_control(board_after_best, best_move, player_color)
                played_file_control = self._check_file_control(board_after_played, played_move, player_color)
                
                if best_file_control and not played_file_control:
                    if self._is_piece_type(board, best_move.from_square, chess.ROOK):
                        factors.append("controls an open file with a rook")
                    elif self._is_piece_type(board, best_move.from_square, chess.BISHOP):
                        factors.append("controls an important diagonal")
                    elif self._is_piece_type(board, best_move.from_square, chess.QUEEN):
                        factors.append("positions the queen on a strong file or diagonal")
            except Exception:
                pass
            
            # If we still don't have factors, try to give some move-specific commentary
            if not factors:
                try:
                    # Check for knight outposts
                    if self._is_piece_type(board, best_move.from_square, chess.KNIGHT):
                        if self._is_outpost(board_after_best, best_move.to_square, player_color):
                            factors.append("places the knight on a strong outpost")
                    
                    # Check for bishop pair
                    if self._keeps_bishop_pair(board_after_best, player_color) and not self._keeps_bishop_pair(board_after_played, player_color):
                        factors.append("preserves the bishop pair")
                    
                    # Generic piece activity
                    piece_name = self._get_piece_name(board, best_move.from_square)
                    if piece_name:
                        factors.append(f"places the {piece_name} more actively")
                except Exception:
                    pass
            
            # If still no factors, try to analyze lines more deeply
            if not factors:
                try:
                    # Look for tactical possibilities in the future
                    tactics = self._look_for_future_tactics(board_after_best, player_color)
                    if tactics:
                        factors.append(f"sets up {tactics} in future moves")
                except Exception:
                    pass
            
            if factors:
                if len(factors) == 1:
                    return factors[0]
                elif len(factors) == 2:
                    return f"{factors[0]} and {factors[1]}"
                else:
                    return f"{', '.join(factors[:-1])}, and {factors[-1]}"
            
            # If all specialized analysis fails, return this as a last resort
            if san_best != san_played:
                return f"gives you better long-term prospects"
            
            return None
        except Exception:
            # If anything fails in the overall analysis, return None
            return None
    
    def _count_pieces(self, board, color):
        """Count pieces of a specific color on the board."""
        try:
            piece_map = board.piece_map()
            return sum(1 for piece in piece_map.values() if piece.color == color)
        except Exception:
            return 0
    
    def _count_controlled_squares(self, board, squares, color):
        """Count how many of the specified squares are controlled by the given color."""
        try:
            count = 0
            for square in squares:
                try:
                    if board.is_attacked_by(color, square):
                        count += 1
                except Exception:
                    continue
            return count
        except Exception:
            return 0
    
    def _count_developed_pieces(self, board, color):
        """Count number of developed pieces (non-pawns moved from starting position)."""
        try:
            # For simplicity, we'll count pieces that are not on their original squares
            # This is a simplified approach, not perfect
            if color == chess.WHITE:
                home_rank = 0  # Rank 1 (0-indexed in python-chess)
            else:
                home_rank = 7  # Rank 8 (0-indexed in python-chess)
                
            piece_map = board.piece_map()
            developed = 0
            
            for square, piece in piece_map.items():
                if (piece.color == color and 
                    piece.piece_type != chess.PAWN and
                    piece.piece_type != chess.KING and
                    chess.square_rank(square) != home_rank):
                    developed += 1
                    
            return developed
        except Exception:
            return 0
    
    def _evaluate_king_safety(self, board, color):
        """Evaluate king safety as a simple metric."""
        try:
            # Find the king
            king_square = board.king(color)
            if not king_square:
                return 0
                
            # Count attacking pieces near king
            safety = 10  # Start with a base value
            
            # Check if king is attacked
            if board.is_attacked_by(not color, king_square):
                safety -= 5
                
            # Check squares around king
            for offset in [-9, -8, -7, -1, 1, 7, 8, 9]:
                try:
                    adjacent_square = king_square + offset
                    if 0 <= adjacent_square < 64:  # Valid square
                        if board.is_attacked_by(not color, adjacent_square):
                            safety -= 1
                except Exception:
                    continue
                    
            return max(0, safety)
        except Exception:
            return 0
    
    def _evaluate_pawn_structure(self, board, color):
        """Evaluate pawn structure quality."""
        try:
            # Count doubled, isolated and passed pawns
            pawns = [s for s, p in board.piece_map().items() 
                    if p.piece_type == chess.PAWN and p.color == color]
            
            if not pawns:
                return 0
                
            # Check for doubled pawns (pawns on same file)
            files = [chess.square_file(s) for s in pawns]
            doubled = len(files) - len(set(files))
            
            # Simple metric: penalize doubled pawns
            score = 10 - (doubled * 2)
            
            return max(0, score)
        except Exception:
            return 0
    
    def _count_squares_controlled(self, board, color):
        """Count total number of squares controlled by a player."""
        count = 0
        for square in range(64):
            if board.is_attacked_by(color, square):
                count += 1
        return count
    
    def _is_in_opening(self, board):
        """Check if we're still in the opening phase (roughly first 10 moves)."""
        return board.fullmove_number <= 10
    
    def _move_helps_castling(self, board, move, color):
        """Check if a move helps prepare for castling."""
        # Check if it's a king or rook move (would prevent castling)
        piece = board.piece_at(move.from_square)
        if not piece:
            return False
            
        if piece.piece_type == chess.KING or piece.piece_type == chess.ROOK:
            return False
            
        # Check if the move develops a piece from starting position
        if color == chess.WHITE and chess.square_rank(move.from_square) == 0:
            return True
        if color == chess.BLACK and chess.square_rank(move.from_square) == 7:
            return True
            
        return False
    
    def _evaluate_pawn_advance(self, move, color):
        """Evaluate how much a pawn move advances toward promotion."""
        # Check if it's a pawn
        if not move:
            return 0
            
        # Get rank difference
        from_rank = chess.square_rank(move.from_square)
        to_rank = chess.square_rank(move.to_square)
        
        # For white pawns, higher ranks are better
        if color == chess.WHITE:
            return to_rank - from_rank
        # For black pawns, lower ranks are better  
        else:
            return from_rank - to_rank
    
    def _move_attacks_piece(self, board, move, opponent_color):
        """Check if a move directly attacks an opponent's piece."""
        if not move:
            return False
            
        # Create a board after the move
        board_after = board.copy()
        board_after.push(move)
        
        # Check if the move's destination square attacks any opponent pieces
        for square in range(64):
            piece = board_after.piece_at(square)
            if piece and piece.color == opponent_color:
                if board_after.is_attacked_by(not opponent_color, square):
                    return True
        
        return False
    
    def _move_defends_piece(self, board, move, color):
        """Check if a move defends a piece under attack."""
        if not move:
            return False
            
        # Look for pieces under attack
        threatened_pieces = []
        for square in range(64):
            piece = board.piece_at(square)
            if piece and piece.color == color:
                if board.is_attacked_by(not color, square):
                    threatened_pieces.append(square)
        
        if not threatened_pieces:
            return False
            
        # Check if the move defends any of those pieces
        board_after = board.copy()
        board_after.push(move)
        
        for square in threatened_pieces:
            # Check if the piece is still on the board (wasn't captured)
            piece = board_after.piece_at(square)
            if piece and piece.color == color:
                # Check if it's now defended
                if board_after.is_attacked_by(color, square):
                    return True
        
        return False
    
    def _check_file_control(self, board, move, color):
        """Check if the move results in controlling an open or semi-open file."""
        if not move:
            return False
            
        # Check if it's a piece that benefits from file/diagonal control
        piece = board.piece_at(move.from_square)
        if not piece or piece.piece_type not in [chess.ROOK, chess.QUEEN, chess.BISHOP]:
            return False
            
        # For rooks and queens, check file control
        if piece.piece_type in [chess.ROOK, chess.QUEEN]:
            file = chess.square_file(move.to_square)
            
            # Check if the file is open or semi-open
            file_has_pawns = False
            own_pawns_on_file = False
            
            for rank in range(8):
                square = chess.square(file, rank)
                p = board.piece_at(square)
                if p and p.piece_type == chess.PAWN:
                    file_has_pawns = True
                    if p.color == color:
                        own_pawns_on_file = True
            
            # Return true for open files or semi-open files
            return not file_has_pawns or not own_pawns_on_file
            
        # For bishops, check diagonal control
        elif piece.piece_type == chess.BISHOP:
            # Simplified check - see if the bishop attacks many squares post-move
            board_after = board.copy()
            attack_count = 0
            
            for square in range(64):
                if board_after.is_attacked_by(color, square) and board.piece_at(move.from_square) == piece:
                    attack_count += 1
                    
            return attack_count >= 7  # Bishop on a good diagonal attacks 7+ squares
            
        return False
    
    def _is_piece_type(self, board, square, piece_type):
        """Check if a piece at a square is of a specific type."""
        piece = board.piece_at(square)
        return piece and piece.piece_type == piece_type
    
    def _is_outpost(self, board, square, color):
        """Check if a square is a strong outpost for a knight."""
        # An outpost is typically a square that can't be attacked by enemy pawns
        # and is supported by friendly pawns
        
        if color == chess.WHITE:
            # For white, check if black pawns can attack the square
            left_attack = chess.square(chess.square_file(square) - 1, chess.square_rank(square) - 1)
            right_attack = chess.square(chess.square_file(square) + 1, chess.square_rank(square) - 1)
            
            # Check if the square is in enemy territory
            if chess.square_rank(square) < 4:
                return False
                
        else:  # BLACK
            # For black, check if white pawns can attack the square
            left_attack = chess.square(chess.square_file(square) - 1, chess.square_rank(square) + 1)
            right_attack = chess.square(chess.square_file(square) + 1, chess.square_rank(square) + 1)
            
            # Check if the square is in enemy territory
            if chess.square_rank(square) > 3:
                return False
        
        # Check if square can be attacked by enemy pawns
        try:
            left_piece = board.piece_at(left_attack)
            if left_piece and left_piece.piece_type == chess.PAWN and left_piece.color != color:
                return False
        except ValueError:
            pass  # Square is off the board
            
        try:
            right_piece = board.piece_at(right_attack)
            if right_piece and right_piece.piece_type == chess.PAWN and right_piece.color != color:
                return False
        except ValueError:
            pass  # Square is off the board
            
        # Check if square is defended by friendly pieces
        return board.is_attacked_by(color, square)
    
    def _keeps_bishop_pair(self, board, color):
        """Check if a position maintains the bishop pair."""
        bishops = 0
        for square in range(64):
            piece = board.piece_at(square)
            if piece and piece.piece_type == chess.BISHOP and piece.color == color:
                bishops += 1
        return bishops >= 2
    
    def _get_piece_name(self, board, square):
        """Get the name of the piece at a square."""
        piece = board.piece_at(square)
        if not piece:
            return None
            
        piece_names = {
            chess.PAWN: "pawn",
            chess.KNIGHT: "knight",
            chess.BISHOP: "bishop",
            chess.ROOK: "rook",
            chess.QUEEN: "queen",
            chess.KING: "king"
        }
        
        return piece_names.get(piece.piece_type)
    
    def _look_for_future_tactics(self, board, color):
        """Look one move ahead for tactical opportunities."""
        # Make a shallow search to see if there's something tactical coming up
        try:
            result = self.engine.analyse(
                board, 
                chess.engine.Limit(depth=8, time=0.1),
                multipv=1
            )
            
            if result and len(result) > 0:
                score = result[0]["score"].white()
                # If score significantly changes, there might be tactics
                if color == chess.WHITE and score.score() > 150:
                    return "a tactical opportunity"
                elif color == chess.BLACK and score.score() < -150:
                    return "a tactical opportunity"
                
                # Check for specific PV patterns
                if len(result[0]["pv"]) >= 2:
                    first_move = result[0]["pv"][0]
                    second_move = result[0]["pv"][1]
                    
                    # See if the second move is a capture
                    if board.is_capture(second_move):
                        return "a tactical sequence"
                        
                    # Check for discovered attacks
                    board_after = board.copy()
                    board_after.push(first_move)
                    if self._is_discovered_attack(board, board_after, color):
                        return "a discovered attack"
                        
        except Exception:
            pass
            
        return None
    
    def _is_discovered_attack(self, board_before, board_after, color):
        """Check if a move creates a discovered attack."""
        for square in range(64):
            piece = board_after.piece_at(square)
            if not piece or piece.color != (not color):
                continue
                
            # Check if the piece is now under attack but wasn't before
            if board_after.is_attacked_by(color, square) and not board_before.is_attacked_by(color, square):
                return True
                
        return False

    def analyze_game(self, pgn_file_path):
        """Analyze a game from a PGN file and return the analysis as JSON data."""
        analysis_data = {
            "game_info": {},
            "moves": [],
            "errors": []
        }
        
        try:
            with open(pgn_file_path) as pgn_file:
                game = chess.pgn.read_game(pgn_file)
                
            if not game:
                error_msg = "Error: Could not read game from PGN file"
                print(error_msg)
                analysis_data["errors"].append(error_msg)
                return analysis_data
                
            # Game headers
            analysis_data["game_info"] = {
                "white": game.headers.get('White', 'Unknown'),
                "black": game.headers.get('Black', 'Unknown'),
                "event": game.headers.get('Event', 'Unknown'),
                "date": game.headers.get('Date', 'Unknown')
            }
            
            print(f"Analyzing game: {analysis_data['game_info']['white']} vs {analysis_data['game_info']['black']}")
            print(f"Event: {analysis_data['game_info']['event']}")
            print(f"Date: {analysis_data['game_info']['date']}")
            print("-" * 60)
            
            # Start from initial position
            board = game.board()
            node = game
            
            # Store the previous position's evaluation
            prev_score = self._get_position_evaluation(board)
            
            # Track move numbers
            ply = 0
            
            # Analyze each move
            current_move_line = ""
            while node.variations:
                try:
                    node = node.variations[0]  # Follow main line
                    move = node.move
                    
                    # Get move in algebraic notation
                    san_move = board.san(move)
                    
                    # Whose move it is (True for White, False for Black)
                    is_white_move = (ply % 2 == 0)
                    move_number = ply // 2 + 1  # Chess move numbering (1. e4 e5, 2. Nf3 ...)
                    
                    # Start a new line for each full move
                    if is_white_move:
                        current_move_line = f"{move_number}. {san_move}"
                    else:
                        current_move_line += f" {san_move}"
                    
                    # We need to analyze the position BEFORE the move
                    # to get the best move and explanation
                    best_move = None
                    explanation = None
                    
                    # Store the board position before the move
                    board_before_move = board.copy()
                    
                    # Apply the move to our board
                    board.push(move)
                    ply += 1
                    
                    # Get evaluation after the move
                    curr_score = self._get_position_evaluation(board)
                    
                    # Calculate score difference from the player's perspective
                    if is_white_move:
                        # White just moved, evaluate from White's perspective
                        score_diff = curr_score.white().score() - prev_score.white().score()
                        player = "White"
                    else:
                        # Black just moved, evaluate from Black's perspective
                        score_diff = prev_score.white().score() - curr_score.white().score()
                        player = "Black"
                    
                    # Classify the move
                    move_quality = self._classify_move(score_diff)
                    
                    # Create move data structure
                    move_data = {
                        "move_number": move_number,
                        "ply": ply,
                        "move": san_move,
                        "player": player,
                        "is_white": is_white_move,
                        "quality": move_quality,
                        "evaluation": str(curr_score),
                        "notation": current_move_line
                    }
                    
                    # If it's the end of a full move or a non-good move, print the move line
                    if not is_white_move or move_quality != "good move":
                        print(f"{current_move_line}")
                    
                    # For non-good moves, print analysis and add to JSON
                    if move_quality != "good move":
                        player_symbol = "♔" if player == "White" else "♚"
                        print(f"  {player_symbol} {player}'s move: {san_move} ({move_quality}, eval: {curr_score})")
                        
                        try:
                            # Now get the best move for that position
                            best_move, best_score, explanation, best_pv = self._get_best_move_and_explanation(board_before_move, move)
                            best_san = board_before_move.san(best_move)
                            print(f"  ✓ Better move: {best_san}")
                            print(f"  ℹ Why: {explanation}")
                            if best_pv:
                                print(f"  ➡ Expected line: {best_pv}")
                            print()
                            
                            # Add to move data
                            move_data["analysis"] = {
                                "best_move": best_san,
                                "explanation": explanation,
                                "best_evaluation": str(best_score) if best_score else None,
                                "principal_variation": best_pv
                            }
                        except Exception as e:
                            error_msg = f"Unable to determine best move: {str(e)}"
                            print(f"  ⚠ {error_msg}")
                            print()
                            move_data["analysis_error"] = error_msg
                    
                    # Add the move data to our analysis
                    analysis_data["moves"].append(move_data)
                    
                    # Store current evaluation for next move
                    prev_score = curr_score
                    
                except Exception as e:
                    error_msg = f"Error analyzing move: {str(e)}"
                    print(f"\n{error_msg}")
                    analysis_data["errors"].append(error_msg)
                    # Try to continue with the next move
                    continue
            
            print("\nAnalysis complete!")
            
        except FileNotFoundError:
            error_msg = f"Error: PGN file '{pgn_file_path}' not found"
            print(error_msg)
            analysis_data["errors"].append(error_msg)
        except Exception as e:
            error_msg = f"Error analyzing game: {str(e)}"
            print(error_msg)
            analysis_data["errors"].append(error_msg)
        finally:
            # Make sure to quit the engine
            if hasattr(self, 'engine'):
                self.engine.quit()
        
        return analysis_data
    
    def _get_position_evaluation(self, board):
        """Get the evaluation of the current position."""
        result = self.engine.analyse(
            board, 
            chess.engine.Limit(depth=self.depth, time=self.time_limit)
        )
        return result["score"]
    
    def _classify_move(self, score_diff):
        """Classify a move based on the score difference."""
        if score_diff <= self.blunder_threshold:
            return "blunder"
        elif score_diff <= self.mistake_threshold:
            return "mistake"
        elif score_diff <= self.inaccuracy_threshold:
            return "inaccuracy"
        return "good move"