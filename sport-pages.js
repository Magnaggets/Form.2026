
"use strict";

/* ========================================FORM — SPORT PAGES
Тренировки, прогресс, история и каталог
   ========================================= */


/* ---------- API ---------- */

async function sportApiRequest(url, data, method) {
    const options = {
        method: method || (data === undefined ? "GET" : "POST"),
        credentials: "same-origin",
        headers: {}
    };

    if (data !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(data);
    }

    let response;

    try {
        response = await fetch(url, options);
    } catch (error) {
        throw new Error(
            "Не удалось связаться с сервером. Проверь, запущен ли Flask."
        );
    }

    let result;

    try {
        result = await response.json();
    } catch (error) {
        throw new Error("Сервер вернул некорректный ответ.");
    }

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Сессия завершена. Войди в аккаунт заново.");
        }

        throw new Error(
            result.message || result.error || "Ошибка сервера."
        );
    }

    return result;
}


/* ---------- УВЕДОМЛЕНИЯ ---------- */

function showSportMessage(element, message, success = false) {
    if (!element) return;

    element.textContent = message;
    element.style.color = success ? "#d6ff3f" : "#ff6b6b";
}


/* ---------- ЗАГРУЗКА ДАННЫХ ---------- */



/* ---------- ЗАГРУЗКА ДАННЫХ ---------- */


async function getSportData() {
    const results = await Promise.all([
        sportApiRequest("/api/workouts"),
        sportApiRequest("/api/stats"),
        sportApiRequest("/api/rewards")
    ]);

    const workoutsData = results[0];
    const statsData = results[1];
    const rewardsData = results[2];

    if (!workoutsData || !Array.isArray(workoutsData.workouts)) {
        throw new Error("Сервер вернул некорректный список тренировок.");
    }

    if (!statsData || typeof statsData !== "object") {
        throw new Error("Сервер вернул некорректную статистику.");
    }

    if (!rewardsData || !Array.isArray(rewardsData.rewards)) {
        throw new Error("Сервер вернул некорректный список наград.");
    }

    
    return {
        workouts: workoutsData.workouts,
        stats: {
            ...statsData,
            points: rewardsData.points
        },
        rewards: rewardsData.rewards
    };
}


function renderRewards(data) {
    const stats = data.stats || {};
    const rewards = data.rewards || [];

    const points = Number(stats.points) || 0;
    const cost = Number(stats.free_training_cost) || 1000;
    const remaining = Math.max(0, cost - points);
    const progress = cost > 0
        ? Math.min(100, points / cost * 100)
        : 100;

    const balance = document.getElementById("rewardPoints");
    const fill = document.getElementById("rewardProgressFill");
    const track = document.getElementById("rewardProgress");
    const progressText = document.getElementById("rewardProgressText");
    const remainingText = document.getElementById("rewardRemaining");
    const button = document.getElementById("claimRewardButton");
    const list = document.getElementById("rewardList");

    if (balance) {
        balance.textContent = points.toLocaleString("ru-RU");
    }

    if (fill) {
        fill.style.width = progress + "%";
    }

    if (track) {
        track.setAttribute("aria-valuemax", cost);
        track.setAttribute("aria-valuenow", Math.min(points, cost));
    }

    if (progressText) {
        progressText.textContent =
            points.toLocaleString("ru-RU") + " из " +
            cost.toLocaleString("ru-RU") + " баллов";
    }

    if (remainingText) {
        remainingText.textContent = remaining === 0
            ? "Можно получить награду"
            : "Осталось " + remaining.toLocaleString("ru-RU") +
            " баллов";
    }

    if (button) {
        button.disabled = points < cost;
    }

    if (!list) return;

    list.replaceChildren();

    if (rewards.length === 0) {
        const message = document.createElement("p");
        message.className = "muted-text";
        message.textContent = "Наград пока нет.";
        list.appendChild(message);
        return;
    }

    rewards.forEach(function(reward) {
        const item = document.createElement("div");
        item.className = "reward-item";

        const title = document.createElement("p");
        title.textContent = reward.type === "free_training"
            ? "Бесплатная тренировка"
            : "Награда";

        const details = document.createElement("p");
        details.className = "muted-text";
        details.textContent =
            "Статус: " + reward.status +
            " · Стоимость: " + reward.points_cost + " баллов";

        item.append(title, details);
        list.appendChild(item);
    });
}






/* ---------- СТАТИСТИКА ---------- */
function renderWorkoutStats(stats, workouts) {
    const workoutCount = document.getElementById("workoutCount");
    const exerciseCount = document.getElementById("exerciseCount");
    const weekCount = document.getElementById("weekCount");
    const pointsCount = document.getElementById("pointsCount");

    if (workoutCount) {
        workoutCount.textContent =
            stats.workout_count ?? workouts.length;
    }

    if (exerciseCount) {
        exerciseCount.textContent =
            stats.exercise_count ??
            workouts.reduce(function(total, workout) {
                return total + (
                    Array.isArray(workout.exercises)
                        ? workout.exercises.length
                        : 0
                );
            }, 0);
    }

    if (weekCount) {
        weekCount.textContent = stats.week_count ?? 0;
    }

    if (pointsCount) {
        pointsCount.textContent = stats.points ?? 0;
    }
}

/* ---------- ДАТА ---------- */

function parseWorkoutDate(value) {
    if (!value) return null;

    const text = String(value);

    const normalized = text.includes("T")
        ? text
        : text.replace(" ", "T") + "Z";

    const date = new Date(normalized);

    return Number.isNaN(date.getTime()) ? null : date;
}


