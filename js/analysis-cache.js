/**
 * analysis-cache.js - Local Storage LRU cache for game analysis in WhyBlunder
 * Limits cache to 5 recent games.
 */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AnalysisCache = factory();
    }
}(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    const STORAGE_KEY = 'whyblunder_analysis_cache_v1';
    const MAX_ENTRIES = 5;

    function getStorage() {
        if (typeof localStorage !== 'undefined') {
            return localStorage;
        }
        return null;
    }

    /**
     * Extracts canonical move sequence / fingerprint from PGN text.
     * Strips headers, clocks, comments, recursive variations, move numbers, and normalizes whitespace.
     */
    function extractPgnFingerprint(rawPgn) {
        if (!rawPgn || typeof rawPgn !== 'string') return '';
        let text = rawPgn;
        // Strip PGN headers [Key "Value"]
        text = text.replace(/\[[^\]]*\]/g, ' ');
        // Strip comments { ... }
        text = text.replace(/\{[^}]*\}/g, ' ');
        // Strip recursive variations ( ... )
        text = text.replace(/\([^)]*\)/g, ' ');
        // Strip NAG annotations like $1, $14
        text = text.replace(/\$\d+/g, ' ');
        // Strip game results 1-0, 0-1, 1/2-1/2, *
        text = text.replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ');
        // Strip move numbers like 1., 1..., 24.
        text = text.replace(/\b\d+\s*\.+/g, ' ');
        // Strip move annotations (!, ?)
        text = text.replace(/[!?]/g, '');
        // Collapse spaces
        text = text.replace(/\s+/g, ' ').trim();
        return text;
    }

    /**
     * Generates a stable hash code for key lookup
     */
    function hashKey(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Extracts Lichess game ID from URL or raw ID, stripping trailing /white, #move, query params.
     */
    function extractLichessId(candidate) {
        if (!candidate || typeof candidate !== 'string') return null;
        const trimmed = candidate.trim();
        // If it clearly contains standard multi-line PGN and does not start with http/lichess.org
        if ((trimmed.includes('[Event ') || trimmed.includes('1. e4') || trimmed.includes('1. d4')) && !trimmed.startsWith('http') && !trimmed.startsWith('lichess.org')) {
            return null;
        }
        // Match lichess URL format: lichess.org/{gameId}
        const urlMatch = trimmed.match(/lichess\.org\/(?:embed\/game\/)?([a-zA-Z0-9]{8})([a-zA-Z0-9]{4})?/i);
        if (urlMatch) return urlMatch[1];
        // Match hash/query format: #/ID or #ID
        const hashMatch = trimmed.match(/[#?&](?:game=|id=)?\/?([a-zA-Z0-9]{8})([a-zA-Z0-9]{4})?/i);
        if (hashMatch && !/^\d+$/.test(hashMatch[1])) {
            return hashMatch[1];
        }
        // Standalone 8 or 12 character alphanumeric ID (not purely numeric)
        const cleanId = trimmed.split(/[/\\?#]/)[0];
        if (/^[a-zA-Z0-9]{8}([a-zA-Z0-9]{4})?$/.test(cleanId) && !/^\d+$/.test(cleanId)) {
            return cleanId.substring(0, 8);
        }
        return null;
    }

    /**
     * Extracts Chess.com numeric game ID from URL or raw ID, stripping trailing /white, #move, query params.
     */
    function extractChessComId(candidate) {
        if (!candidate || typeof candidate !== 'string') return null;
        const trimmed = candidate.trim();
        // If it clearly contains standard multi-line PGN and does not start with http/chess.com
        if ((trimmed.includes('[Event ') || trimmed.includes('1. e4') || trimmed.includes('1. d4')) && !trimmed.startsWith('http') && !trimmed.includes('chess.com')) {
            return null;
        }
        // Match chess.com URL: chess.com/(?:analysis/)?(?:game/)?(?:live|daily)/(\d+) or similar
        const urlMatch = trimmed.match(/chess\.com\/(?:[a-zA-Z0-9_.-]+\/)*(?:live|daily|game)\/(\d+)/i);
        if (urlMatch) return urlMatch[1];
        // Match query or hash param: ?game=123 or #game=123 or #chesscom=123
        const paramMatch = trimmed.match(/[#?&](?:game=|id=|chesscom=|cc=)?\/?(\d{8,14})/i);
        if (paramMatch) return paramMatch[1];
        // Standalone numeric ID (8 to 14 digits)
        const cleanId = trimmed.split(/[/\\?#]/)[0];
        if (/^\d{8,14}$/.test(cleanId)) {
            return cleanId;
        }
        return null;
    }

    class AnalysisCache {
        constructor(storage = null, maxEntries = MAX_ENTRIES) {
            this.storage = storage || getStorage();
            this.maxEntries = maxEntries;
        }

        /**
         * Loads all cached game records from storage
         * @returns {Array<object>}
         */
        getAll() {
            if (!this.storage) return [];
            try {
                const raw = this.storage.getItem(STORAGE_KEY);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                console.warn('AnalysisCache: Error reading cache:', e);
                return [];
            }
        }

        /**
         * Saves cached game records array to storage
         */
        saveAll(entries) {
            if (!this.storage) return false;
            try {
                const trimmed = entries.slice(0, this.maxEntries);
                this.storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
                return true;
            } catch (e) {
                console.warn('AnalysisCache: Error writing cache (quota exceeded?), trimming older entries:', e);
                try {
                    const half = entries.slice(0, Math.max(1, Math.floor(this.maxEntries / 2)));
                    this.storage.setItem(STORAGE_KEY, JSON.stringify(half));
                    return true;
                } catch (e2) {
                    return false;
                }
            }
        }

        /**
         * Retrieves a cached analysis result if available and depth is sufficient.
         * Moves the hit entry to the top of MRU.
         * @param {string} pgn - Raw PGN or Lichess URL / ID
         * @param {number} [targetDepth=14] - Minimum required Stockfish analysis depth
         * @returns {object|null} Cached entry or null
         */
        get(pgn, targetDepth = 14) {
            if (!pgn) return null;
            const entries = this.getAll();
            if (entries.length === 0) return null;

            const fingerprint = extractPgnFingerprint(pgn);
            const lichessId = extractLichessId(pgn);
            const chessComId = extractChessComId(pgn);

            const matchIndex = entries.findIndex(entry => {
                if (lichessId && entry.lichessId && entry.lichessId.toLowerCase() === lichessId.toLowerCase()) {
                    return true;
                }
                if (chessComId && entry.chessComId && entry.chessComId === chessComId) {
                    return true;
                }
                if (fingerprint && entry.fingerprint && entry.fingerprint === fingerprint) {
                    return true;
                }
                return false;
            });

            if (matchIndex === -1) return null;

            const entry = entries[matchIndex];

            // If targetDepth specified, verify cached depth is sufficient
            if (targetDepth && entry.depth && entry.depth < targetDepth) {
                return null;
            }

            // Update timestamp & move to front (LRU/MRU)
            entry.timestamp = Date.now();
            entries.splice(matchIndex, 1);
            entries.unshift(entry);
            this.saveAll(entries);

            return entry;
        }

        /**
         * Saves game analysis to cache.
         * @param {string} pgn - PGN text
         * @param {number} depth - Analysis depth
         * @param {object} analysisResult - { game_info, moves }
         * @param {string} [sourceId] - Optional lichess or chess.com ID
         */
        set(pgn, depth, analysisResult, sourceId = null) {
            if (!pgn || !analysisResult || !analysisResult.moves || analysisResult.moves.length === 0) {
                return false;
            }

            const entries = this.getAll();
            const fingerprint = extractPgnFingerprint(pgn);
            const resolvedLichessId = extractLichessId(sourceId) || extractLichessId(pgn);
            const resolvedChessComId = extractChessComId(sourceId) || extractChessComId(pgn);

            // Filter out existing matching entry
            const filtered = entries.filter(entry => {
                if (resolvedLichessId && entry.lichessId && entry.lichessId.toLowerCase() === resolvedLichessId.toLowerCase()) {
                    return false;
                }
                if (resolvedChessComId && entry.chessComId && entry.chessComId === resolvedChessComId) {
                    return false;
                }
                if (fingerprint && entry.fingerprint && entry.fingerprint === fingerprint) {
                    return false;
                }
                return true;
            });

            const newEntry = {
                id: hashKey(fingerprint + '_' + depth),
                fingerprint: fingerprint,
                lichessId: resolvedLichessId || null,
                chessComId: resolvedChessComId || null,
                depth: depth || 18,
                timestamp: Date.now(),
                game_info: analysisResult.game_info || {},
                moves: analysisResult.moves || []
            };

            filtered.unshift(newEntry);
            return this.saveAll(filtered);
        }

        /**
         * Clears all cached analyses
         */
        clear() {
            if (!this.storage) return;
            try {
                this.storage.removeItem(STORAGE_KEY);
            } catch (e) {}
        }

        /**
         * Returns number of currently cached games
         */
        count() {
            return this.getAll().length;
        }
    }

    const defaultInstance = new AnalysisCache();
    defaultInstance.AnalysisCache = AnalysisCache;
    defaultInstance.extractPgnFingerprint = extractPgnFingerprint;
    defaultInstance.extractLichessId = extractLichessId;
    defaultInstance.extractChessComId = extractChessComId;

    return defaultInstance;
}));
