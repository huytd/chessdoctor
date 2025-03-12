import argparse
import os
import sys
import json
import tempfile
from flask import Flask, request, jsonify, render_template, send_from_directory
from engine import ChessDoctor

def main():
    parser = argparse.ArgumentParser(description="Run Chess Doctor as a REST API or CLI tool")
    parser.add_argument("--engine", help="Path to Stockfish engine executable (optional, auto-detected if not provided)")
    parser.add_argument("--port", type=int, default=3030, help="Port to run the REST API on (default: 3030)")
    parser.add_argument("--host", default="0.0.0.0", help="Host to run the REST API on (default: 0.0.0.0)")
    parser.add_argument("--cli", action="store_true", help="Run in CLI mode instead of API mode")
    parser.add_argument("--pgn_file", help="Path to the PGN file (required in CLI mode)")
    args = parser.parse_args()
    
    if args.cli:
        # Run in traditional CLI mode
        if not args.pgn_file:
            print("Error: --pgn_file is required when running in CLI mode")
            sys.exit(1)
            
        try:
            chess_doctor = ChessDoctor(args.engine)
            analysis_data = chess_doctor.analyze_game(args.pgn_file)
            print(json.dumps(analysis_data, indent=2))
        except FileNotFoundError as e:
            print(f"Error: {e}")
            print("\nStockfish could not be found automatically. Please make sure Stockfish is installed and either:")
            print("1. Add it to your system PATH")
            print("2. Provide the path using --engine option")
            print("\nInstallation instructions:")
            print("- Linux: sudo apt-get install stockfish (Debian/Ubuntu)")
            print("- macOS: brew install stockfish (using Homebrew)")
            print("- Windows: Download from https://stockfishchess.org/download/ and install")
            sys.exit(1)
    else:
        # Run as a REST API server
        app = Flask(__name__, 
                   static_folder='static',
                   template_folder='templates') 
        
        @app.route('/')
        def index():
            """Serve the index.html page at the root URL"""
            return render_template('index.html')

        @app.route('/<path:path>')
        def serve_static(path):
            """Serve static files from the templates directory"""
            return send_from_directory('templates', path)
        
        @app.route('/api/analyze', methods=['POST'])
        def analyze():
            """Analyze a chess game from PGN data"""
            # Check if PGN data is provided
            if not request.is_json:
                return jsonify({"error": "Request must be JSON"}), 400
                
            data = request.get_json()
            if 'pgn' not in data:
                return jsonify({"error": "Missing 'pgn' field in request"}), 400
                
            pgn_data = data['pgn']
            
            # Write PGN data to a temporary file
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix='.pgn', mode='w') as tmp_file:
                    tmp_file.write(pgn_data)
                    tmp_path = tmp_file.name
                    
                # Analyze the game
                try:
                    chess_doctor = ChessDoctor(args.engine)
                    analysis_data = chess_doctor.analyze_game(tmp_path)
                    
                    # Cleanup
                    os.unlink(tmp_path)
                    
                    return jsonify(analysis_data)
                    
                except Exception as e:
                    return jsonify({"error": f"Analysis failed: {str(e)}"}), 500
                finally:
                    # Ensure temp file is removed
                    if os.path.exists(tmp_path):
                        try:
                            os.unlink(tmp_path)
                        except:
                            pass
                        
            except Exception as e:
                return jsonify({"error": f"Failed to process PGN data: {str(e)}"}), 500
                
        @app.route('/health', methods=['GET'])
        def health():
            return jsonify({"status": "ok"})
        
        # Start the Flask server
        print(f"Starting Chess Doctor API on {args.host}:{args.port}")
        print(f"Web UI available at http://{args.host if args.host != '0.0.0.0' else 'localhost'}:{args.port}/")
        app.run(host=args.host, port=args.port, debug=False)

if __name__ == "__main__":
    main()
