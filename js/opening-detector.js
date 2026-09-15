/**
 * opening-detector.js - Opening classification, ECO recognition, and opening principles for WhyBlunder.
 * Compatible with Browser and Node.js.
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.OpeningDetector = factory();
    }
}(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    const COMMON_OPENINGS = {
        "e4 e5 Nf3 Nc6 Bc4": ["C50", "Italian Game"],
        "e4 e5 Nf3 Nc6 Bb5": ["C60", "Ruy Lopez"],
        "e4 e5 Nf3 Nc6 d4": ["C44", "Scotch Game"],
        "e4 e5 Nf3 Nf6": ["C42", "Petrov's Defense"],
        "e4 e5 f4": ["C30", "King's Gambit"],
        "e4 c5": ["B20", "Sicilian Defense"],
        "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6": ["B90", "Sicilian Defense: Najdorf Variation"],
        "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6": ["B70", "Sicilian Defense: Dragon Variation"],
        "e4 c5 Nf3 e6": ["B40", "Sicilian Defense: French Variation"],
        "e4 c5 Nf3 Nc6": ["B30", "Sicilian Defense: Old Sicilian"],
        "e4 e6": ["C00", "French Defense"],
        "e4 e6 d4 d5": ["C01", "French Defense: Normal"],
        "e4 c6": ["B10", "Caro-Kann Defense"],
        "e4 c6 d4 d5": ["B12", "Caro-Kann Defense: Main Line"],
        "e4 d5": ["B01", "Scandinavian Defense"],
        "e4 d6": ["B07", "Pirc Defense"],
        "e4 g6": ["B06", "Modern Defense"],
        "e4 Nf6": ["B02", "Alekhine's Defense"],
        "d4 d5 c4": ["D06", "Queen's Gambit"],
        "d4 d5 c4 e6": ["D30", "Queen's Gambit Declined"],
        "d4 d5 c4 dxc4": ["D20", "Queen's Gambit Accepted"],
        "d4 d5 c4 c6": ["D10", "Slav Defense"],
        "d4 d5 Bf4": ["D00", "London System"],
        "d4 Nf6 c4 g6": ["E60", "King's Indian Defense"],
        "d4 Nf6 c4 e6 Nc3 Bb4": ["E20", "Nimzo-Indian Defense"],
        "d4 Nf6 c4 e6 Nf3 b6": ["E12", "Queen's Indian Defense"],
        "d4 Nf6 c4 c5": ["A56", "Benoni Defense"],
        "d4 f5": ["A80", "Dutch Defense"],
        "d4 g6": ["A40", "Queen's Pawn Game: Modern Defense"],
        "c4": ["A10", "English Opening"],
        "Nf3": ["A04", "Réti Opening"],
        "b3": ["A01", "Nimzo-Larsen Attack"]
    };

    /**
     * Identify opening and ECO code from SAN moves.
     * @param {string[]} sanMoves
     * @returns {{ eco: string, name: string }}
     */
    function identifyOpening(sanMoves) {
        if (!sanMoves || sanMoves.length === 0) {
            return { eco: 'A00', name: 'Irregular Opening' };
        }
        for (let length = Math.min(12, sanMoves.length); length > 0; length--) {
            const subSeq = sanMoves.slice(0, length).join(' ');
            if (COMMON_OPENINGS[subSeq]) {
                const [eco, name] = COMMON_OPENINGS[subSeq];
                return { eco, name };
            }
        }
        return { eco: 'A00', name: 'Irregular Opening' };
    }

    /**
     * Determine if a move at `ply` is part of recognized book opening theory.
     * @param {string[]} sanMoves
     * @param {number} ply - 1-indexed ply
     * @returns {boolean}
     */
    function isBookMove(sanMoves, ply) {
        if (ply > 16 || !sanMoves || sanMoves.length === 0) {
            return false;
        }
        const currentSeq = sanMoves.slice(0, ply).join(' ');
        for (const openingSeq of Object.keys(COMMON_OPENINGS)) {
            if (openingSeq.startsWith(currentSeq)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Detect opening principle violations on moves 1-10:
     * 1. Early queen sorties.
     * 2. Moving the same minor piece twice without development.
     * @param {object} boardBefore - chess.js instance before the move
     * @param {object} move - move object { from, to, piece, ... }
     * @param {number} ply - 1-indexed ply
     * @returns {string|null}
     */
    function detectOpeningPrincipleViolation(boardBefore, move, ply) {
        if (ply > 16 || !move) return null;

        const piece = boardBefore.get(move.from);
        if (!piece) return null;

        const color = boardBefore.turn();
        const homeRank = (color === 'w' ? 1 : 8);
        const fromRank = parseInt(move.from.charAt(1));

        // 1. Early Queen development (ply <= 6)
        if (piece.type === 'q' && ply <= 6) {
            const isCapture = !!boardBefore.get(move.to);
            const inCheck = boardBefore.in_check();
            if (!isCapture && !inCheck) {
                return "developing the Queen too early, leaving it vulnerable to minor piece harassment";
            }
        }

        // 2. Moving the same piece twice in first 12 plies
        if ((piece.type === 'n' || piece.type === 'b') && ply <= 12) {
            if (fromRank !== homeRank) {
                const isCapture = !!boardBefore.get(move.to);
                if (!isCapture) {
                    const pieceName = (piece.type === 'n' ? 'knight' : 'bishop');
                    return `moving the same ${pieceName} twice in the opening instead of developing other pieces`;
                }
            }
        }

        return null;
    }

    return {
        COMMON_OPENINGS,
        identifyOpening,
        isBookMove,
        detectOpeningPrincipleViolation
    };
}));