function formatWorkoutDate(value) {
    if (!value) return "Дата не указана";

    const date = parseWorkoutDate(value);

    if (!date) return String(value);

    return date.toLocaleString("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}


/* ---------- ИСТОРИЯ ТРЕНИРОВОК ---------- */

function renderWorkoutHistory(workouts, container) {
    if (!container) return;

    container.replaceChildren();

    if (!workouts.length) {
        const emptyMessage = document.createElement("p");
        emptyMessage.textContent = "Тренировок пока нет.";
        container.appendChild(emptyMessage);
        return;
    }

    workouts.forEach(function(workout) {
        const card = document.createElement("article");
        card.className = "workout-item saved-workout-card";

        const title = document.createElement("h3");
        title.textContent = workout.name || "Тренировка";

        const date = document.createElement("p");
        date.textContent = formatWorkoutDate(workout.created_at);

        card.append(title, date);

        const exercises = Array.isArray(workout.exercises)
            ? workout.exercises
            : [];

        if (!exercises.length) {
            const emptyExercise = document.createElement("p");
            emptyExercise.textContent = "Упражнения не указаны.";
            card.appendChild(emptyExercise);
        }

        exercises.forEach(function(exercise) {
            const details = document.createElement("p");

            details.textContent =
                (exercise.name || "Упражнение") + ": " +
                (exercise.weight ?? 0) + " кг × " +
                (exercise.reps ?? 0) + " повторений × " +
                (exercise.sets ?? 0) + " подходов";

            card.appendChild(details);
        });

                if (workout.notes) {
            const notes = document.createElement("p");
            notes.textContent = "Заметка: " + workout.notes;
            card.appendChild(notes);
        }

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "delete-workout-button";
        deleteButton.textContent = "Удалить тренировку";

        deleteButton.style.cssText = [
            "margin-top:12px",
            "padding:10px 14px",
            "border:1px solid #ef4444",
            "border-radius:8px",
            "background:transparent",
            "color:#ef4444",
            "cursor:pointer"
        ].join(";");

        deleteButton.addEventListener("click", function() {
            deleteWorkout(workout.id, deleteButton);
        });

        card.appendChild(deleteButton);

        container.appendChild(card);
    });
}

/* ----------- 
чет удаляет надо значит :)\ 
*/



async function deleteWorkout(workoutId, button) {
    if (!window.confirm(
        "Удалить эту тренировку? Это действие нельзя отменить."
    )) {
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Удаление...";

    try {
        await sportApiRequest(
            `/api/workouts/${encodeURIComponent(workoutId)}`,
            undefined,
            "DELETE"
        );

        window.location.reload();
    } catch (error) {
        window.alert(error.message || "Не удалось удалить тренировку.");
        button.disabled = false;
        button.textContent = originalText;
    }
}

















/* ---------- ДОСТИЖЕНИЯ ---------- */

function renderWorkoutAchievements(workouts) {
    const container = document.getElementById("achievements");

    if (!container) return;

    container.replaceChildren();

    const achievements = [
        {
            target: 1,
            name: "Первый шаг",
            description: "Сохрани первую тренировку."
        },
        {
            target: 5,
            name: "Сила привычки",
            description: "Сохрани пять тренировок."
        },
        {
            target: 25,
            name: "Постоянство",
            description: "Сохрани двадцать пять тренировок."
        }
    ];

    achievements.forEach(function(achievement) {
        const item = document.createElement("div");
        item.className = "achievement";

        const star = document.createElement("span");
        star.className = "achievement-star";
        star.textContent =
            workouts.length >= achievement.target ? "★" : "☆";

        const content = document.createElement("div");

        const title = document.createElement("h3");
        title.textContent = achievement.name;

        const description = document.createElement("p");
        description.textContent = achievement.description;

        const progress = document.createElement("p");
        progress.textContent =
            Math.min(workouts.length, achievement.target) +
            " из " + achievement.target;

        content.append(title, description, progress);
        item.append(star, content);

        container.appendChild(item);
    });
}


/* =========================================
   КАТАЛОГ УПРАЖНЕНИЙ
   ========================================= */

const EXERCISE_CATALOG_URL =
    "https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0/api/es/exercises.json";

const EXERCISE_CATALOG_SOURCE =
    "https://github.com/JahelCuadrado/ExerciseGymGifsDB";

const EXERCISE_RESULTS_LIMIT = 24;


/* ---------- НОРМАЛИЗАЦИЯ ТЕКСТА ---------- */

function normalizeExerciseText(value) {
    return String(value || "")
        .toLocaleLowerCase("ru-RU")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ё/g, "е")
        .replace(/[_-]+/g, " ")
        .replace(/[^a-zа-я0-9]+/gi, " ")
        .trim()
        .replace(/\s+/g, " ");
}


function formatExerciseLabel(value) {
    return String(value || "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^./, function(character) {
            return character.toLocaleUpperCase("ru-RU");
        });
}


/* ---------- ПЕРЕВОД ГРУПП МЫШЦ ---------- */

const EXERCISE_MUSCLE_LABELS = {
    chest: "Грудь",
    pecho: "Грудь",
    pectorals: "Грудные мышцы",
    espalda: "Спина",
    back: "Спина",
    lats: "Широчайшие мышцы",
    traps: "Трапеции",
    trapezius: "Трапеции",
    shoulders: "Плечи",
    hombros: "Плечи",
    delts: "Дельтовидные мышцы",
    biceps: "Бицепс",
    bicepses: "Бицепс",
    triceps: "Трицепс",
    forearms: "Предплечья",
    antebrazos: "Предплечья",
    abs: "Пресс",
    abdominals: "Пресс",
    abdominales: "Пресс",
    obliques: "Косые мышцы живота",
    quads: "Квадрицепсы",
    quadriceps: "Квадрицепсы",
    "cuadriceps": "Квадрицепсы",
    hamstrings: "Бицепс бедра",
    femorales: "Бицепс бедра",
    glutes: "Ягодичные мышцы",
    gluteos: "Ягодичные мышцы",
    calves: "Икры",
    pantorrillas: "Икры",
    legs: "Ноги",
    piernas: "Ноги",
    adductors: "Приводящие мышцы",
    abductors: "Отводящие мышцы",
    cardio: "Кардио",
    full_body: "Всё тело",
    neck: "Шея",
    cuello: "Шея",
    waist: "Пресс",
    core: "Мышцы корпуса"
};


function getExerciseMuscleLabel(muscle) {
    const normalized = normalizeExerciseText(muscle);
    const key = normalized.replace(/\s+/g, "_");

    return EXERCISE_MUSCLE_LABELS[key] ||
        EXERCISE_MUSCLE_LABELS[normalized] ||
        formatExerciseLabel(muscle) ||
        "Не указана";
}


/* ---------- ГРУППЫ ДЛЯ ФИЛЬТРА ---------- */

const EXERCISE_MUSCLE_GROUPS = [
    {
        value: "chest",
        label: "Грудь",
        terms: ["chest", "pecho", "pectoral", "pectorals", "грудь"]
    },
    {
        value: "back",
        label: "Спина",
        terms: ["back", "espalda", "lats", "latissimus", "спина"]
    },
    {
        value: "shoulders",
        label: "Плечи",
        terms: ["shoulders", "hombros", "delts", "deltoid", "плечи"]
    },
    {
        value: "biceps",
        label: "Бицепс",
        terms: ["biceps", "bicep", "бицепс"]
    },
    {
        value: "triceps",
        label: "Трицепс",
        terms: ["triceps", "трицепс"]
    },
    {
        value: "forearms",
        label: "Предплечья",
        terms: ["forearms", "antebrazos", "предплечья"]
    },
    {
        value: "abs",
        label: "Пресс",
        terms: [
            "abs", "abdominals", "abdominales", "waist",
            "core", "пресс", "живот"
        ]
    },
    {
        value: "legs",
        label: "Ноги",
        terms: [
            "legs", "piernas", "quads", "quadriceps",
            "hamstrings", "femorales", "ноги", "бедра"
        ]
    },
    {
        value: "glutes",
        label: "Ягодицы",
        terms: ["glutes", "gluteus", "gluteos", "ягодицы"]
    },
    {
        value: "calves",
        label: "Икры",
        terms: ["calves", "calf", "pantorrillas", "икры"]
    },
    {
        value: "cardio",
        label: "Кардио",
        terms: ["cardio", "кардио"]
    },
    {
        value: "full_body",
        label: "Всё тело",
        terms: ["full body", "full_body", "todo el cuerpo", "всё тело"]
    },
    {
        value: "neck",
        label: "Шея",
        terms: ["neck", "cuello", "шея"]
    }
];


function getExerciseGroupKey(value) {
    const normalized = normalizeExerciseText(value);

    if (!normalized) return "";

    for (const group of EXERCISE_MUSCLE_GROUPS) {
        const matches = group.terms.some(function(term) {
            const normalizedTerm = normalizeExerciseText(term);

            return normalized === normalizedTerm ||
                normalized.includes(normalizedTerm);
        });

        if (matches) return group.value;
    }

    return "";
}


/* ---------- ПЕРЕВОД ОБОРУДОВАНИЯ ---------- */

const EXERCISE_EQUIPMENT_TRANSLATIONS = {
    "barbell": "Штанга",
    "barra": "Штанга",
    "dumbbell": "Гантели",
    "mancuernas": "Гантели",
    "body weight": "Собственный вес",
    "bodyweight": "Собственный вес",
    "peso corporal": "Собственный вес",
    "machine": "Тренажёр",
    "máquina": "Тренажёр",
    "cable": "Блок",
    "cables": "Блок",
    "polea": "Блок",
    "resistance band": "Резиновая лента",
    "band": "Резиновая лента",
    "banda elastica": "Резиновая лента",
    "kettlebell": "Гиря",
    "kettlebells": "Гири",
    "pesa rusa": "Гиря",
    "bench": "Скамья",
    "banco": "Скамья",
    "smith machine": "Машина Смита",
    "smith": "Машина Смита",
    "ez bar": "EZ-гриф",
    "ez-bar": "EZ-гриф",
    "medicine ball": "Медбол",
    "stability ball": "Фитбол",
    "foam roller": "Массажный ролик",
    "none": "Без оборудования",
    "other": "Другое"
};


function translateExerciseEquipment(value) {
    const normalized = normalizeExerciseText(value);

    if (!normalized) return "";

    if (EXERCISE_EQUIPMENT_TRANSLATIONS[normalized]) {
        return EXERCISE_EQUIPMENT_TRANSLATIONS[normalized];
    }

    return formatExerciseLabel(value);
}


/* ---------- ПЕРЕВОД ПОПУЛЯРНЫХ НАЗВАНИЙ ---------- */

const EXERCISE_NAME_TRANSLATIONS = {
    "bench press": "Жим штанги лёжа",
    "barbell bench press": "Жим штанги лёжа",
    "press de banca": "Жим штанги лёжа",
    "dumbbell bench press": "Жим гантелей лёжа",
    "press de banca con mancuernas": "Жим гантелей лёжа",
    "incline bench press": "Жим штанги на наклонной скамье",
    "incline dumbbell press": "Жим гантелей на наклонной скамье",
    "decline bench press": "Жим штанги на скамье с отрицательным наклоном",
    "push up": "Отжимания",
    "push ups": "Отжимания",
    "flexiones": "Отжимания",
    "pull up": "Подтягивания",
    "pull ups": "Подтягивания",
    "dominadas": "Подтягивания",
    "chin up": "Подтягивания обратным хватом",
    "lat pulldown": "Тяга верхнего блока",
    "jalon al pecho": "Тяга верхнего блока к груди",
    "seated cable row": "Горизонтальная тяга блока",
    "cable row": "Тяга нижнего блока",
    "bent over row": "Тяга штанги в наклоне",
    "barbell row": "Тяга штанги в наклоне",
    "remo con barra": "Тяга штанги в наклоне",
    "deadlift": "Становая тяга",
    "peso muerto": "Становая тяга",
    "romanian deadlift": "Румынская тяга",
    "squat": "Приседания",
    "barbell squat": "Приседания со штангой",
    "sentadilla": "Приседания",
    "front squat": "Фронтальные приседания",
    "goblet squat": "Приседания с гантелью у груди",
    "leg press": "Жим ногами",
    "leg extension": "Разгибание ног в тренажёре",
    "leg curl": "Сгибание ног в тренажёре",
    "calf raise": "Подъёмы на носки",
    "standing calf raise": "Подъёмы на носки стоя",
    "hip thrust": "Ягодичный мост",
    "glute bridge": "Ягодичный мост",
    "biceps curl": "Сгибания рук на бицепс",
    "barbell curl": "Подъём штанги на бицепс",
    "dumbbell curl": "Сгибания рук с гантелями",
    "hammer curl": "Молотковые сгибания",
    "curl de biceps": "Сгибания рук на бицепс",
    "triceps pushdown": "Разгибание рук на блоке",
    "triceps extension": "Разгибание рук на трицепс",
    "overhead triceps extension": "Разгибание рук над головой",
    "skull crusher": "Французский жим лёжа",
    "shoulder press": "Жим на плечи",
    "overhead press": "Жим над головой",
    "military press": "Армейский жим",
    "lateral raise": "Махи гантелями в стороны",
    "side lateral raise": "Махи гантелями в стороны",
    "front raise": "Подъёмы гантелей перед собой",
    "face pull": "Тяга каната к лицу",
    "shrug": "Шраги",
    "shrugs": "Шраги",
    "crunch": "Скручивания на пресс",
    "abdominal crunch": "Скручивания на пресс",
    "sit up": "Подъёмы туловища на пресс",
    "plank": "Планка",
    "plancha": "Планка",
    "russian twist": "Русские скручивания",
    "mountain climber": "Альпинист",
    "burpee": "Берпи",
    "burpees": "Берпи",
    "jumping jack": "Прыжки «джампинг-джек»",
    "jumping jacks": "Прыжки «джампинг-джек»",
    "treadmill": "Беговая дорожка",
    "cycling": "Велотренажёр",
    "running": "Бег",
    "walking": "Ходьба",
    "lunges": "Выпады",
    "lunge": "Выпад",
    "zancadas": "Выпады",
    "bulgarian split squat": "Болгарские сплит-приседания",
    "hip abduction": "Отведение бедра",
    "hip adduction": "Приведение бедра",
    "pec deck": "Сведение рук в тренажёре",
    "chest fly": "Разведение рук для груди",
    "dumbbell fly": "Разведение гантелей лёжа",
    "press inclinado": "Жим на наклонной скамье",
    "aperturas con mancuernas": "Разведение гантелей",
    "cruce de poleas": "Сведение рук в кроссовере",

    // Спина
    "remo": "Тяга",
    "remo sentado": "Горизонтальная тяга",
    "jalon al pecho": "Тяга верхнего блока к груди",
    "jalon al pecho con agarre estrecho": "Тяга верхнего блока узким хватом",
    "peso muerto rumano": "Румынская тяга",

    // Ноги
    "prensa de piernas": "Жим ногами",
    "extension de piernas": "Разгибание ног в тренажёре",
    "curl de piernas": "Сгибание ног в тренажёре",
    "sentadilla frontal": "Фронтальные приседания",
    "sentadilla bulgara": "Болгарские сплит-приседания",
    "elevacion de talones": "Подъёмы на носки",

    // Плечи
    "press militar": "Армейский жим",
    "elevaciones laterales": "Махи гантелями в стороны",
    "elevaciones frontales": "Подъёмы гантелей перед собой",
    "pajaros": "Разведение рук на заднюю дельту",

    // Руки
    "curl de biceps con barra": "Подъём штанги на бицепс",
    "curl de biceps con mancuernas": "Сгибания рук с гантелями",
    "extension de triceps": "Разгибание рук на трицепс",
    "extension de triceps en polea": "Разгибание рук на блоке",

    // Пресс и кардио
    "abdominales": "Упражнения на пресс",
    "bicicleta estatica": "Велотренажёр",
    "cinta de correr": "Беговая дорожка"
    
};


/* ---------- ПЕРЕВОД ИНСТРУКЦИЙ ---------- */

const EXERCISE_INSTRUCTION_TRANSLATIONS = {
    "stand with your feet shoulder width apart":
        "Встаньте, поставив ноги на ширине плеч.",
    "stand with your feet shoulder-width apart":
        "Встаньте, поставив ноги на ширине плеч.",
    "keep your back straight":
        "Держите спину ровно.",
    "keep your back straight throughout the movement":
        "Сохраняйте ровное положение спины на протяжении движения.",
    "keep your core tight":
        "Напрягите мышцы корпуса.",
    "keep your elbows close to your body":
        "Держите локти ближе к корпусу.",
    "lower the weight slowly":
        "Медленно опустите вес.",
    "slowly lower the weight":
        "Медленно опустите вес.",
    "return to the starting position":
        "Вернитесь в исходное положение.",
    "return to the starting position and repeat":
        "Вернитесь в исходное положение и повторите движение.",
    "repeat for the desired number of repetitions":
        "Повторите нужное количество раз.",
    "breathe out as you lift the weight":
        "Выдыхайте при подъёме веса.",
    "breathe in as you lower the weight":
        "Вдыхайте при опускании веса.",
    "inhale as you lower the weight":
        "Вдыхайте при опускании веса.",
    "exhale as you lift the weight":
        "Выдыхайте при подъёме веса.",
    "keep your feet flat on the floor":
        "Не отрывайте стопы от пола.",
    "do not arch your back":
        "Не прогибайте спину.",
    "avoid locking your knees":
        "Не выпрямляйте колени до жёсткой фиксации.",
    "keep your shoulders down":
        "Не поднимайте плечи к ушам.",
    "control the movement":
        "Выполняйте движение подконтрольно.",
    "lower yourself until your thighs are parallel to the floor":
        "Опускайтесь, пока бёдра не станут параллельны полу.",
    "push the weight upward":
        "Выжмите вес вверх.",
    "pull the bar toward your chest":
        "Тяните перекладину к груди.",
    "pull the bar down to your chest":
        "Тяните перекладину вниз к груди.",
    "squeeze your shoulder blades together":
        "Сведите лопатки.",
    "keep your elbows slightly bent":
        "Сохраняйте небольшой сгиб в локтях.",
    "start with your arms extended":
        "Начните с вытянутых рук.",
    "lie flat on the bench":
        "Лягте на скамью.",
    "lie on your back":
        "Лягте на спину.",
    "lie face down on the bench":
        "Лягте на скамью лицом вниз.",
    "sit on the bench":
        "Сядьте на скамью.",
    "hold the position":
        "Удерживайте положение.",
    "repeat the movement":
        "Повторите движение.",
    "keep your head in a neutral position":
        "Держите голову в нейтральном положении.",
    "do not use momentum":
        "Не используйте инерцию.",
    "use a controlled motion":
        "Двигайтесь подконтрольно."
};


function translateExerciseInstruction(value) {
    const original = String(value || "").trim();

    if (!original) return "";

    const normalized = normalizeExerciseText(original);

    return EXERCISE_INSTRUCTION_TRANSLATIONS[normalized] || original;
}


function translateExerciseName(value) {
    const original = String(value || "").trim();

    if (!original) return "Упражнение";

    const normalized = normalizeExerciseText(original);

    return EXERCISE_NAME_TRANSLATIONS[normalized] ||
        formatExerciseLabel(original);
}


/* ---------- СИНОНИМЫ ПОИСКА ---------- */

const EXERCISE_SEARCH_ALIASES = {
    "жим": [
        "bench press", "dumbbell press", "shoulder press", "press de banca"
    ],
    "жим лежа": [
        "bench press", "barbell bench press", "press de banca"
    ],
    "жим лёжа": [
        "bench press", "barbell bench press", "press de banca"
    ],
    "жим гантелей": [
        "dumbbell bench press", "dumbbell press",
        "press de banca con mancuernas"
    ],
    "жим на наклонной": [
        "incline bench press", "incline dumbbell press"
    ],
    "присед": ["squat", "sentadilla"],
    "приседания": ["squat", "sentadilla"],
    "становая": ["deadlift", "peso muerto"],
    "становая тяга": ["deadlift", "peso muerto"],
    "тяга": ["row", "pulldown", "deadlift", "remo"],
    "тяга верхнего блока": ["lat pulldown", "jalon al pecho"],
    "тяга в наклоне": ["bent over row", "barbell row", "remo con barra"],
    "подтягивания": ["pull up", "pull-up", "dominadas"],
    "отжимания": ["push up", "push-up", "flexiones"],
    "бицепс": ["biceps curl", "curl de biceps"],
    "сгибание рук": ["biceps curl", "arm curl"],
    "трицепс": ["triceps extension", "triceps pushdown"],
    "разгибание рук": ["triceps extension", "triceps pushdown"],
    "плечи": ["shoulder press", "lateral raise", "deltoid"],
    "жим плечами": ["shoulder press", "overhead press"],
    "махи в стороны": ["lateral raise", "side lateral raise"],
    "пресс": ["abdominal", "crunch", "sit up", "plank"],
    "скручивания": ["crunch", "abdominal crunch"],
    "ноги": ["leg press", "leg extension", "leg curl", "squat", "sentadilla"],
    "разгибание ног": ["leg extension"],
    "сгибание ног": ["leg curl"],
    "икры": ["calf raise", "calf"],
    "ягодицы": ["glute", "hip thrust", "glute bridge"],
    "кардио": ["cardio", "treadmill", "cycling", "running"],
    "растяжка": ["stretch", "stretching", "flexibility"],
    "грудь": ["chest", "pecho", "pectorals"],
    "спина": ["back", "espalda", "lats"],
    "бег": ["running", "treadmill"],
    "плавание": ["swimming"]
};


/* ---------- ПОДГОТОВКА УПРАЖНЕНИЯ ---------- */

function normalizeCatalogExercise(item) {
    if (!item || typeof item !== "object") return null;

    const name = String(item.name || "").trim();

    const muscle = String(
        item.muscle || item.target || item.bodyPart || ""
    ).trim();

    if (!name) return null;

    const instructions = Array.isArray(item.instructions)
        ? item.instructions
            .map(function(instruction) {
                return String(instruction || "").trim();
            })
            .filter(Boolean)
        : typeof item.instructions === "string"
            ? [item.instructions.trim()].filter(Boolean)
            : [];

    const secondaryMuscles = Array.isArray(item.secondaryMuscles)
        ? item.secondaryMuscles.map(String)
        : Array.isArray(item.secondary_muscles)
            ? item.secondary_muscles.map(String)
            : [];

    return {
        id: String(item.id || item.slug || name),
        name: name,
        translatedName: translateExerciseName(name),
        muscle: muscle,
        muscleLabel: getExerciseMuscleLabel(muscle),
        bodyPart: String(item.bodyPart || item.body_part || ""),
        equipment: String(item.equipment || ""),
        equipmentLabel: translateExerciseEquipment(item.equipment || ""),
        category: String(item.category || ""),
        secondaryMuscles: secondaryMuscles,
        instructions: instructions,
        translatedInstructions: instructions.map(
            translateExerciseInstruction
        ),
        gifUrl: String(item.gifUrl || item.gif_url || ""),
        file: String(item.file || "")
    };
}


/* ---------- ЗАГРУЗКА КАТАЛОГА ---------- */

let exerciseCatalog = [];
let exerciseCatalogLoaded = false;
let exerciseCatalogLoading = null;


async function loadExerciseCatalog() {
    if (exerciseCatalogLoaded) return exerciseCatalog;
    if (exerciseCatalogLoading) return exerciseCatalogLoading;

    exerciseCatalogLoading = (async function() {
        let response;

        try {
            response = await fetch(EXERCISE_CATALOG_URL, {
                method: "GET",
                mode: "cors",
                cache: "default"
            });
        } catch (error) {
            throw new Error(
                "Не удалось подключиться к каталогу упражнений. " +
                "Проверь интернет или попробуй позже."
            );
        }

        if (!response.ok) {
            throw new Error(
                "Каталог упражнений временно недоступен. Код ответа: " +
                response.status
            );
        }

        let payload;

        try {
            payload = await response.json();
        } catch (error) {
            throw new Error("Не удалось прочитать данные каталога.");
        }

        let items;

        if (Array.isArray(payload)) {
            items = payload;
        } else if (payload && Array.isArray(payload.exercises)) {
            items = payload.exercises;
        } else if (payload && Array.isArray(payload.data)) {
            items = payload.data;
        } else {
            throw new Error("Формат каталога упражнений не распознан.");
        }

        exerciseCatalog = items
            .map(normalizeCatalogExercise)
            .filter(Boolean);

        if (!exerciseCatalog.length) {
            throw new Error("В каталоге не найдены упражнения.");
        }

        exerciseCatalogLoaded = true;
        return exerciseCatalog;
    })();

    try {
        return await exerciseCatalogLoading;
    } finally {
        exerciseCatalogLoading = null;
    }
}


/* ---------- СИНОНИМЫ ЗАПРОСА ---------- */

function getExerciseSearchTerms(query) {
    const normalized = normalizeExerciseText(query);

    if (!normalized) return [];

    const terms = [normalized];

    Object.entries(EXERCISE_SEARCH_ALIASES).forEach(function(entry) {
        const alias = normalizeExerciseText(entry[0]);

        if (
            normalized === alias ||
            normalized.includes(alias) ||
            alias.includes(normalized)
        ) {
            entry[1].forEach(function(value) {
                terms.push(normalizeExerciseText(value));
            });
        }
    });

    return [...new Set(terms.filter(Boolean))];
}


/* ---------- ПРОВЕРКА ГРУППЫ МЫШЦ ---------- */

function exerciseMatchesMuscle(exercise, selectedGroup) {
    if (!selectedGroup) return true;

    const selected = normalizeExerciseText(selectedGroup);

    const group = EXERCISE_MUSCLE_GROUPS.find(function(item) {
        return item.value === selectedGroup;
    });

    const muscleValues = [
        exercise.muscle,
        exercise.bodyPart,
        exercise.muscleLabel,
        ...exercise.secondaryMuscles
    ].filter(Boolean);

    const exerciseGroups = muscleValues
        .map(getExerciseGroupKey)
        .filter(Boolean);

    if (exerciseGroups.includes(selectedGroup)) return true;

    if (group) {
        const allMuscles = normalizeExerciseText(muscleValues.join(" "));

        return group.terms.some(function(term) {
            return allMuscles.includes(normalizeExerciseText(term));
        });
    }

    return muscleValues.some(function(value) {
        return normalizeExerciseText(value).includes(selected);
    });
}


/* ---------- ПРОВЕРКА ПОИСКОВОГО ЗАПРОСА ---------- */

function exerciseMatchesSearch(exercise, query, muscleFilter) {
    if (!exerciseMatchesMuscle(exercise, muscleFilter)) return false;

    const terms = getExerciseSearchTerms(query);

    if (!terms.length) return true;

    const searchableText = normalizeExerciseText([
        exercise.name,
        exercise.translatedName,
        exercise.muscle,
        exercise.muscleLabel,
        exercise.bodyPart,
        exercise.equipment,
        exercise.equipmentLabel,
        exercise.category,
        ...exercise.secondaryMuscles,
        ...exercise.instructions,
        ...exercise.translatedInstructions
    ].join(" "));

    return terms.some(function(term) {
        return searchableText.includes(term);
    });
}


/* ---------- СОЗДАНИЕ КАРТОЧКИ ---------- */

function createExerciseCatalogCard(exercise) {
    const card = document.createElement("article");
    card.className = "exercise-search-card";

    const imageContainer = document.createElement("div");
    imageContainer.className = "exercise-search-image";

    if (exercise.gifUrl) {
        try {
            const gifURL = new URL(exercise.gifUrl);

            if (
                gifURL.protocol === "https:" &&
                gifURL.hostname === "cdn.jsdelivr.net"
            ) {
                const image = document.createElement("img");

                image.src = gifURL.href;
                image.alt = "Техника: " + exercise.translatedName;
                image.loading = "lazy";
                image.decoding = "async";

                image.addEventListener("error", function() {
                    imageContainer.replaceChildren();

                    const placeholder = document.createElement("span");
                    placeholder.textContent = "GIF недоступен";

                    imageContainer.appendChild(placeholder);
                }, { once: true });

                imageContainer.appendChild(image);
            } else {
                const placeholder = document.createElement("span");
                placeholder.textContent = "Нет изображения";
                imageContainer.appendChild(placeholder);
            }
        } catch (error) {
            const placeholder = document.createElement("span");
            placeholder.textContent = "Нет изображения";
            imageContainer.appendChild(placeholder);
        }
    } else {
        const placeholder = document.createElement("span");
        placeholder.textContent = "Нет изображения";
        imageContainer.appendChild(placeholder);
    }

    const content = document.createElement("div");
    content.className = "exercise-search-content";

    const title = document.createElement("h3");
    title.textContent = exercise.translatedName;

    const muscle = document.createElement("p");
    muscle.className = "exercise-search-muscle";
    muscle.textContent = "Мышцы: " +
        (exercise.muscleLabel || "Не указаны");

    content.append(title, muscle);

    if (exercise.equipmentLabel) {
        const equipment = document.createElement("p");
        equipment.className = "exercise-search-equipment";
        equipment.textContent = "Оборудование: " + exercise.equipmentLabel;
        content.appendChild(equipment);
    }

    if (exercise.translatedInstructions.length) {
        const details = document.createElement("details");
        details.className = "exercise-search-instructions";

        const summary = document.createElement("summary");
        summary.textContent = "Техника выполнения";

        const list = document.createElement("ol");

        exercise.translatedInstructions.forEach(function(instruction) {
            const item = document.createElement("li");
            item.textContent = instruction;
            list.appendChild(item);
        });

        details.append(summary, list);
        content.appendChild(details);
    }

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "exercise-catalog-add";
    addButton.textContent = "Добавить в тренировку";

    addButton.addEventListener("click", function() {
        const exerciseList = document.getElementById("exerciseList");
        if (!exerciseList) return;

        addExerciseRow(exercise.translatedName);

        const form = document.getElementById("workoutForm");
        const message =
            document.getElementById("formMessage") ||
            document.getElementById("workoutMessage");

        showSportMessage(
            message,
            "Добавлено упражнение: " + exercise.translatedName +
            ". Заполни вес, повторения и подходы.",
            true
        );

        if (form) {
            form.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }

        const newestCard = exerciseList.lastElementChild;
        const weightInput = newestCard
            ? newestCard.querySelector(".exercise-weight")
            : null;

        if (weightInput) weightInput.focus({ preventScroll: true });
    });

    content.appendChild(addButton);
    card.append(imageContainer, content);

    return card;
}


/* ---------- ПАНЕЛЬ ГРУПП МЫШЦ ---------- */

function populateExerciseMuscleFilter() {
    const filter = document.getElementById("exerciseMuscleFilter");
    if (!filter) return;

    const previousValue = filter.value;

    filter.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "Все группы мышц";
    filter.appendChild(allOption);

    EXERCISE_MUSCLE_GROUPS.forEach(function(group) {
        const option = document.createElement("option");
        option.value = group.value;
        option.textContent = group.label;
        filter.appendChild(option);
    });

    if (Array.from(filter.options).some(function(option) {
        return option.value === previousValue;
    })) {
        filter.value = previousValue;
    }
}


/* ---------- ОТОБРАЖЕНИЕ РЕЗУЛЬТАТОВ ---------- */

function renderExerciseCatalog() {
    const input = document.getElementById("exerciseSearchInput");
    const filter = document.getElementById("exerciseMuscleFilter");
    const results = document.getElementById("exerciseSearchResults");
    const status = document.getElementById("exerciseSearchStatus");

    if (!input || !results || !status) return;

    const query = input.value.trim();
    const muscleFilter = filter ? filter.value : "";

    if (!query && !muscleFilter) {
        results.replaceChildren();
        status.textContent =
            "Введи название упражнения или выбери группу мышц.";
        return;
    }

    const filtered = exerciseCatalog.filter(function(exercise) {
        return exerciseMatchesSearch(exercise, query, muscleFilter);
    });

    results.replaceChildren();

    if (!filtered.length) {
        status.textContent =
            "Ничего не найдено. Попробуй изменить запрос или группу мышц.";
        return;
    }

    const visibleExercises = filtered.slice(0, EXERCISE_RESULTS_LIMIT);
    const fragment = document.createDocumentFragment();

    visibleExercises.forEach(function(exercise) {
        fragment.appendChild(createExerciseCatalogCard(exercise));
    });

    results.appendChild(fragment);

    status.textContent = filtered.length > visibleExercises.length
        ? "Найдено: " + filtered.length + ". Показаны первые " +
            visibleExercises.length + " результатов. Уточни запрос."
        : "Найдено упражнений: " + filtered.length;
}


/* ---------- ЗАПУСК ПОИСКА ---------- */

async function runExerciseSearch() {
    const input = document.getElementById("exerciseSearchInput");
    const filter = document.getElementById("exerciseMuscleFilter");
    const results = document.getElementById("exerciseSearchResults");
    const status = document.getElementById("exerciseSearchStatus");
    const button = document.getElementById("exerciseSearchButton");

    if (!input || !results || !status) return;

    const query = input.value.trim();
    const muscleFilter = filter ? filter.value : "";

    if (!query && !muscleFilter) {
        results.replaceChildren();
        status.textContent =
            "Сначала введи название или выбери группу мышц.";
        input.focus();
        return;
    }

    if (button) button.disabled = true;

    results.replaceChildren();
    status.textContent = exerciseCatalogLoaded
        ? "Ищем упражнения..."
        : "Загружаем каталог при первом поиске...";

    try {
        await loadExerciseCatalog();
        renderExerciseCatalog();
    } catch (error) {
        console.error("Ошибка поиска упражнений:", error);

        results.replaceChildren();
        status.replaceChildren();

        const message = document.createElement("p");
        message.textContent =
            error.message || "Не удалось загрузить каталог.";

        const link = document.createElement("a");
        link.href = EXERCISE_CATALOG_SOURCE;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Открыть источник каталога";

        const retryButton = document.createElement("button");
        retryButton.type = "button";
        retryButton.textContent = "Попробовать снова";
        retryButton.addEventListener("click", runExerciseSearch);

        status.append(message, link, retryButton);
    } finally {
        if (button) button.disabled = false;
    }
}


/* ---------- ИНИЦИАЛИЗАЦИЯ ПОИСКА ---------- */

function initExerciseSearch() {
    const input = document.getElementById("exerciseSearchInput");
    const filter = document.getElementById("exerciseMuscleFilter");
    const results = document.getElementById("exerciseSearchResults");
    const status = document.getElementById("exerciseSearchStatus");

    if (!input || !results || !status) return;
    if (input.dataset.initialized === "true") return;

    input.dataset.initialized = "true";

    let button = document.getElementById("exerciseSearchButton");

    if (!button) {
        button = document.createElement("button");
        button.id = "exerciseSearchButton";
        button.type = "button";
        button.textContent = "Найти";
        input.insertAdjacentElement("afterend", button);
    }

    populateExerciseMuscleFilter();

    results.replaceChildren();
    status.textContent =
        "Введи название упражнения или выбери группу мышц.";

    button.addEventListener("click", runExerciseSearch);

    input.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            runExerciseSearch();
        }
    });

    if (filter) {
        filter.addEventListener("change", function() {
            if (filter.value) {
                runExerciseSearch();
            } else {
                results.replaceChildren();
                status.textContent =
                    "Введи название упражнения или выбери группу мышц.";
            }
        });
    }
}


