
from flask import Flask, jsonify, request, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from pathlib import Path
from datetime import date, datetime, timedelta
import sqlite3
import os

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "form.db"

app.secret_key = os.environ.get(
    "FORM_SECRET_KEY",
    "dev-only-change-this-secret-before-deployment"
)

POINTS_PER_WORKOUT = 20
WEEKLY_WORKOUT_GOAL = 3
FREE_TRAINING_COST = 1000


# ==================================================
# DATABASE
# ==================================================

def get_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS workouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS exercises (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                weight REAL DEFAULT 0,
                reps INTEGER DEFAULT 0,
                sets INTEGER DEFAULT 0,
                FOREIGN KEY (workout_id)
                    REFERENCES workouts(id)
                    ON DELETE CASCADE
            )
        """)

        # Журнал начисления и списания баллов.
        # Записи не удаляются при удалении тренировки.
        db.execute("""
            CREATE TABLE IF NOT EXISTS points_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                delta INTEGER NOT NULL,
                reason TEXT NOT NULL,
                workout_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE (user_id, workout_id)
            )
        """)

        # История получения наград.
        db.execute("""
            CREATE TABLE IF NOT EXISTS rewards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                reward_type TEXT NOT NULL,
                points_cost INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'available',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        # Миграция существующих данных:
        # за старые тренировки начисляются баллы один раз.
        # Повторный запуск init_db не создаёт дубликаты.
        db.execute("""
            INSERT INTO points_ledger (
                user_id,
                delta,
                reason,
                workout_id
            )
            SELECT
                w.user_id,
                ?,
                'workout_completed',
                w.id
            FROM workouts w
            WHERE NOT EXISTS (
                SELECT 1
                FROM points_ledger p
                WHERE p.user_id = w.user_id
                AND p.workout_id = w.id
            )
        """, (POINTS_PER_WORKOUT,))


# ==================================================
# HELPERS
# ==================================================

def logged_in_user_id():
    return session.get("user_id")


def public_user(user):
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"]
    }


def error_response(message, status=400):
    return jsonify({"message": message}), status


def validate_exercises(exercises):
    if not isinstance(exercises, list):
        raise ValueError("Упражнения должны быть списком.")

    prepared = []

    for exercise in exercises:
        if not isinstance(exercise, dict):
            raise ValueError("Неверный формат упражнения.")

        name = str(exercise.get("name", "")).strip()

        if not name:
            raise ValueError(
                "У каждого упражнения должно быть название."
            )

        try:
            weight = float(exercise.get("weight", 0) or 0)
            reps = int(exercise.get("reps", 0) or 0)
            sets = int(exercise.get("sets", 0) or 0)
        except (ValueError, TypeError, OverflowError):
            raise ValueError(
                "Проверь вес, повторения и подходы."
            )

        if not all(
            value >= 0 for value in (weight, reps, sets)
        ):
            raise ValueError(
                "Значения не могут быть отрицательными."
            )

        if weight > 100000 or reps > 100000 or sets > 10000:
            raise ValueError("Слишком большие значения.")

        prepared.append((name, weight, reps, sets))

    return prepared


def workout_to_dict(db, workout):
    exercises = db.execute("""
        SELECT id, name, weight, reps, sets
        FROM exercises
        WHERE workout_id = ?
        ORDER BY id
    """, (workout["id"],)).fetchall()

    return {
        "id": workout["id"],
        "name": workout["name"],
        "notes": workout["notes"],
        "created_at": workout["created_at"],
        "exercises": [
            {
                "id": exercise["id"],
                "name": exercise["name"],
                "weight": exercise["weight"],
                "reps": exercise["reps"],
                "sets": exercise["sets"]
            }
            for exercise in exercises
        ]
    }


def find_owned_workout(db, workout_id, user_id):
    return db.execute("""
        SELECT id, user_id, name, notes, created_at
        FROM workouts
        WHERE id = ? AND user_id = ?
    """, (workout_id, user_id)).fetchone()


def get_points_balance(db, user_id):
    result = db.execute("""
        SELECT COALESCE(SUM(delta), 0)
        FROM points_ledger
        WHERE user_id = ?
    """, (user_id,)).fetchone()

    return max(0, int(result[0]))


