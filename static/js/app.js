// Chess Doctor - Frontend Application

document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let board = null;
    let game = new Chess();
    let gameAnalysis = null;
    let currentPly = 0;
    let boardOrientation = 'white';
    
    // DOM elements
    const $board = $('#board');
    const $pgnForm = $('#pgn-form');
    const $pgnInput = $('#pgn-input');
    const $gameInfo = $('#game-info');
    const $moveList = $('#move-list');
    const $currentAnalysis = $('#current-analysis');
    const $loadingModal = new bootstrap.Modal(document.getElementById('loading-modal'));
    
    // Navigation buttons
    const $startBtn = $('#start-btn');
    const $prevBtn = $('#prev-btn');
    const $nextBtn = $('#next-btn');
    const $endBtn = $('#end-btn');
    const $flipBoardBtn = $('#flip-board');
    const $loadExampleBtn = $('#load-example');
    
    // Initialize the board
    function initBoard() {
        const config = {
            draggable: false,
            position: 'start',
            orientation: boardOrientation
        };
        
        // If board exists, destroy it first
        if (board) board.destroy();
        
        // Create new board
        board = Chessboard('board', config);
        
        // Resize board on window resize
        $(window).resize(board.resize);
    }
    
    // Initialize the board
    initBoard();
    
    // Handle form submission
    $pgnForm.on('submit', function(e) {
        e.preventDefault();
        const pgn = $pgnInput.val().trim();
        
        if (!pgn) {
            alert('Please enter a PGN notation');
            return;
        }
        
        // Show loading modal
        $loadingModal.show();
        
        // Send PGN to server for analysis
        fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pgn: pgn })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Hide loading modal
            $loadingModal.hide();
            
            if (data.error) {
                alert('Error: ' + data.error);
                return;
            }
            
            // Store analysis data
            gameAnalysis = data;
            
            // Reset the game and board
            game = new Chess();
            currentPly = 0;
            
            // Display game info
            displayGameInfo(data.game_info);
            
            // Display move list
            displayMoveList(data.moves);
            
            // Reset the board
            board.position('start');
            
            // Enable navigation buttons
            enableNavButtons();
        })
        .catch(error => {
            $loadingModal.hide();
            console.error('Error:', error);
            alert('Error analyzing game: ' + error.message);
        });
    });
    
    // Display game information
    function displayGameInfo(gameInfo) {
        $gameInfo.html(`
            <div class="mb-2">
                <strong>White:</strong> ${gameInfo.white}
            </div>
            <div class="mb-2">
                <strong>Black:</strong> ${gameInfo.black}
            </div>
            <div class="mb-2">
                <strong>Event:</strong> ${gameInfo.event}
            </div>
            <div>
                <strong>Date:</strong> ${gameInfo.date}
            </div>
        `);
    }
    
    // Display move list with buttons
    function displayMoveList(moves) {
        if (!moves || moves.length === 0) {
            $moveList.html('<p>No moves to display</p>');
            return;
        }
        
        let html = '<div class="d-flex flex-wrap">';
        let currentMoveNumber = 0;
        
        moves.forEach((move, index) => {
            if (move.error) {
                html += `<div class="text-danger">Error: ${move.error}</div>`;
                return;
            }
            
            // Add move number for white's moves
            if (move.player === 'White') {
                currentMoveNumber = move.move_number;
                html += `<div class="me-1 mt-1">${currentMoveNumber}.</div>`;
            }
            
            // Add move button with appropriate class based on quality
            const qualityClass = move.quality !== 'good move' ? move.quality.replace(' ', '-') : '';
            html += `<button class="btn btn-sm move-btn ${qualityClass}" data-ply="${move.ply}">${move.move}</button>`;
        });
        
        html += '</div>';
        $moveList.html(html);
        
        // Add click event to move buttons
        $('.move-btn').on('click', function() {
            const ply = parseInt($(this).data('ply'));
            goToMove(ply);
        });
    }
    
    // Display analysis for the current move
    function displayMoveAnalysis(moveData) {
        if (!moveData) {
            $currentAnalysis.html('<p>No analysis available</p>');
            return;
        }
        
        let html = `
            <div class="mb-2">
                <span class="badge ${getMoveQualityBadgeClass(moveData.quality)}">${moveData.quality}</span>
                <span class="ms-2">Evaluation: ${moveData.evaluation}</span>
            </div>
        `;
        
        // If it's not a good move, show the better alternative
        if (moveData.quality !== 'good move' && moveData.best_move) {
            html += `
                <div class="mt-3">
                    <div class="analysis-header">Better move:</div>
                    <span class="best-move">${moveData.best_move}</span>
                </div>
                <div class="explanation">
                    ${moveData.explanation}
                </div>
            `;
        }
        
        $currentAnalysis.html(html);
    }
    
    // Get badge class based on move quality
    function getMoveQualityBadgeClass(quality) {
        switch (quality) {
            case 'blunder': return 'bg-danger';
            case 'mistake': return 'bg-warning text-dark';
            case 'inaccuracy': return 'bg-orange';
            default: return 'bg-success';
        }
    }
    
    // Navigation functions
    function goToMove(ply) {
        if (!gameAnalysis || !gameAnalysis.moves) return;
        
        // Reset the game
        game = new Chess();
        
        // Apply moves up to the selected ply
        for (let i = 0; i < ply; i++) {
            if (i < gameAnalysis.moves.length) {
                const moveData = gameAnalysis.moves[i];
                if (moveData.uci_move) {
                    game.move(moveData.uci_move, { sloppy: true });
                }
            }
        }
        
        // Update the board
        board.position(game.fen());
        
        // Update current ply
        currentPly = ply;
        
        // Highlight the current move in the move list
        $('.move-btn').removeClass('active');
        $(`.move-btn[data-ply="${ply}"]`).addClass('active');
        
        // Display analysis for the current move
        if (ply > 0 && ply <= gameAnalysis.moves.length) {
            displayMoveAnalysis(gameAnalysis.moves[ply - 1]);
        } else {
            $currentAnalysis.html('<p>Initial position</p>');
        }
        
        // Update button states
        updateNavButtonStates();
    }
    
    // Enable navigation buttons
    function enableNavButtons() {
        $startBtn.prop('disabled', false);
        $prevBtn.prop('disabled', false);
        $nextBtn.prop('disabled', false);
        $endBtn.prop('disabled', false);
        
        updateNavButtonStates();
    }
    
    // Update navigation button states based on current position
    function updateNavButtonStates() {
        $startBtn.prop('disabled', currentPly === 0);
        $prevBtn.prop('disabled', currentPly === 0);
        
        const maxPly = gameAnalysis && gameAnalysis.moves ? gameAnalysis.moves.length : 0;
        $nextBtn.prop('disabled', currentPly >= maxPly);
        $endBtn.prop('disabled', currentPly >= maxPly);
    }
    
    // Navigation button click handlers
    $startBtn.on('click', function() {
        goToMove(0);
    });
    
    $prevBtn.on('click', function() {
        if (currentPly > 0) {
            goToMove(currentPly - 1);
        }
    });
    
    $nextBtn.on('click', function() {
        if (gameAnalysis && gameAnalysis.moves && currentPly < gameAnalysis.moves.length) {
            goToMove(currentPly + 1);
        }
    });
    
    $endBtn.on('click', function() {
        if (gameAnalysis && gameAnalysis.moves) {
            goToMove(gameAnalysis.moves.length);
        }
    });
    
    // Flip board orientation
    $flipBoardBtn.on('click', function() {
        boardOrientation = boardOrientation === 'white' ? 'black' : 'white';
        board.orientation(boardOrientation);
    });
    
    // Load example PGN
    $loadExampleBtn.on('click', function() {
        // Example PGN - Immortal Game
        const examplePgn = `[Event "Casual Game"]
[Site "London"]
[Date "1851.??.??"]
[Round "?"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 
9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 
16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 
22. Qf6+ Nxf6 23. Be7# 1-0`;
        
        $pgnInput.val(examplePgn);
    });
}); 