/* =========================================
   ФОРМА ТРЕНИРОВКИ
   ========================================= */


/* ---------- ДОБАВЛЕНИЕ УПРАЖНЕНИЯ ---------- */

function addExerciseRow(exerciseName = "") {
    const list = document.getElementById("exerciseList");
    if (!list) return;

    const card = document.createElement("div");
    card.className = "exercise-card";

    card.innerHTML = `
        <div class="exercise-header">
            <h3>Упражнение</h3>
            <button type="button" class="remove-exercise">Удалить</button>
        </div>

        <div class="form-field">
            <label>Название упражнения</label>
            <input
                class="exercise-name"
                type="text"
                maxlength="100"
                placeholder="Например, Жим лёжа"
                required
            >
        </div>

        <div class="exercise-fields">
            <div class="form-field">
                <label>Вес, кг</label>
                <input
                    class="exercise-weight"
                    type="number"
                    min="0"
                    max="1000"
                    step="any"
                    placeholder="60"
                    required
                >
            </div>

            <div class="form-field">
                <label>Повторения</label>
                <input
                    class="exercise-reps"
                    type="number"
                    min="1"
                    max="1000"
                    placeholder="10"
                    required
                >
            </div>

            <div class="form-field">
                <label>Подходы</label>
                <input
                    class="exercise-sets"
                    type="number"
                    min="1"
                    max="100"
                    value="3"
                    required
                >
            </div>
        </div>
    `;

    card.querySelector(".exercise-name").value = exerciseName;

    card.querySelector(".remove-exercise").addEventListener(
        "click",
        function() {
            card.remove();
        }
    );

    list.appendChild(card);
}


