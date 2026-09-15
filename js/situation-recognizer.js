/**
 * situation-recognizer.js - Tactical and positional pattern recognition for WhyBlunder.
 * Compatible with Browser and Node.js.
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SituationRecognizer = factory();
    }
}(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    const PIECE_VALUES = {
        p: 1,
        n: 3,
        b: 3,
        r: 5,
        q: 9,
        k: 100
    };

    const PIECE_NAMES = {
        p: 'pawn',
        n: 'knight',
        b: 'bishop',
        r: 'rook',
        q: 'queen',
        k: 'king'
    };

    function squareToFile(sq) {
        return sq.charCodeAt(0) - 97; // 0..7
    }

    function squareToRank(sq) {
        return parseInt(sq.charAt(1)) - 1; // 0..7 (0-indexed)
    }

    function fileRankToSquare(file, rank) {
        return String.fromCharCode(97 + file) + (rank + 1);
    }

    /**
     * Compute squares attacked by a piece on `square`.
     * @param {object} chess - chess.js instance
     * @param {string} square - e.g. 'e4'
     * @returns {string[]} attacked squares
     */
    function getPieceAttacks(chess, square) {
        const p = chess.get(square);
        if (!p) return [];
        const file = squareToFile(square);
        const rank = squareToRank(square);
        const attacked = [];
        const color = p.color;

        if (p.type === 'p') {
            const dir = (color === 'w') ? 1 : -1;
            for (const df of [-1, 1]) {
                const nf = file + df;
                const nr = rank + dir;
                if (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
                    attacked.push(fileRankToSquare(nf, nr));
                }
            }
        } else if (p.type === 'n') {
            const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
            for (const [df, dr] of offsets) {
                const nf = file + df;
                const nr = rank + dr;
                if (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
                    attacked.push(fileRankToSquare(nf, nr));
                }
            }
        } else if (p.type === 'k') {
            for (let df = -1; df <= 1; df++) {
                for (let dr = -1; dr <= 1; dr++) {
                    if (df === 0 && dr === 0) continue;
                    const nf = file + df;
                    const nr = rank + dr;
                    if (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
                        attacked.push(fileRankToSquare(nf, nr));
                    }
                }
            }
        } else {
            // Sliding pieces: b, r, q
            const dirs = [];
            if (p.type === 'b' || p.type === 'q') {
                dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
            }
            if (p.type === 'r' || p.type === 'q') {
                dirs.push([-1,0],[1,0],[0,-1],[0,1]);
            }
            for (const [df, dr] of dirs) {
                let nf = file + df;
                let nr = rank + dr;
                while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
                    const targetSq = fileRankToSquare(nf, nr);
                    attacked.push(targetSq);
                    if (chess.get(targetSq)) break; // blocked by piece
                    nf += df;
                    nr += dr;
                }
            }
        }
        return attacked;
    }

    /**
     * Check if a square is attacked by pieces of `color`.
     */
    function isSquareAttackedBy(chess, color, targetSq) {
        for (let f = 0; f < 8; f++) {
            for (let r = 0; r < 8; r++) {
                const sq = fileRankToSquare(f, r);
                const piece = chess.get(sq);
                if (piece && piece.color === color) {
                    const attacks = getPieceAttacks(chess, sq);
                    if (attacks.includes(targetSq)) return true;
                }
            }
        }
        return false;
    }

    /**
     * Get all attacking piece squares of `color` targeting `targetSq`.
     */
    function getAttackers(chess, color, targetSq) {
        const attackers = [];
        for (let f = 0; f < 8; f++) {
            for (let r = 0; r < 8; r++) {
                const sq = fileRankToSquare(f, r);
                const piece = chess.get(sq);
                if (piece && piece.color === color) {
                    const attacks = getPieceAttacks(chess, sq);
                    if (attacks.includes(targetSq)) attackers.push(sq);
                }
            }
        }
        return attackers;
    }

    function findKingSquare(chess, color) {
        for (let f = 0; f < 8; f++) {
            for (let r = 0; r < 8; r++) {
                const sq = fileRankToSquare(f, r);
                const p = chess.get(sq);
                if (p && p.type === 'k' && p.color === color) {
                    return sq;
                }
            }
        }
        return null;
    }

    /**
     * Detect direct attacks and threats created by the moved piece.
     */
    function detectThreatsCreated(boardAfter, move) {
        const piece = boardAfter.get(move.to);
        if (!piece) return [];

        const color = piece.color;
        const oppColor = (color === 'w' ? 'b' : 'w');
        const threats = [];

        const attackedSquares = getPieceAttacks(boardAfter, move.to);
        const attackerVal = PIECE_VALUES[piece.type] || 1;

        for (const sq of attackedSquares) {
            const target = boardAfter.get(sq);
            if (!target || target.color !== oppColor) continue;

            const targetVal = PIECE_VALUES[target.type] || 1;
            const isDefended = isSquareAttackedBy(boardAfter, oppColor, sq);
            const targetName = PIECE_NAMES[target.type] || 'piece';

            if (target.type === 'k') {
                threats.push({
                    from: move.to,
                    to: sq,
                    target: targetName,
                    is_check: true,
                    is_undefended: true,
                    description: 'checks the enemy King'
                });
            } else if (!isDefended) {
                threats.push({
                    from: move.to,
                    to: sq,
                    target: targetName,
                    is_check: false,
                    is_undefended: true,
                    description: `attacks undefended ${targetName} on ${sq}`
                });
            } else if (targetVal >= attackerVal) {
                threats.push({
                    from: move.to,
                    to: sq,
                    target: targetName,
                    is_check: false,
                    is_defended: true,
                    description: `attacks the ${targetName} on ${sq}`
                });
            }
        }
        return threats;
    }

    /**
     * Check if a piece of `color` on `square` is safe from being captured profitably.
     */
    function isPieceSafe(board, color, square, oppAttackerVal = null) {
        const piece = board.get(square);
        if (!piece) return true;
        const oppColor = (color === 'w' ? 'b' : 'w');

        if (!isSquareAttackedBy(board, oppColor, square)) {
            return true;
        }

        const val = PIECE_VALUES[piece.type] || 0;
        const isDefended = isSquareAttackedBy(board, color, square);
        if (!isDefended) {
            return false;
        }

        const attackers = getAttackers(board, oppColor, square);
        let minAttackerVal = 999;
        for (const a of attackers) {
            const p = board.get(a);
            if (p) {
                const aVal = PIECE_VALUES[p.type] || 0;
                if (aVal < minAttackerVal) minAttackerVal = aVal;
            }
        }
        if (minAttackerVal < val) {
            return false;
        }

        if (oppAttackerVal !== null && val > oppAttackerVal) {
            return false;
        }

        if (minAttackerVal <= val) {
            const defenders = getAttackers(board, color, square);
            if (attackers.length > defenders.length) {
                return false;
            }
        }

        return true;
    }

    /**
     * Detect genuine, unavoidable fork / double attack.
     */
    function detectFork(boardAfter, move) {
        const piece = boardAfter.get(move.to);
        if (!piece) return null;

        const attackerVal = PIECE_VALUES[piece.type] || 0;
        const color = piece.color;
        const oppColor = (color === 'w' ? 'b' : 'w');

        // Check 1: Is the attacker itself en prise / easily capturable?
        const isAttackerDefended = isSquareAttackedBy(boardAfter, color, move.to);
        const oppAttackers = getAttackers(boardAfter, oppColor, move.to);
        if (oppAttackers.length > 0) {
            if (!isAttackerDefended) return null;
            let minOppVal = 999;
            for (const a of oppAttackers) {
                const p = boardAfter.get(a);
                if (p) {
                    const aVal = PIECE_VALUES[p.type] || 0;
                    if (aVal < minOppVal) minOppVal = aVal;
                }
            }
            if (minOppVal <= attackerVal) return null;
        }

        // Check 2: Identify valuable targets
        const attackedSquares = getPieceAttacks(boardAfter, move.to);
        const valuableTargets = [];

        for (const sq of attackedSquares) {
            const target = boardAfter.get(sq);
            if (!target || target.color !== oppColor) continue;

            const targetVal = PIECE_VALUES[target.type] || 0;
            const isDefended = isSquareAttackedBy(boardAfter, oppColor, sq);

            if (target.type === 'k') {
                valuableTargets.push({
                    square: sq,
                    type: target.type,
                    val: targetVal,
                    name: PIECE_NAMES[target.type] || 'piece',
                    is_defended: isDefended
                });
            } else if (targetVal > attackerVal) {
                valuableTargets.push({
                    square: sq,
                    type: target.type,
                    val: targetVal,
                    name: PIECE_NAMES[target.type] || 'piece',
                    is_defended: isDefended
                });
            } else if (!isDefended) {
                valuableTargets.push({
                    square: sq,
                    type: target.type,
                    val: targetVal,
                    name: PIECE_NAMES[target.type] || 'piece',
                    is_defended: false
                });
            }
        }

        if (valuableTargets.length < 2) return null;

        // At least one target must be a piece (not both pawns)
        if (!valuableTargets.some(t => t.type !== 'p')) return null;

        valuableTargets.sort((a, b) => b.val - a.val);
        const t1 = valuableTargets[0];
        const t2 = valuableTargets[1];

        // Check 3: Can opponent resolve both threats in a single legal move?
        const legalMoves = boardAfter.moves({ verbose: true });
        for (const oppMove of legalMoves) {
            boardAfter.move(oppMove);

            // Case 3a: Counter-check
            if (boardAfter.in_check && boardAfter.in_check()) {
                const chkSafe = isPieceSafe(boardAfter, oppColor, oppMove.to);
                boardAfter.undo();
                if (chkSafe) return null;
                continue;
            }

            // Case 3b: Opponent captures attacker
            if (oppMove.to === move.to) {
                const capturer = oppMove.piece;
                const capturerVal = PIECE_VALUES[capturer] || 1;
                boardAfter.undo();
                if (!isAttackerDefended || capturerVal <= attackerVal) {
                    return null;
                }
                continue;
            }

            // Case 3c: Check safety of both targets after oppMove
            const sq1 = (oppMove.from === t1.square) ? oppMove.to : t1.square;
            const sq2 = (oppMove.from === t2.square) ? oppMove.to : t2.square;

            const attacksFromForker = getPieceAttacks(boardAfter, move.to);
            const t1AttackedByForker = attacksFromForker.includes(sq1);
            const t1Defended = isSquareAttackedBy(boardAfter, oppColor, sq1);
            let t1Safe = !t1AttackedByForker || (t1Defended && t1.val <= attackerVal);
            if (oppMove.from === t1.square) {
                t1Safe = t1Safe && isPieceSafe(boardAfter, oppColor, sq1);
            }

            const t2AttackedByForker = attacksFromForker.includes(sq2);
            const t2Defended = isSquareAttackedBy(boardAfter, oppColor, sq2);
            let t2Safe = !t2AttackedByForker || (t2Defended && t2.val <= attackerVal);
            if (oppMove.from === t2.square) {
                t2Safe = t2Safe && isPieceSafe(boardAfter, oppColor, sq2);
            }

            boardAfter.undo();

            if (t1Safe && t2Safe) {
                return null;
            }
        }

        const names = [t1.name, t2.name];
        return {
            type: 'fork',
            attacker: PIECE_NAMES[piece.type] || 'piece',
            targets: names,
            description: `forking the ${names[0]} and ${names[1]}`
        };
    }

    /**
     * Detect pin created by the moved piece.
     */
    function detectPin(boardAfter, move) {
        const piece = boardAfter.get(move.to);
        if (!piece || (piece.type !== 'b' && piece.type !== 'r' && piece.type !== 'q')) {
            return null;
        }

        const color = piece.color;
        const oppColor = (color === 'w' ? 'b' : 'w');

        // Check if pinning piece is safe (not hanging / en prise)
        const isAttackerDefended = isSquareAttackedBy(boardAfter, color, move.to);
        const oppAttackers = getAttackers(boardAfter, oppColor, move.to);
        if (oppAttackers.length > 0) {
            if (!isAttackerDefended) return null;
            let minOppVal = 999;
            for (const a of oppAttackers) {
                const p = boardAfter.get(a);
                if (p) {
                    const aVal = PIECE_VALUES[p.type] || 0;
                    if (aVal < minOppVal) minOppVal = aVal;
                }
            }
            const attackerVal = PIECE_VALUES[piece.type] || 0;
            if (minOppVal < attackerVal) return null;
        }
        const kingSq = findKingSquare(boardAfter, oppColor);
        if (!kingSq) return null;

        const f1 = squareToFile(move.to);
        const r1 = squareToRank(move.to);
        const f2 = squareToFile(kingSq);
        const r2 = squareToRank(kingSq);

        const df = f2 - f1;
        const dr = r2 - r1;

        // Must be on the same rank, file, or diagonal
        const stepF = df === 0 ? 0 : (df > 0 ? 1 : -1);
        const stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);

        const isDiagonal = Math.abs(df) === Math.abs(dr) && df !== 0;
        const isStraight = (df === 0 && dr !== 0) || (df !== 0 && dr === 0);

        if (piece.type === 'b' && !isDiagonal) return null;
        if (piece.type === 'r' && !isStraight) return null;
        if (piece.type === 'q' && !isDiagonal && !isStraight) return null;

        // Trace squares between move.to and kingSq
        let currF = f1 + stepF;
        let currR = r1 + stepR;
        let pinnedPiece = null;
        let pieceCount = 0;

        while (currF !== f2 || currR !== r2) {
            const sq = fileRankToSquare(currF, currR);
            const p = boardAfter.get(sq);
            if (p) {
                pieceCount++;
                if (p.color === oppColor) {
                    pinnedPiece = p;
                }
            }
            currF += stepF;
            currR += stepR;
        }

        // Exactly one piece between slider and king, and that piece is an opponent piece
        if (pieceCount === 1 && pinnedPiece) {
            const name = PIECE_NAMES[pinnedPiece.type] || 'piece';
            return {
                type: 'pin',
                pinned: name,
                description: `pinning the enemy ${name} to the King`
            };
        }
        return null;
    }

    /**
     * Detect hanging piece blunder.
     */
    function detectHangingPieceBlunder(boardBefore, boardAfter, playedMove) {
        const color = boardBefore.turn();
        const oppColor = (color === 'w' ? 'b' : 'w');
        const movedPiece = boardBefore.get(playedMove.from);
        if (!movedPiece) return null;

        const toSq = playedMove.to;
        const isAttacked = isSquareAttackedBy(boardAfter, oppColor, toSq);
        const isDefended = isSquareAttackedBy(boardAfter, color, toSq);

        const attackers = getAttackers(boardAfter, oppColor, toSq);
        if (attackers.length > 0) {
            let minAttackerVal = 999;
            for (const a of attackers) {
                const ap = boardAfter.get(a);
                if (ap) {
                    const val = PIECE_VALUES[ap.type] || 0;
                    if (val < minAttackerVal) minAttackerVal = val;
                }
            }
            const movedVal = PIECE_VALUES[movedPiece.type] || 0;

            if (!isDefended || minAttackerVal < movedVal) {
                const name = PIECE_NAMES[movedPiece.type] || 'piece';
                return {
                    type: 'hanging_piece',
                    piece: name,
                    square: toSq,
                    description: `leaves the ${name} hanging on ${toSq}`
                };
            }
        }

        // Check if removing defender left another friendly piece hanging
        for (let f = 0; f < 8; f++) {
            for (let r = 0; r < 8; r++) {
                const sq = fileRankToSquare(f, r);
                if (sq === toSq) continue;
                const p = boardAfter.get(sq);
                if (p && p.color === color && p.type !== 'k') {
                    const attackedNow = isSquareAttackedBy(boardAfter, oppColor, sq);
                    const defendedNow = isSquareAttackedBy(boardAfter, color, sq);
                    const attackedBefore = isSquareAttackedBy(boardBefore, oppColor, sq);
                    const defendedBefore = isSquareAttackedBy(boardBefore, color, sq);

                    if (attackedNow && !defendedNow && defendedBefore) {
                        const name = PIECE_NAMES[p.type] || 'piece';
                        return {
                            type: 'removed_defender',
                            piece: name,
                            square: sq,
                            description: `removes the defense of the ${name} on ${sq}`
                        };
                    }
                }
            }
        }
        return null;
    }

    /**
     * Check if square is an outpost.
     */
    function isTrueOutpost(board, square, color) {
        const rank = squareToRank(square);
        const file = squareToFile(square);

        if (color === 'w') {
            if (rank !== 3 && rank !== 4 && rank !== 5) return false;
        } else {
            if (rank !== 2 && rank !== 3 && rank !== 4) return false;
        }

        // Defended by friendly pawn?
        const defenders = getAttackers(board, color, square);
        const pawnDefended = defenders.some(sq => {
            const p = board.get(sq);
            return p && p.type === 'p';
        });
        if (!pawnDefended) return false;

        // Can enemy pawns on adjacent files ever challenge it?
        const oppColor = (color === 'w' ? 'b' : 'w');
        const adjFiles = [file - 1, file + 1].filter(f => f >= 0 && f <= 7);

        for (const af of adjFiles) {
            for (let r = 0; r < 8; r++) {
                const p = board.get(fileRankToSquare(af, r));
                if (p && p.type === 'p' && p.color === oppColor) {
                    if (color === 'w' && r > rank) return false;
                    if (color === 'b' && r < rank) return false;
                }
            }
        }
        return true;
    }

    /**
     * Detect open file or 7th rank control.
     */
    function detectFileControl(boardBefore, move) {
        const piece = boardBefore.get(move.from);
        if (!piece || (piece.type !== 'r' && piece.type !== 'q')) return null;

        const color = piece.color;
        const file = squareToFile(move.to);
        const rank = squareToRank(move.to);

        // 7th rank for rook (rank index 6 for white, rank index 1 for black)
        if (piece.type === 'r') {
            if ((color === 'w' && rank === 6) || (color === 'b' && rank === 1)) {
                return 'placing the rook on the 7th rank';
            }
        }

        let friendlyPawns = 0;
        let oppPawns = 0;
        for (let r = 0; r < 8; r++) {
            const p = boardBefore.get(fileRankToSquare(file, r));
            if (p && p.type === 'p') {
                if (p.color === color) friendlyPawns++;
                else oppPawns++;
            }
        }

        if (friendlyPawns === 0 && oppPawns === 0) {
            return 'taking control of the open file';
        } else if (friendlyPawns === 0 && oppPawns > 0) {
            return 'controlling the semi-open file';
        }
        return null;
    }

    /**
     * Detect passed pawn creation or advance.
     */
    function detectPassedPawn(boardAfter, move) {
        const piece = boardAfter.get(move.to);
        if (!piece || piece.type !== 'p') return false;

        const color = piece.color;
        const oppColor = (color === 'w' ? 'b' : 'w');
        const file = squareToFile(move.to);
        const rank = squareToRank(move.to);

        const files = [file - 1, file, file + 1].filter(f => f >= 0 && f <= 7);

        for (const f of files) {
            for (let r = 0; r < 8; r++) {
                if (color === 'w' && r > rank) {
                    const p = boardAfter.get(fileRankToSquare(f, r));
                    if (p && p.type === 'p' && p.color === oppColor) return false;
                } else if (color === 'b' && r < rank) {
                    const p = boardAfter.get(fileRankToSquare(f, r));
                    if (p && p.type === 'p' && p.color === oppColor) return false;
                }
            }
        }
        return true;
    }

    /**
     * Detect king safety flaw.
     */
    function detectKingSafetyFlaw(boardBefore, boardAfter, move) {
        const color = boardBefore.turn();
        const piece = boardBefore.get(move.from);
        if (!piece) return null;

        // King moves without castling when castling rights were available
        if (piece.type === 'k') {
            const fromRank = squareToRank(move.from);
            const toRank = squareToRank(move.to);
            const fromFile = squareToFile(move.from);
            const toFile = squareToFile(move.to);
            const isCastling = Math.abs(toFile - fromFile) === 2;
            if (!isCastling) {
                // If king stepped away
                return 'forfeiting castling rights and leaving the king in the center';
            }
        }

        // Weakening pawn shield in front of castled king
        if (piece.type === 'p') {
            const kingSq = findKingSquare(boardAfter, color);
            if (kingSq) {
                const kingFile = squareToFile(kingSq);
                const moveFile = squareToFile(move.from);
                if (Math.abs(kingFile - moveFile) <= 1) {
                    if ((color === 'w' && (kingSq === 'g1' || kingSq === 'h1' || kingSq === 'c1' || kingSq === 'b1')) ||
                        (color === 'b' && (kingSq === 'g8' || kingSq === 'h8' || kingSq === 'c8' || kingSq === 'b8'))) {
                        return 'weakening the defensive pawn shield around your King';
                    }
                }
            }
        }
        return null;
    }

    /**
     * Full dual-sided explanation for blunder or mistake.
     */
    function explainBlunderOrMistake(options) {
        const {
            boardBefore,
            boardAfter,
            playedMove,
            bestMove,
            refutationMove = null,
            sanPlayed,
            sanBest,
            sanRef = null
        } = options;

        const color = boardBefore.turn();
        const oppName = (color === 'w' ? 'Black' : 'White');

        const tags = [];
        let blunderReason = null;

        // Check 1: Hanging piece
        const hanging = detectHangingPieceBlunder(boardBefore, boardAfter, playedMove);
        if (hanging) {
            tags.push('Hanging Piece');
            blunderReason = hanging.description;
        }

        // Check 2: King safety
        if (!blunderReason) {
            const ks = detectKingSafetyFlaw(boardBefore, boardAfter, playedMove);
            if (ks) {
                tags.push('King Safety');
                blunderReason = ks;
            }
        }

        // Check 3: Refutation move
        let refutationEffect = null;
        if (refutationMove) {
            let boardAfterRef = null;
            try {
                boardAfterRef = new Chess(boardAfter.fen());
                boardAfterRef.move({
                    from: refutationMove.from,
                    to: refutationMove.to,
                    promotion: refutationMove.promotion
                });
            } catch (e) {
                boardAfterRef = null;
            }

            const isCheckmate = !!(options.refutationIsCheckmate) || (boardAfterRef && boardAfterRef.in_checkmate && boardAfterRef.in_checkmate());
            if (isCheckmate) {
                tags.push('Checkmate');
                refutationEffect = `allows ${sanRef || 'refutation'}# delivering checkmate`;
            } else if (boardAfterRef) {
                const fork = detectFork(boardAfterRef, refutationMove);
                if (fork) {
                    tags.push('Fork');
                    refutationEffect = `allows ${sanRef || 'refutation'} ${fork.description}`;
                } else if (detectPin(boardAfterRef, refutationMove)) {
                    tags.push('Pin');
                    refutationEffect = `allows ${sanRef || 'refutation'} pinning a piece`;
                } else if (refutationMove.to === playedMove.to) {
                    const captured = PIECE_NAMES[boardBefore.get(playedMove.from)?.type] || 'piece';
                    refutationEffect = `allows ${sanRef || 'refutation'} capturing your ${captured}`;
                } else {
                    refutationEffect = `gives ${oppName} the initiative with ${sanRef || 'threats'}`;
                }
            } else {
                refutationEffect = `gives ${oppName} the initiative with ${sanRef || 'threats'}`;
            }
        }

        // Check 4: Best move reason
        let bestReason = null;
        if (bestMove) {
            let boardAfterBest = null;
            try {
                boardAfterBest = new Chess(boardBefore.fen());
                boardAfterBest.move({
                    from: bestMove.from,
                    to: bestMove.to,
                    promotion: bestMove.promotion
                });
            } catch (e) {
                boardAfterBest = null;
            }

            if (boardAfterBest) {
                const fork = detectFork(boardAfterBest, bestMove);
                if (fork) {
                    tags.push('Tactical Fork');
                    bestReason = `delivers a ${fork.description}`;
                } else if (boardBefore.get(bestMove.to)) {
                    const cap = PIECE_NAMES[boardBefore.get(bestMove.to)?.type] || 'piece';
                    bestReason = `captures the ${cap}`;
                } else {
                    const fc = detectFileControl(boardBefore, bestMove);
                    if (fc) {
                        tags.push('File Control');
                        bestReason = fc;
                    } else if (isTrueOutpost(boardAfterBest, bestMove.to, color)) {
                        tags.push('Outpost');
                        bestReason = 'places your knight on a powerful outpost';
                    } else if (detectPassedPawn(boardAfterBest, bestMove)) {
                        tags.push('Passed Pawn');
                        bestReason = 'creates a dangerous passed pawn';
                    } else {
                        bestReason = 'maintains optimal piece activity and board control';
                    }
                }
            } else {
                bestReason = 'maintains optimal piece activity and board control';
            }
        }

        const parts = [];
        if (blunderReason && refutationEffect) {
            parts.push(`${sanPlayed} ${blunderReason} and ${refutationEffect}.`);
        } else if (blunderReason) {
            parts.push(`${sanPlayed} ${blunderReason}.`);
        } else if (refutationEffect) {
            parts.push(`${sanPlayed} ${refutationEffect}.`);
        } else {
            parts.push(`${sanPlayed} concedes the advantage to ${oppName}.`);
        }

        if (sanBest && bestReason) {
            parts.push(`${sanBest} was better because it ${bestReason}.`);
        }

        return {
            explanation: parts.join(' '),
            tags: Array.from(new Set(tags))
        };
    }

    /**
     * Explanation for good, great, or brilliant move.
     */
    function explainGoodMove(options) {
        const {
            boardBefore,
            boardAfter,
            move,
            san,
            isBest = false
        } = options;

        const color = boardBefore.turn();
        const tags = [];
        const reasons = [];

        if (boardAfter.in_checkmate && boardAfter.in_checkmate()) {
            tags.push('Checkmate');
            return {
                explanation: `Checkmate! ${san} delivers mate and finishes the game.`,
                tags
            };
        }

        if (san.includes('+')) {
            tags.push('Check');
            reasons.push('gives a forcing check');
        }

        const captured = boardBefore.get(move.to);
        if (captured) {
            reasons.push(`captures the ${PIECE_NAMES[captured.type] || 'piece'}`);
        }

        const fork = detectFork(boardAfter, move);
        if (fork) {
            tags.push('Fork');
            reasons.push(fork.description);
        }

        const fileCtrl = detectFileControl(boardBefore, move);
        if (fileCtrl) {
            tags.push('File Control');
            reasons.push(fileCtrl);
        }

        if (isTrueOutpost(boardAfter, move.to, color)) {
            tags.push('Outpost');
            reasons.push('anchors a strong outpost');
        }

        if (detectPassedPawn(boardAfter, move)) {
            tags.push('Passed Pawn');
            reasons.push('advances a passed pawn toward promotion');
        }

        const p = boardBefore.get(move.from);
        if (p && (p.type === 'n' || p.type === 'b')) {
            const homeRank = (color === 'w' ? 0 : 7);
            if (squareToRank(move.from) === homeRank) {
                tags.push('Development');
                reasons.push(`develops the ${PIECE_NAMES[p.type]} to an active square`);
            }
        }

        const prefix = isBest ? 'Best move! ' : 'Strong move. ';
        if (reasons.length > 0) {
            return {
                explanation: `${prefix}${san} ${reasons.join(', and ')}.`,
                tags: Array.from(new Set(tags))
            };
        }
        return {
            explanation: `${prefix}${san} maintains a solid position and harmonious coordination.`,
            tags: Array.from(new Set(tags))
        };
    }

    return {
        PIECE_VALUES,
        PIECE_NAMES,
        getPieceAttacks,
        isSquareAttackedBy,
        getAttackers,
        isPieceSafe,
        detectThreatsCreated,
        detectFork,
        detectPin,
        detectHangingPieceBlunder,
        isTrueOutpost,
        detectFileControl,
        detectPassedPawn,
        detectKingSafetyFlaw,
        explainBlunderOrMistake,
        explainGoodMove
    };
}));
