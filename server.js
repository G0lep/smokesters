const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Путь к файлу с данными
const DATA_FILE = path.join(__dirname, 'data', 'state.json');

// Функция чтения состояния
function readState() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        // Если файла нет или ошибка — создаём начальное состояние
        const initialState = {
            totalOpens: 0,
            smokeDropCount: 0,
            notSmokeDropCount: 0,
            notSmokeItemsInCase: 1,   // изначально 1 предмет "не курить" (вместе с 1 "курить" даёт шанс 1/2)
            lastOpenTimestamp: 0,
            cooldownMultiplier: 1.0
        };
        saveState(initialState);
        return initialState;
    }
}

// Функция сохранения состояния
function saveState(state) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// Конфигурация
const BASE_COOLDOWN_MS = 60 * 1000; // 1 минута
const OPENINGS_TO_INCREASE = 4;              // каждые 4 открытия добавляем +1 "не курить"

// Эндпоинт получения текущего состояния
app.get('/state', (req, res) => {
    const state = readState();
    // Вычисляем оставшееся время кулдауна
    let remainingMs = 0;
    if (state.totalOpens > 0) {
        const currentCooldown = BASE_COOLDOWN_MS * state.cooldownMultiplier;
        const elapsed = Date.now() - state.lastOpenTimestamp;
        remainingMs = Math.max(0, currentCooldown - elapsed);
    }
    // Шанс "курить" в процентах
    const smokeChance = 1 / (1 + state.notSmokeItemsInCase);
    
    res.json({
        totalOpens: state.totalOpens,
        smokeDropCount: state.smokeDropCount,
        notSmokeDropCount: state.notSmokeDropCount,
        notSmokeItemsInCase: state.notSmokeItemsInCase,
        smokeChance: smokeChance,
        cooldownMultiplier: state.cooldownMultiplier,
        remainingCooldownMs: remainingMs,
        canOpen: remainingMs === 0
    });
});

// Эндпоинт открытия кейса
app.post('/open', (req, res) => {
    let state = readState();
    const now = Date.now();
    
    // Проверка кулдауна
    if (state.totalOpens > 0) {
        const currentCooldown = BASE_COOLDOWN_MS * state.cooldownMultiplier;
        const elapsed = now - state.lastOpenTimestamp;
        if (elapsed < currentCooldown) {
            return res.status(429).json({ error: 'Кулдаун активен', remainingMs: currentCooldown - elapsed });
        }
    }
    
    // Определяем выпавший предмет
    const smokeProbability = 1 / (1 + state.notSmokeItemsInCase);
    const rand = Math.random();
    const droppedSmoke = rand < smokeProbability;
    
    // Обновляем статистику
    if (droppedSmoke) {
        state.smokeDropCount++;
    } else {
        state.notSmokeDropCount++;
    }
    state.totalOpens++;
    
    // Каждые 4 открытия увеличиваем количество предметов "не курить" в кейсе
    if (state.totalOpens % OPENINGS_TO_INCREASE === 0 && state.totalOpens > 0) {
        state.notSmokeItemsInCase++;
    }
    
    // Обновляем множитель кулдауна (+1%)
    state.cooldownMultiplier *= 1.01;
    state.lastOpenTimestamp = now;
    
    saveState(state);
    
    // Новое состояние для ответа
    const newRemaining = BASE_COOLDOWN_MS * state.cooldownMultiplier;
    res.json({
        success: true,
        result: droppedSmoke ? 'smoke' : 'notSmoke',
        totalOpens: state.totalOpens,
        smokeDropCount: state.smokeDropCount,
        notSmokeDropCount: state.notSmokeDropCount,
        notSmokeItemsInCase: state.notSmokeItemsInCase,
        smokeChance: 1 / (1 + state.notSmokeItemsInCase),
        cooldownMultiplier: state.cooldownMultiplier,
        remainingCooldownMs: newRemaining
    });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});