/* ---------- СОХРАНЕНИЕ ТРЕНИРОВКИ ---------- */

function initWorkoutForm() {
    const form = document.getElementById("workoutForm");

    if (!form || form.dataset.initialized === "true") return;

    const exerciseList = document.getElementById("exerciseList");

    if (!exerciseList) {
        console.error("Не найден элемент #exerciseList.");
        return;
    }

    form.dataset.initialized = "true";

    const message =
        document.getElementById("formMessage") ||
        document.getElementById("workoutMessage");

    const button = form.querySelector('[type="submit"]');
    const addButton = document.getElementById("addExercise");

    if (addButton) {
        addButton.addEventListener("click", function() {
            addExerciseRow();
        });
    }

    if (!exerciseList.querySelector(".exercise-card")) {
        addExerciseRow();
    }

    form.addEventListener("submit", async function(event) {
        event.preventDefault();

        if (button) button.disabled = true;
        showSportMessage(message, "");

        try {
            const nameInput = document.getElementById("workoutName");
            const notesInput = document.getElementById("workoutNotes");

            const name = nameInput ? nameInput.value.trim() : "";
            const notes = notesInput ? notesInput.value.trim() : "";

            const exerciseCards = [
                ...exerciseList.querySelectorAll(".exercise-card")
            ];

            const exercises = exerciseCards.map(function(card) {
                const weightInput = card.querySelector(".exercise-weight").value;
                const repsInput = card.querySelector(".exercise-reps").value;
                const setsInput = card.querySelector(".exercise-sets").value;

                return {
                    name: card.querySelector(".exercise-name").value.trim(),
                    weight: weightInput === "" ? NaN : Number(weightInput),
                    reps: repsInput === "" ? NaN : Number(repsInput),
                    sets: setsInput === "" ? NaN : Number(setsInput)
                };
            });

            if (!name) {
                throw new Error("Укажи название тренировки.");
            }

            if (!exercises.length) {
                throw new Error("Добавь хотя бы одно упражнение.");
            }

            const invalidExercise = exercises.some(function(exercise) {
                return (
                    !exercise.name ||
                    !Number.isFinite(exercise.weight) ||
                    exercise.weight < 0 ||
                    exercise.weight > 1000 ||
                    !Number.isInteger(exercise.reps) ||
                    exercise.reps < 1 ||
                    exercise.reps > 1000 ||
                    !Number.isInteger(exercise.sets) ||
                    exercise.sets < 1 ||
                    exercise.sets > 100
                );
            });

            if (invalidExercise) {
                throw new Error(
                    "Проверь название упражнения, вес, повторения и подходы."
                );
            }

            await sportApiRequest("/api/workouts", {
                name: name,
                notes: notes,
                exercises: exercises
            });

            form.reset();
            exerciseList.replaceChildren();
            addExerciseRow();

            showSportMessage(message, "Тренировка сохранена!", true);

            await refreshWorkoutPage();
        } catch (error) {
            showSportMessage(
                message,
                error.message || "Не удалось сохранить тренировку."
            );

            console.error("Ошибка сохранения тренировки:", error);
        } finally {
            if (button) button.disabled = false;
        }
    });
}