def get_weekly_statistics(db, user_id):
    rows = db.execute("""
        SELECT created_at
        FROM workouts
        WHERE user_id = ?
        ORDER BY created_at DESC
    """, (user_id,)).fetchall()

    today = date.today()
    current_monday = today - timedelta(days=today.weekday())

    weekly_counts = {}

    for row in rows:
        raw_date = str(row["created_at"])[:10]

        try:
            workout_date = date.fromisoformat(raw_date)
        except ValueError:
            continue

        monday = workout_date - timedelta(
            days=workout_date.weekday()
        )

        weekly_counts[monday] = (
            weekly_counts.get(monday, 0) + 1
        )

    this_week_count = weekly_counts.get(current_monday, 0)

    # Серия считается по неделям с тремя тренировками.
    # Если текущая неделя ещё не завершила цель,
    # серия считается от предыдущей недели.
    if this_week_count >= WEEKLY_WORKOUT_GOAL:
        check_week = current_monday
    else:
        check_week = current_monday - timedelta(days=7)

    streak_weeks = 0

    while weekly_counts.get(check_week, 0) >= WEEKLY_WORKOUT_GOAL:
        streak_weeks += 1
        check_week -= timedelta(days=7)

    return {
        "week_count": this_week_count,
        "weekly_goal": WEEKLY_WORKOUT_GOAL,
        "weekly_goal_completed": (
            this_week_count >= WEEKLY_WORKOUT_GOAL
        ),
        "streak_weeks": streak_weeks
    }


# ==================================================
# PAGES
# ==================================================

@app.route("/")
@app.route("/index.html")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/auth.html")
def auth_page():
    return send_from_directory(BASE_DIR, "auth.html")


@app.route("/cabinet.html")
def cabinet_page():
    return send_from_directory(BASE_DIR, "cabinet.html")


@app.route("/workouts.html")
def workouts_page():
    return send_from_directory(BASE_DIR, "workouts.html")


@app.route("/progress.html")
def progress_page():
    return send_from_directory(BASE_DIR, "progress.html")


@app.route("/history.html")
def history_page():
    return send_from_directory(BASE_DIR, "history.html")


@app.route("/<path:filename>")
def static_files(filename):
    allowed = {
        "style.css",
        "form-pages.css",
        "script.js",
        "auth.js",
        "sport-pages.js",
        "sport.js"
    }

    if filename in allowed and (BASE_DIR / filename).is_file():
        return send_from_directory(BASE_DIR, filename)

    return jsonify({"error": "Not found"}), 404


# ==================================================
# STATUS
# ==================================================

@app.route("/api/status")
def status():
    return jsonify({"status": "ok"})


# ==================================================
# REGISTER
# ==================================================

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not name or not email or not password:
        return error_response("Заполни все поля.")

    if len(password) < 6:
        return error_response(
            "Пароль должен содержать минимум 6 символов."
        )

    if len(name) > 100 or len(email) > 254:
        return error_response("Слишком длинные данные.")

    password_hash = generate_password_hash(password)

    try:
        with get_db() as db:
            cursor = db.execute("""
                INSERT INTO users (name, email, password_hash)
                VALUES (?, ?, ?)
            """, (name, email, password_hash))

            user = db.execute(
                "SELECT * FROM users WHERE id = ?",
                (cursor.lastrowid,)
            ).fetchone()

        session.clear()
        session["user_id"] = user["id"]

        return jsonify({
            "message": "Регистрация успешна.",
            "user": public_user(user)
        }), 201

    except sqlite3.IntegrityError:
        return error_response(
            "Аккаунт с такой почтой уже существует.",
            409
        )


# ==================================================
# LOGIN / CURRENT USER / LOGOUT
# ==================================================

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    with get_db() as db:
        user = db.execute(
            "SELECT * FROM users WHERE email = ?",
            (email,)
        ).fetchone()

    if not user or not check_password_hash(
        user["password_hash"], password
    ):
        return error_response(
            "Неверная почта или пароль.",
            401
        )

    session.clear()
    session["user_id"] = user["id"]

    return jsonify({
        "message": "Вход выполнен.",
        "user": public_user(user)
    })


