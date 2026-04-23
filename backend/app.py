import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from db import init_db, get_or_create_user, save_project, get_projects
from data import fetch_calgary_buildings
from llm import parse_query_with_llm

app = Flask(__name__)
CORS(app)
import threading

def _warm_cache():
    with app.app_context():
        get_buildings()

# Pre-fetch buildings in background when server starts
threading.Thread(target=_warm_cache, daemon=True).start()
# Cache buildings so we don't re-fetch every request

_buildings_cache = None

def get_buildings():
    global _buildings_cache
    if _buildings_cache is None:
        print("Fetching buildings from OpenStreetMap...")
        _buildings_cache = fetch_calgary_buildings()
        print(f"Loaded {len(_buildings_cache)} buildings")
    return _buildings_cache

@app.route("/api/buildings", methods=["GET"])
def buildings():
    try:
        data = get_buildings()
        return jsonify({"buildings": data, "count": len(data)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/query", methods=["POST"])
def query():
    try:
        body = request.get_json()
        user_query = body.get("query", "")
        if not user_query:
            return jsonify({"error": "No query provided"}), 400
        buildings = get_buildings()
        result = parse_query_with_llm(user_query, buildings)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/user", methods=["POST"])
def create_user():
    try:
        body = request.get_json()
        username = body.get("username", "").strip()
        if not username:
            return jsonify({"error": "Username required"}), 400
        user_id = get_or_create_user(username)
        return jsonify({"user_id": user_id, "username": username})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/projects", methods=["GET"])
def list_projects():
    try:
        user_id = request.args.get("user_id")
        if not user_id:
            return jsonify({"error": "user_id required"}), 400
        projects = get_projects(int(user_id))
        return jsonify({"projects": projects})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/projects", methods=["POST"])
def create_project():
    try:
        body = request.get_json()
        user_id = body.get("user_id")
        name = body.get("name", "").strip()
        filters = body.get("filters", {})
        if not user_id or not name:
            return jsonify({"error": "user_id and name required"}), 400
        project_id = save_project(int(user_id), name, filters)
        return jsonify({"project_id": project_id, "name": name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/api/projects/<int:project_id>", methods=["DELETE"])
def delete_project_route(project_id):
    try:
        from db import delete_project
        delete_project(project_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)