function renderWeeklyGoal(stats) {
    const count = document.getElementById("weeklyGoalCount");
    const progress = document.getElementById("weeklyGoalProgress");
    const fill = document.getElementById("weeklyGoalFill");
    const status = document.getElementById("weeklyGoalStatus");
    const target = document.getElementById("weeklyGoalTarget");
    const remaining = document.getElementById("weeklyGoalRemaining");

    const current = Number(stats.week_count) || 0;
    const goal = Number(stats.weekly_goal) || 3;
    const completed = Math.min(current, goal);
    const left = Math.max(0, goal - current);
    const percent = goal > 0 ? completed / goal * 100 : 0;

    if (count) count.textContent = `${completed} / ${goal}`;

    if (progress) {
        progress.setAttribute("aria-valuemax", goal);
        progress.setAttribute("aria-valuenow", completed);
    }

    if (fill) fill.style.width = `${percent}%`;

    if (status) {
        status.textContent = left === 0
            ? "Недельная цель выполнена!"
            : `Осталось выполнить ${left} трениров${left === 1 ? "ку" : left < 5 ? "ки" : "ок"}.`;
    }

    if (target) target.textContent = `${goal} тренировки`;
    if (remaining) remaining.textContent = left;
}





/* ---------- ОБНОВЛЕНИЕ СТРАНИЦЫ ---------- */

