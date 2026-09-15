import argparse
import os
import sys
import json
from flask import Flask, render_template, send_from_directory

def main():
    parser = argparse.ArgumentParser(description="Run Chess Doctor Web App (In-Browser WebAssembly)")
    parser.add_argument("--port", type=int, default=3030, help="Port to run the web server on (default: 3030)")
    parser.add_argument("--host", default="0.0.0.0", help="Host to run the web server on (default: 0.0.0.0)")
    parser.add_argument("--cli", action="store_true", help="Run in CLI mode instead of web server mode")
    parser.add_argument("--engine", help="Path to Stockfish engine executable (only needed for CLI mode)")
    parser.add_argument("--pgn_file", help="Path to the PGN file (required in CLI mode)")
    args = parser.parse_args()
    
    if args.cli:
        # Run in traditional CLI mode with native Stockfish
        if not args.pgn_file:
            print("Error: --pgn_file is required when running in CLI mode")
            sys.exit(1)
            
        try:
            from engine import ChessDoctor
            with ChessDoctor(args.engine) as chess_doctor:
                analysis_data = chess_doctor.analyze_game(args.pgn_file)
                print(json.dumps(analysis_data, indent=2))
        except FileNotFoundError as e:
            print(f"Error: {e}")
            sys.exit(1)
    else:
        # Run web server for In-Browser WebAssembly application
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

        @app.route('/health', methods=['GET'])
        def health():
            return {"status": "ok"}
        
        # Start the Flask server
        print(f"Starting Chess Doctor (In-Browser WebAssembly) on http://{args.host if args.host != '0.0.0.0' else 'localhost'}:{args.port}/")
        app.run(host=args.host, port=args.port, debug=False)

if __name__ == "__main__":
    main()
