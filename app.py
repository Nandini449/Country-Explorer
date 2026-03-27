import os
import sqlite3
import requests
from flask import Flask, jsonify, request, render_template, g

app = Flask(__name__)
DATABASE = "favorites.db"


# ── Database helpers ──────────────────────────────────────────────────────────

def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db


@app.teardown_appcontext
def close_db(exception):
    db = getattr(g, "_database", None)
    if db is not None:
        db.close()


def init_db():
    with app.app_context():
        db = get_db()
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS favorites (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                name      TEXT    NOT NULL UNIQUE,
                capital   TEXT,
                population INTEGER,
                flag_url  TEXT,
                region    TEXT
            )
            """
        )
        db.commit()


# ── Page route ────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ── Country API ───────────────────────────────────────────────────────────────

@app.route("/api/country/<name>")
def get_country(name):
    try:
        resp = requests.get(
            f"https://restcountries.com/v3.1/name/{name}",
            timeout=10,
        )
        if resp.status_code != 200:
            return jsonify({"error": "Country not found"}), 404

        data = resp.json()[0]
        capital_list = data.get("capital", [])
        country = {
            "name":       data["name"]["common"],
            "official":   data["name"]["official"],
            "capital":    capital_list[0] if capital_list else "N/A",
            "population": data.get("population", 0),
            "region":     data.get("region", "N/A"),
            "subregion":  data.get("subregion", "N/A"),
            "flag_url":   data["flags"]["png"],
            "flag_alt":   data["flags"].get("alt", ""),
            "languages":  list(data.get("languages", {}).values()),
            "currencies": [
                v["name"] for v in data.get("currencies", {}).values()
            ],
            "area":       data.get("area", 0),
            "timezones":  data.get("timezones", []),
        }
        return jsonify(country)
    except requests.RequestException:
        return jsonify({"error": "Failed to reach REST Countries API"}), 502


# ── ISS API ───────────────────────────────────────────────────────────────────

@app.route("/api/iss")
def get_iss():
    try:
        resp = requests.get("http://api.open-notify.org/iss-now.json", timeout=10)
        data = resp.json()
        pos = data["iss_position"]
        return jsonify(
            {
                "latitude":  float(pos["latitude"]),
                "longitude": float(pos["longitude"]),
                "timestamp": data["timestamp"],
            }
        )
    except requests.RequestException:
        return jsonify({"error": "Failed to reach ISS API"}), 502


# ── Favorites CRUD ────────────────────────────────────────────────────────────

@app.route("/api/favorites", methods=["GET"])
def list_favorites():
    db = get_db()
    rows = db.execute("SELECT * FROM favorites ORDER BY name").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/favorites", methods=["POST"])
def add_favorite():
    data = request.get_json()
    required = {"name", "capital", "population", "flag_url", "region"}
    if not data or not required.issubset(data):
        return jsonify({"error": "Missing fields"}), 400

    db = get_db()
    try:
        db.execute(
            "INSERT INTO favorites (name, capital, population, flag_url, region) "
            "VALUES (?, ?, ?, ?, ?)",
            (data["name"], data["capital"], data["population"],
             data["flag_url"], data["region"]),
        )
        db.commit()
        return jsonify({"message": f"{data['name']} added to favorites"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Already in favorites"}), 409


@app.route("/api/favorites/<int:fav_id>", methods=["DELETE"])
def delete_favorite(fav_id):
    db = get_db()
    db.execute("DELETE FROM favorites WHERE id = ?", (fav_id,))
    db.commit()
    return jsonify({"message": "Removed from favorites"})


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)

init_db()