async function refreshWorkoutPage() {
    const data = await getSportData();

renderWorkoutStats(data.stats, data.workouts);
renderWeeklyGoal(data.stats);
renderWorkoutAchievements(data.workouts);

    const container = document.getElementById("workoutsContainer");

    if (container) {
        renderWorkoutHistory(data.workouts, container);
    }

    return data;
}


/* ---------- СТРАНИЦА ТРЕНИРОВОК ---------- */

async function initWorkoutsPage() {
    initWorkoutForm();

    try {
        const data = await refreshWorkoutPage();

        console.log(
            "Страница тренировок загружена.",
            data.workouts.length
        );
    } catch (error) {
        console.error("Ошибка загрузки страницы тренировок:", error);

        showSportMessage(
            document.getElementById("formMessage") ||
            document.getElementById("workoutMessage"),
            error.message || "Не удалось загрузить данные."
        );
    }
}


/* =========================================
ПРОГРЕСС — РАСШИРЕННАЯ ВЕРСИЯ
   ========================================= */

const FORM_POINTS_TARGET = 1000;
const FORM_WEEKLY_WORKOUT_TARGET = 3;


/* ---------- РАБОТА С ДАТАМИ ПРОГРЕССА ---------- */

function getProgressDate(value) {
    return parseWorkoutDate(value);
}


function getProgressDayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return year + "-" + month + "-" + day;
}


function getProgressWeekStart(date) {
    const result = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );

    const day = result.getDay();
    const difference = day === 0 ? -6 : 1 - day;

    result.setDate(result.getDate() + difference);
    result.setHours(0, 0, 0, 0);

    return result;
}


function getProgressWeekKey(date) {
    return getProgressDayKey(getProgressWeekStart(date));
}


function getProgressMonthKey(date) {
    return date.getFullYear() + "-" +
        String(date.getMonth() + 1).padStart(2, "0");
}


function getProgressExerciseCount(workout) {
    return Array.isArray(workout.exercises)
        ? workout.exercises.length
        : 0;
}