@app.route("/api/me", methods=["GET"])
def current_user():
    user_id = logged_in_user_id()

    if user_id is None:
        return jsonify({"user": None})

    with get_db() as db:
        user = db.execute(
            "SELECT * FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

    if user is None:
        session.clear()
        return jsonify({"user": None})

    return jsonify({"user": public_user(user)})


@app.route("/api/me", methods=["PUT"])
def update_current_user():
    user_id = logged_in_user_id()

    if user_id is None:
        return error_response(
            "Сначала войди в аккаунт.",
            401
        )

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return error_response("Некорректные данные.")

    name = str(data.get("name", "")).strip()

    if not name:
        return error_response("Имя не может быть пустым.")

    if len(name) > 100:
        return error_response(
            "Имя не должно быть длиннее 100 символов."
        )

    with get_db() as db:
        cursor = db.execute("""
            UPDATE users
            SET name = ?
            WHERE id = ?
        """, (name, user_id))

        if cursor.rowcount == 0:
            session.clear()
            return error_response(
                "Пользователь не найден.",
                404
            )

        user = db.execute("""
            SELECT id, name, email
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

    return jsonify({
        "message": "Профиль обновлён.",
        "user": public_user(user)
    })


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Вы вышли из аккаунта."})


# ==================================================
# WORKOUTS: READ
# ==================================================

@app.route("/api/workouts", methods=["GET"])
def get_workouts():
    user_id = logged_in_user_id()

    if user_id is None:
        return error_response(
            "Сначала войди в аккаунт.",
            401
        )

    with get_db() as db:
        workouts = db.execute("""
            SELECT id, user_id, name, notes, created_at
            FROM workouts
            WHERE user_id = ?
            ORDER BY id DESC
        """, (user_id,)).fetchall()

        result = [
            workout_to_dict(db, workout)
            for workout in workouts
        ]

    return jsonify({"workouts": result})


# ==================================================
# WORKOUTS: CREATE
# ==================================================

@app.route("/api/workouts", methods=["POST"])
def create_workout():
    user_id = logged_in_user_id()

    if user_id is None:
        return error_response(
            "Сначала войди в аккаунт.",
            401
        )

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    notes = str(data.get("notes", "")).strip()

    if not name:
        return error_response("Укажи название тренировки.")

    if len(name) > 150 or len(notes) > 5000:
        return error_response(
            "Слишком длинное название или заметка."
        )

    exercises = data.get("exercises")

    if exercises is None:
        exercise_name = str(
            data.get("exerciseName", data.get("exercise_name", ""))
        ).strip()

        exercises = []

        if exercise_name:
            exercises = [{
                "name": exercise_name,
                "weight": data.get("weight", 0),
                "reps": data.get("reps", 0),
                "sets": data.get("sets", 0)
            }]

    try:
        prepared = validate_exercises(exercises)
    except ValueError as error:
        return error_response(str(error))

    with get_db() as db:
        cursor = db.execute("""
            INSERT INTO workouts (user_id, name, notes)
            VALUES (?, ?, ?)
        """, (user_id, name, notes))

        workout_id = cursor.lastrowid

        for exercise in prepared:
            db.execute("""
                INSERT INTO exercises
                    (workout_id, name, weight, reps, sets)
                VALUES (?, ?, ?, ?, ?)
            """, (workout_id, *exercise))

        # Баллы начисляются сервером вместе с сохранением.
        # UNIQUE(user_id, workout_id) не даёт начислить их
        # повторно за одну и ту же тренировку.
        db.execute("""
            INSERT INTO points_ledger (
                user_id, delta, reason, workout_id
            )
            VALUES (?, ?, 'workout_completed', ?)
        """, (user_id, POINTS_PER_WORKOUT, workout_id))

        points_balance = get_points_balance(db, user_id)

    return jsonify({
        "message": "Тренировка сохранена.",
        "workout_id": workout_id,
        "points_earned": POINTS_PER_WORKOUT,
        "points": points_balance
    }), 201


# ==================================================
# WORKOUTS: UPDATE
# ==================================================

@app.route("/api/workouts/<int:workout_id>", methods=["PUT"])
def update_workout(workout_id):
    user_id = logged_in_user_id()

    if user_id is None:
        return error_response(
            "Сначала войди в аккаунт.",
            401
        )

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    notes = str(data.get("notes", "")).strip()

    if not name:
        return error_response("Укажи название тренировки.")

    if len(name) > 150 or len(notes) > 5000:
        return error_response(
            "Слишком длинное название или заметка."
        )

    try:
        prepared = validate_exercises(data.get("exercises", []))
    except ValueError as error:
        return error_response(str(error))

    with get_db() as db:
        workout = find_owned_workout(
            db, workout_id, user_id
        )

        if workout is None:
            return error_response(
                "Тренировка не найдена.",
                404
            )

        db.execute("""
            UPDATE workouts
            SET name = ?, notes = ?
            WHERE id = ? AND user_id = ?
        """, (name, notes, workout_id, user_id))

        db.execute(
            "DELETE FROM exercises WHERE workout_id = ?",
            (workout_id,)
        )

        for exercise in prepared:
            db.execute("""
                INSERT INTO exercises
                    (workout_id, name, weight, reps, sets)
                VALUES (?, ?, ?, ?, ?)
            """, (workout_id, *exercise))

    return jsonify({"message": "Тренировка обновлена."})


# ==================================================
# WORKOUTS: DELETE
# ==================================================

@app.route("/api/workouts/<int:workout_id>", methods=["DELETE"])
def delete_workout(workout_id):
    user_id = logged_in_user_id()

    if user_id is None:
        return error_response(
            "Сначала войди в аккаунт.",
            401
        )

    with get_db() as db:
        workout = find_owned_workout(
            db, workout_id, user_id
        )

        if workout is None:
            return error_response(
                "Тренировка не найдена.",
                404
            )

        db.execute(
            "DELETE FROM workouts WHERE id = ? AND user_id = ?",
            (workout_id, user_id)
        )

    return jsonify({"message": "Тренировка удалена."})


# ==================================================
# STATISTICS
# GET /api/stats
# ==================================================

@app.route("/api/stats", methods=["GET"])
def get_stats():
    user_id = logged_in_user_id()

    if user_id is None:
        return error_response(
            "Сначала войди в аккаунт.",
            401
        )

    with get_db() as db:
        workout_count = db.execute("""
            SELECT COUNT(*)
            FROM workouts
            WHERE user_id = ?
        """, (user_id,)).fetchone()[0]

        exercise_count = db.execute("""
            SELECT COUNT(*)
            FROM exercises e
            JOIN workouts w ON w.id = e.workout_id
            WHERE w.user_id = ?
        """, (user_id,)).fetchone()[0]

        total_volume = db.execute("""
            SELECT COALESCE(
                SUM(e.weight * e.reps * e.sets),
                0
            )
            FROM exercises e
            JOIN workouts w ON w.id = e.workout_id
            WHERE w.user_id = ?
        """, (user_id,)).fetchone()[0]

        points = get_points_balance(db, user_id)
        weekly = get_weekly_statistics(db, user_id)

        reward_count = db.execute("""
            SELECT COUNT(*)
            FROM rewards
            WHERE user_id = ?
            AND reward_type = 'free_training'
        """, (user_id,)).fetchone()[0]

    return jsonify({
        "workout_count": workout_count,
        "exercise_count": exercise_count,
        "week_count": weekly["week_count"],
        "weekly_goal": weekly["weekly_goal"],
        "weekly_goal_completed": weekly["weekly_goal_completed"],
        "streak_weeks": weekly["streak_weeks"],
        "points": points,
        "points_per_workout": POINTS_PER_WORKOUT,
        "free_training_cost": FREE_TRAINING_COST,
        "points_to_next_reward": max(
            0, FREE_TRAINING_COST - points
        ),
        "total_volume": round(total_volume, 2),
        "free_training_rewards": reward_count
    })


# ==================================================
# REWARDS: READ
# GET /api/rewards
# ==================================================

# ==================================================
# REWARDS: READ
# GET /api/rewards
# ==================================================

@app.route("/api/rewards", methods=["GET"])
def get_rewards():
    user_id = logged_in_user_id()

    if user_id is None:
        return error_response(
            "Сначала войди в аккаунт.",
            401
        )

    with get_db() as db:
        points = get_points_balance(db, user_id)

        reward_rows = db.execute("""
            SELECT id, reward_type, points_cost, status, created_at
            FROM rewards
            WHERE user_id = ?
            ORDER BY id DESC
        """, (user_id,)).fetchall()

        reward_count = db.execute("""
            SELECT COUNT(*)
            FROM rewards
            WHERE user_id = ?
            AND reward_type = 'free_training'
        """, (user_id,)).fetchone()[0]

    rewards = [
        {
            "id": reward["id"],
            "type": reward["reward_type"],
            "points_cost": reward["points_cost"],
            "status": reward["status"],
            "created_at": reward["created_at"]
        }
        for reward in reward_rows
    ]

    points_cost = FREE_TRAINING_COST
    remaining = max(0, points_cost - points)
    progress = min(
        100,
        points / points_cost * 100
    ) if points_cost > 0 else 100

    return jsonify({
        "points": points,
        "free_training_cost": points_cost,
        "points_to_next_reward": remaining,
        "reward_progress": round(progress, 2),
        "can_claim_reward": points >= points_cost,
        "free_training_rewards": reward_count,
        "rewards": rewards
    }), 200


# ==================================================
# LEADERBOARD: ATTENDANCE STREAK
# GET /api/leaderboard
# ==================================================

@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    user_id = logged_in_user_id()

    if user_id is None:
        return error_response(
            "Сначала войди в аккаунт.",
            401
        )

    with get_db() as db:
        users = db.execute("""
            SELECT id, name
            FROM users
        """).fetchall()

        leaderboard = []

        for user in users:
            weekly = get_weekly_statistics(
                db,
                user["id"]
            )

            leaderboard.append({
                "user_id": user["id"],
                "name": user["name"],
                "streak_weeks": weekly["streak_weeks"],
                "week_count": weekly["week_count"],
                "weekly_goal": weekly["weekly_goal"],
                "weekly_goal_completed": (
                    weekly["weekly_goal_completed"]
                ),
                "is_you": user["id"] == user_id
            })

    leaderboard.sort(
        key=lambda user: (
            -user["streak_weeks"],
            -user["week_count"],
            user["name"].casefold()
        )
    )

    for position, user in enumerate(
        leaderboard,
        start=1
    ):
        user["rank"] = position

    return jsonify({
        "leaderboard": leaderboard,
        "weekly_goal": WEEKLY_WORKOUT_GOAL,
        "total_users": len(leaderboard)
    }), 200


# ==================================================
# REWARDS: CLAIM FREE TRAINING
# POST /api/rewards/claim
# ==================================================

@app.route("/api/rewards/claim", methods=["POST"])
def claim_reward():
    user_id = logged_in_user_id()

    if user_id is None:
        return error_response(
            "Сначала войди в аккаунт.",
            401
        )

    with get_db() as db:
        # Блокируем конкурирующие операции записи,
        # чтобы баллы нельзя было потратить дважды.
        db.execute("BEGIN IMMEDIATE")

        points = get_points_balance(db, user_id)

        if points < FREE_TRAINING_COST:
            return jsonify({
                "message": "Недостаточно баллов для награды.",
                "points": points,
                "required_points": FREE_TRAINING_COST,
                "points_remaining": FREE_TRAINING_COST - points
            }), 400

        # Списание и создание награды выполняются
        # в одной транзакции.
        db.execute("""
            INSERT INTO points_ledger (
                user_id, delta, reason, workout_id
            )
            VALUES (?, ?, 'free_training_claim', NULL)
        """, (user_id, -FREE_TRAINING_COST))

        cursor = db.execute("""
            INSERT INTO rewards (
                user_id, reward_type, points_cost, status
            )
            VALUES (?, 'free_training', ?, 'available')
        """, (user_id, FREE_TRAINING_COST))

        reward_id = cursor.lastrowid
        new_balance = get_points_balance(db, user_id)

    return jsonify({
        "message": "Бесплатная тренировка получена.",
        "reward": {
            "id": reward_id,
            "type": "free_training",
            "points_cost": FREE_TRAINING_COST,
            "status": "available"
        },
        "points": new_balance
    }), 201


# ==================================================
# START SERVER
# ==================================================

if __name__ == "__main__":
    init_db()
    app.run(debug=True)
