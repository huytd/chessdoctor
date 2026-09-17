/**
 * chess-evaluator.js - Score evaluation, win probability, and move classification for WhyBlunder.
 * Compatible with Browser and Node.js.
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ChessEvaluator = factory();
    }
}(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    const MATE_SCORE_CP = 10000;

    /**
     * Safely convert a score object or value to centipawns.
     * Handles mate scores: positive mate -> +10000 - dist*10, negative mate -> -10000 - dist*10.
     * @param {number|object} score - centipawn number or { cp, mate } object
     * @returns {number} centipawns
     */
    function scoreToCp(score) {
        if (score === null || score === undefined) return 0;
        if (typeof score === 'number') return score;
        if (typeof score === 'object') {
            if (score.mate !== undefined && score.mate !== null) {
                const m = score.mate;
                if (m === 0) return 0;
                return m > 0 ? (MATE_SCORE_CP - m * 10) : (-MATE_SCORE_CP - m * 10);
            }
            if (score.cp !== undefined && score.cp !== null) {
                return score.cp;
            }
        }
        return 0;
    }

    /**
     * Convert centipawns to win probability (0.0 to 1.0) using logistic model.
     * WP = 1 / (1 + 10^(-cp / 400))
     * @param {number} cp
     * @returns {number}
     */
    function cpToWinProb(cp) {
        const clamped = Math.max(-MATE_SCORE_CP, Math.min(MATE_SCORE_CP, cp));
        return 1.0 / (1.0 + Math.pow(10.0, -clamped / 400.0));
    }

    /**
     * Format a score object or CP number into readable notation (+1.25, -0.40, M2, -M4).
     * @param {number|object} score
     * @param {string} pov - 'w' or 'b'
     * @returns {string}
     */
    function formatScore(score, pov = 'w') {
        let isWhitePov = (pov === 'w' || pov === 'white');
        if (typeof score === 'object' && score !== null) {
            if (score.mate !== undefined && score.mate !== null) {
                const m = isWhitePov ? score.mate : -score.mate;
                return m > 0 ? `M${m}` : `-M${Math.abs(m)}`;
            }
            const cpVal = score.cp !== undefined ? score.cp : 0;
            const signedCp = isWhitePov ? cpVal : -cpVal;
            const sign = signedCp >= 0 ? '+' : '';
            return `${sign}${(signedCp / 100.0).toFixed(2)}`;
        }
        if (typeof score === 'number') {
            const signedCp = isWhitePov ? score : -score;
            const sign = signedCp >= 0 ? '+' : '';
            return `${sign}${(signedCp / 100.0).toFixed(2)}`;
        }
        return '+0.00';
    }

    /**
     * Classify move based on win probability difference and tactical context.
     * @param {number} wpBefore - Win probability before the move (from mover's perspective)
     * @param {number} wpAfter - Win probability after the move (from mover's perspective)
     * @param {object} options
     * @returns {{ uiQuality: string, detailedQuality: string, wpLoss: number }}
     */
    function classifyMove(wpBefore, wpAfter, options = {}) {
        const {
            playedIsBest = false,
            isBook = false,
            isSacrifice = false,
            isOnlyMove = false,
            mateMissed = false
        } = options;

        if (isBook) {
            return { uiQuality: 'good move', detailedQuality: 'book', wpLoss: 0.0 };
        }

        const wpLoss = Math.max(0.0, wpBefore - wpAfter);

        if (playedIsBest) {
            if (isSacrifice && wpAfter >= 0.60) {
                return { uiQuality: 'good move', detailedQuality: 'brilliant', wpLoss };
            }
            if (isOnlyMove && wpAfter >= 0.50) {
                return { uiQuality: 'good move', detailedQuality: 'great', wpLoss };
            }
            if (wpLoss <= 0.01) {
                return { uiQuality: 'good move', detailedQuality: 'best', wpLoss };
            }
            return { uiQuality: 'good move', detailedQuality: 'excellent', wpLoss };
        }

        // Heavy winning simplification safeguard
        if (wpBefore >= 0.95 && wpAfter >= 0.90) {
            if (wpLoss < 0.15) {
                return { uiQuality: 'good move', detailedQuality: 'good', wpLoss };
            } else {
                return { uiQuality: 'inaccuracy', detailedQuality: 'inaccuracy', wpLoss };
            }
        }

        // Missed win
        if ((wpBefore >= 0.85 && wpAfter < 0.55) || mateMissed) {
            return { uiQuality: 'blunder', detailedQuality: 'missed win', wpLoss };
        }

        if (wpLoss >= 0.22) {
            return { uiQuality: 'blunder', detailedQuality: 'blunder', wpLoss };
        } else if (wpLoss >= 0.10) {
            return { uiQuality: 'mistake', detailedQuality: 'mistake', wpLoss };
        } else if (wpLoss >= 0.04) {
            return { uiQuality: 'inaccuracy', detailedQuality: 'inaccuracy', wpLoss };
        } else if (wpLoss <= 0.015) {
            return { uiQuality: 'good move', detailedQuality: 'excellent', wpLoss };
        } else {
            return { uiQuality: 'good move', detailedQuality: 'good', wpLoss };
        }
    }

    /**
     * Determine if a move is a key moment in the game (blunder, mistake, inaccuracy, missed win, brilliant, great, or major tactical event).
     * @param {object} move
     * @returns {boolean}
     */
    function isKeyMoment(move) {
        if (!move) return false;
        const q = (move.detailed_quality || move.quality || '').toLowerCase();
        if (['blunder', 'mistake', 'inaccuracy', 'missed win', 'miss', 'brilliant', 'great'].includes(q)) {
            return true;
        }
        if (typeof move.win_prob_loss === 'number' && move.win_prob_loss >= 0.10) {
            return true;
        }
        if (Array.isArray(move.tags) && move.tags.length > 0) {
            const keyTag = move.tags.some(tag => {
                const t = tag.toLowerCase();
                return t.includes('miss') || t.includes('fork') || t.includes('hanging') || t.includes('tactic') || t.includes('checkmate') || t.includes('trapped');
            });
            if (keyTag) return true;
        }
        return false;
    }

    return {
        MATE_SCORE_CP,
        scoreToCp,
        cpToWinProb,
        formatScore,
        classifyMove,
        isKeyMoment
    };
}));