function getProgressWorkoutVolume(workout) {
    const exercises = Array.isArray(workout.exercises)
        ? workout.exercises
        : [];

    return exercises.reduce(function(total, exercise) {
        const weight = Number(exercise.weight) || 0;
        const reps = Number(exercise.reps) || 0;
        const sets = Number(exercise.sets) || 0;

        return total + weight * reps * sets;
    }, 0);
}


/* ---------- ПОДСЧЁТ ПРОГРЕССА ---------- */

function calculateProgressData(workouts) {
    const now = new Date();
    const currentWeek = getProgressWeekStart(now);
    const currentWeekKey = getProgressWeekKey(now);
    const currentMonthKey = getProgressMonthKey(now);

    const validWorkouts = workouts
        .map(function(workout) {
            return {
                workout: workout,
                date: getProgressDate(workout.created_at)
            };
        })
        .filter(function(item) {
            return item.date !== null;
        });

    const currentWeekWorkouts = validWorkouts.filter(function(item) {
        return getProgressWeekKey(item.date) === currentWeekKey;
    });

    const currentMonthWorkouts = validWorkouts.filter(function(item) {
        return getProgressMonthKey(item.date) === currentMonthKey;
    });

    const weekExerciseCount = currentWeekWorkouts.reduce(
        function(total, item) {
            return total + getProgressExerciseCount(item.workout);
        },
        0
    );

    const monthExerciseCount = currentMonthWorkouts.reduce(
        function(total, item) {
            return total + getProgressExerciseCount(item.workout);
        },
        0
    );

    const totalVolume = validWorkouts.reduce(
        function(total, item) {
            return total + getProgressWorkoutVolume(item.workout);
        },
        0
    );

    const activityByDay = new Map();

    for (let offset = 6; offset >= 0; offset--) {
        const day = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - offset
        );

        activityByDay.set(getProgressDayKey(day), {
            date: day,
            count: 0
        });
    }

    validWorkouts.forEach(function(item) {
        const key = getProgressDayKey(item.date);

        if (activityByDay.has(key)) {
            activityByDay.get(key).count += 1;
        }
    });

    const weeklyCounts = new Map();

    validWorkouts.forEach(function(item) {
        const key = getProgressWeekKey(item.date);
        weeklyCounts.set(key, (weeklyCounts.get(key) || 0) + 1);
    });

    /*
    Серия показывает количество последовательных недель,
    в которых выполнена цель из трёх тренировок.
    */

    let streak = 0;
    const thisWeekCount = weeklyCounts.get(currentWeekKey) || 0;

    let weekOffset = thisWeekCount >= FORM_WEEKLY_WORKOUT_TARGET
        ? 0
        : 1;

    while (weekOffset < 520) {
        const weekDate = new Date(currentWeek);
        weekDate.setDate(weekDate.getDate() - weekOffset * 7);

        const key = getProgressWeekKey(weekDate);
        const count = weeklyCounts.get(key) || 0;

        if (count < FORM_WEEKLY_WORKOUT_TARGET) {
            break;
        }

        streak += 1;
        weekOffset += 1;
    }

    return {
        totalWorkouts: validWorkouts.length,
        weekWorkouts: currentWeekWorkouts.length,
        monthWorkouts: currentMonthWorkouts.length,
        weekExerciseCount: weekExerciseCount,
        monthExerciseCount: monthExerciseCount,
        totalVolume: totalVolume,
        activityByDay: Array.from(activityByDay.values()),
        currentWeekCount: thisWeekCount,
        weeklyTarget: FORM_WEEKLY_WORKOUT_TARGET,
        streak: streak
    };
}


/* ---------- ЭЛЕМЕНТЫ ПАНЕЛИ ПРОГРЕССА ---------- */

function createProgressElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
}


function createProgressCard(title, value, description) {
    const card = createProgressElement("article", "form-progress-card");

    card.style.cssText = [
        "background:#172236",
        "border:1px solid #334155",
        "border-radius:14px",
        "padding:18px",
        "min-width:0"
    ].join(";");

    const heading = createProgressElement("h3", "", title);
    heading.style.cssText =
        "margin:0 0 10px;font-size:14px;color:#9ca3af;font-weight:500";

    const number = createProgressElement("p", "", value);
    number.style.cssText =
        "margin:0 0 8px;font-size:28px;font-weight:700;color:#d6ff3f";

    const caption = createProgressElement("p", "", description);
    caption.style.cssText =
        "margin:0;font-size:12px;line-height:1.5;color:#9ca3af";

    card.append(heading, number, caption);

    return card;
}


/* ---------- ГРАФИК ПОСЕЩАЕМОСТИ ---------- */

function renderAttendanceChart(progress, container) {
    const section = createProgressElement("section", "form-attendance-section");

    section.style.cssText = [
        "background:#172236",
        "border:1px solid #334155",
        "border-radius:14px",
        "padding:18px",
        "min-width:0"
    ].join(";");

    const heading = createProgressElement("h3", "", "Посещаемость за 7 дней");
    heading.style.cssText = "margin:0 0 18px;font-size:17px";

    const chart = createProgressElement("div", "form-attendance-chart");
    chart.style.cssText = [
        "display:grid",
        "grid-template-columns:repeat(7,minmax(0,1fr))",
        "gap:8px",
        "align-items:end",
        "min-height:150px"
    ].join(";");

    const maximum = Math.max(
        1,
        ...progress.activityByDay.map(function(day) {
            return day.count;
        })
    );

    progress.activityByDay.forEach(function(day) {
        const column = createProgressElement("div", "form-attendance-day");

        column.style.cssText = [
            "display:flex",
            "flex-direction:column",
            "align-items:center",
            "justify-content:flex-end",
            "gap:7px",
            "min-width:0",
            "height:150px"
        ].join(";");

        const count = createProgressElement("span", "", String(day.count));
        count.style.cssText =
            "font-size:12px;color:#e5e7eb;font-weight:600";

        const track = createProgressElement("div", "");
        track.style.cssText = [
            "display:flex",
            "align-items:flex-end",
            "justify-content:center",
            "height:95px",
            "width:100%",
            "max-width:28px",
            "background:#0f172a",
            "border-radius:6px",
            "overflow:hidden"
        ].join(";");

        const bar = createProgressElement("div", "");

        const barHeight = day.count === 0
            ? 3
            : Math.max(8, day.count / maximum * 95);

        bar.style.cssText = [
            "width:100%",
            "height:" + barHeight + "px",
            "background:" + (day.count ? "#d6ff3f" : "#475569"),
            "border-radius:6px"
        ].join(";");

        track.appendChild(bar);

        const label = createProgressElement(
            "span",
            "",
            day.date.toLocaleDateString("ru-RU", { weekday: "short" })
        );

        label.style.cssText =
            "font-size:10px;color:#9ca3af;text-transform:capitalize";

        column.append(count, track, label);
        chart.appendChild(column);
    });

    const note = createProgressElement(
        "p",
        "",
        "Число сохранённых тренировок за каждый день. Это история активности, а не оценка качества тренировки."
    );

    note.style.cssText =
        "margin:14px 0 0;font-size:12px;line-height:1.5;color:#9ca3af";

    section.append(heading, chart, note);
    container.appendChild(section);
}


/* ---------- ПАНЕЛЬ БАЛЛОВ ---------- */

function renderPointsPanel(stats, progress, container) {
    const points = Math.max(0, Number(stats.points) || 0);
    const pointsProgress = Math.min(
        100,
        points / FORM_POINTS_TARGET * 100
    );

    const section = createProgressElement("section", "form-points-section");

    section.style.cssText = [
        "background:#172236",
        "border:1px solid #334155",
        "border-radius:14px",
        "padding:18px",
        "min-width:0"
    ].join(";");

    const heading = createProgressElement("h3", "", "Баллы и регулярность");
    heading.style.cssText = "margin:0 0 10px;font-size:17px";

    const score = createProgressElement(
        "p",
        "",
        points.toLocaleString("ru-RU") + " баллов"
    );

    score.style.cssText =
        "font-size:28px;font-weight:700;color:#d6ff3f;margin:0 0 8px";

    const target = createProgressElement(
        "p",
        "",
        "Цель: " + FORM_POINTS_TARGET.toLocaleString("ru-RU") + " баллов"
    );

    target.style.cssText = "margin:0 0 12px;color:#cbd5e1;font-size:13px";

    const track = createProgressElement("div", "");
    track.style.cssText = [
        "height:10px",
        "background:#0f172a",
        "border-radius:999px",
        "overflow:hidden"
    ].join(";");

    const bar = createProgressElement("div", "");
    bar.style.cssText = [
        "height:100%",
        "width:" + pointsProgress + "%",
        "background:#d6ff3f",
        "border-radius:999px",
        "transition:width .25s ease"
    ].join(";");

    track.appendChild(bar);

    const remaining = Math.max(0, FORM_POINTS_TARGET - points);

    const remainingText = createProgressElement(
        "p",
        "",
        remaining === 0
            ? "Цель в 1000 баллов достигнута."
            : "До цели осталось " +
                remaining.toLocaleString("ru-RU") + " баллов."
    );

    remainingText.style.cssText =
        "margin:10px 0;color:#e5e7eb;font-size:13px";

    const weeklyCount = Number(stats.week_count) || 0;

const weeklyText = createProgressElement(
    "p",
    "",
    "Тренировок на этой неделе: " +
        weeklyCount + " из " +
        FORM_WEEKLY_WORKOUT_TARGET + "."
);

    weeklyText.style.cssText =
        "margin:8px 0;color:#cbd5e1;font-size:13px";

    const streakText = createProgressElement(
        "p",
        "",
        "Серия выполненных недельных целей: " +
            progress.streak
    );

    streakText.style.cssText =
        "margin:8px 0;color:#cbd5e1;font-size:13px";

    const explanation = createProgressElement(
        "p",
        "",
        "Баллы берутся из ответа сервера /api/stats. Недельная цель и серия рассчитываются по сохранённым тренировкам. Достижение 1000 баллов само по себе не выдаёт бесплатную тренировку: для этого нужна серверная логика."
    );

    explanation.style.cssText =
        "margin:14px 0 0;font-size:12px;line-height:1.6;color:#9ca3af";

    section.append(
        heading,
        score,
        target,
        track,
        remainingText,
        weeklyText,
        streakText,
        explanation
    );

    container.appendChild(section);
}


/* ---------- ПАНЕЛЬ СТАТИСТИКИ ---------- */

function renderProgressDashboard(data) {
    const canvas = document.getElementById("progressCanvas");

    if (!canvas) return;

    let dashboard = document.getElementById("progressDashboard");

    if (!dashboard) {
        dashboard = createProgressElement("section", "form-progress-dashboard");
        dashboard.id = "progressDashboard";

        dashboard.style.cssText = [
            "display:grid",
            "grid-template-columns:repeat(auto-fit,minmax(190px,1fr))",
            "gap:14px",
            "margin:20px 0"
        ].join(";");

        canvas.insertAdjacentElement("beforebegin", dashboard);
    }

    dashboard.replaceChildren();

    const progress = calculateProgressData(data.workouts);
    const stats = data.stats || {};

    const totalExercises = data.workouts.reduce(
        function(total, workout) {
            return total + getProgressExerciseCount(workout);
        },
        0
    );

    dashboard.appendChild(createProgressCard(
        "Всего тренировок",
        progress.totalWorkouts,
        "Сохранено в истории"
    ));

    dashboard.appendChild(createProgressCard(
        "За эту неделю",
        progress.weekWorkouts,
        "Цель — " + FORM_WEEKLY_WORKOUT_TARGET + " тренировки"
    ));

    dashboard.appendChild(createProgressCard(
        "За этот месяц",
        progress.monthWorkouts,
        "Количество сохранённых тренировок"
    ));

    dashboard.appendChild(createProgressCard(
        "Упражнения за неделю",
        progress.weekExerciseCount,
        "Упражнения во всех тренировках этой недели"
    ));

    dashboard.appendChild(createProgressCard(
        "Упражнения за месяц",
        progress.monthExerciseCount,
        "Упражнения во всех тренировках этого месяца"
    ));

    dashboard.appendChild(createProgressCard(
        "Всего записей упражнений",
        totalExercises,
        "Количество упражнений во всей истории"
    ));

    dashboard.appendChild(createProgressCard(
        "Тренировочный объём",
        Math.round(progress.totalVolume).toLocaleString("ru-RU") + " кг",
        "Сумма веса × повторения × подходы. Это условный объём, не масса тела."
    ));

    renderPointsPanel(stats, progress, dashboard);
    renderAttendanceChart(progress, dashboard);
}



/* ---------- ЗАГРУЗКА СТРАНИЦЫ ПРОГРЕССА ---------- */

function initProgressPage() {
    loadProgressPage().catch(function(error) {
        console.error("Ошибка загрузки прогресса:", error);

        const message = document.getElementById("progressMessage");

        if (message) {
            message.textContent =
                error.message || "Не удалось загрузить прогресс.";
        }
    });
}



async function renderLeaderboard() {
    const message = document.getElementById("leaderboardMessage");
    const total = document.getElementById("leaderboardTotal");
    const wrapper = document.getElementById("leaderboardTableWrapper");
    const body = document.getElementById("leaderboardBody");

    if (!message || !total || !wrapper || !body) {
        console.error("FORM: не найдены HTML-элементы рейтинга.");
        return;
    }

    message.textContent = "Загружаем рейтинг...";
    total.textContent = "—";
    wrapper.hidden = true;
    body.replaceChildren();

    try {
        const response = await sportApiRequest("/api/leaderboard");

        if (!response || !Array.isArray(response.leaderboard)) {
            throw new Error("Некорректный ответ сервера.");
        }

        const users = response.leaderboard;
        total.textContent = String(response.total_users ?? users.length);

        if (users.length === 0) {
            message.textContent = "Пока нет зарегистрированных участников.";
            return;
        }

        users.forEach(function(user) {
            const row = document.createElement("tr");

            if (user.is_you) {
                row.classList.add("leaderboard-you");
            }

            const rank = document.createElement("td");
            rank.textContent = user.rank;

            const name = document.createElement("td");
            name.textContent = user.name;

            if (user.is_you) {
                const you = document.createElement("span");
                you.className = "leaderboard-you-label";
                you.textContent = " Вы";
                name.appendChild(you);
            }

            const streak = document.createElement("td");
            streak.textContent = user.streak_weeks + " нед.";

            const weeklyCount = document.createElement("td");
            weeklyCount.textContent =
                user.week_count + "/" + user.weekly_goal;

            row.append(rank, name, streak, weeklyCount);
            body.appendChild(row);
        });

        wrapper.hidden = false;
        message.textContent = "";
    } catch (error) {
        console.error("FORM: ошибка загрузки рейтинга:", error);
        message.textContent =
            error.message || "Не удалось загрузить рейтинг.";
    }
}


    async function loadProgressPage() {
    // Рейтинг загружается независимо от графика и статистики.
    renderLeaderboard();

    try {
        const data = await getSportData();

        renderWorkoutStats(data.stats, data.workouts);
        renderWeeklyGoal(data.stats);
        renderProgressDashboard(data);
        renderRewards(data);

        const totalVolume = document.getElementById("totalVolume");

        if (totalVolume) {
            const volume = data.workouts.reduce(function(total, workout) {
                return total + getProgressWorkoutVolume(workout);
            }, 0);

            totalVolume.textContent =
                Math.round(volume).toLocaleString("ru-RU") + " кг";
        }
    } catch (error) {
        console.error("Ошибка загрузки страницы прогресса:", error);
    }
}


/* =========================================
ИСТОРИЯ
   ========================================= */

async function initHistoryPage() {
    const container = document.getElementById("workoutHistory");

    if (!container) return;

    try {
        const data = await getSportData();
        renderWorkoutHistory(data.workouts, container);
    } catch (error) {
        console.error("Ошибка загрузки истории:", error);

        container.replaceChildren();

        const message = document.createElement("p");
        message.textContent =
            error.message || "Не удалось загрузить историю.";

        container.appendChild(message);
    }
}


/* =========================================
АВТОЗАПУСК
   ========================================= */

document.addEventListener("DOMContentLoaded", function() {
    if (document.getElementById("workoutForm")) {
        initWorkoutsPage();
        initExerciseSearch();
    }

    if (document.getElementById("progressCanvas")) {
        initProgressPage();
    }

    if (document.getElementById("workoutHistory")) {
        initHistoryPage();
    }
});
