const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const { randomUUID } = require('crypto'); 
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Функция для генерации UUID
function generateUUID() {
    try {
        
        if (randomUUID) {
            return randomUUID();
        }
        
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    } catch (error) {
        console.error('Error generating UUID:', error);
        
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

// Конфигурация базы данных
const dbConfig = {
    host: '127.0.0.1',
    user: 'root',
    password: 'olesyazhurok04@',
    database: 'hr_interviews',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Создание пула соединений
let pool;

async function initDatabase() {
    pool = mysql.createPool(dbConfig);
    
    try {
        const connection = await pool.getConnection();
        console.log('Connected to MySQL database');
        connection.release();
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
}


app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));


app.get('/api/skills', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM skills ORDER BY name');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching skills:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/skills', async (req, res) => {
    try {
        const { name } = req.body;
        const skillId = generateUUID();
        console.log('Generated skill ID:', skillId);
        
        await pool.query(
            'INSERT INTO skills (id, name) VALUES (?, ?)',
            [skillId, name]
        );
        
        const [newSkill] = await pool.query(
            'SELECT * FROM skills WHERE id = ?',
            [skillId]
        );
        res.status(201).json(newSkill[0]);
    } catch (error) {
        console.error('Error adding skill:', error);
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/specialists', async (req, res) => {
    try {
        const [specialists] = await pool.query('SELECT * FROM specialists ORDER BY full_name');
        
        // Получаем навыки для каждого специалиста
        for (let specialist of specialists) {
            const [skills] = await pool.query(`
                SELECT s.* FROM skills s
                JOIN specialist_skills ss ON s.id = ss.skill_id
                WHERE ss.specialist_id = ?
            `, [specialist.id]);
            specialist.skills = skills;
            
            // Получаем собеседования специалиста
            const [interviews] = await pool.query(`
                SELECT i.* FROM interviews i
                WHERE i.specialist_id = ?
                ORDER BY i.interview_time
            `, [specialist.id]);
            
            // Получаем навыки для каждого собеседования
            for (let interview of interviews) {
                const [interviewSkills] = await pool.query(`
                    SELECT s.* FROM skills s
                    JOIN interview_skills isk ON s.id = isk.skill_id
                    WHERE isk.interview_id = ?
                `, [interview.id]);
                interview.skills = interviewSkills;
            }
            
            specialist.interviews = interviews;
        }
        
        res.json(specialists);
    } catch (error) {
        console.error('Error fetching specialists:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/specialists', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { full_name, available_from, available_to, skills } = req.body;
        
        console.log('Creating specialist with data:', { full_name, available_from, available_to, skills });
        
        // Генерируем UUID для специалиста
        const specialistId = generateUUID();
        console.log('Generated specialist ID:', specialistId);
        
        // Проверяем что ID валидный
        if (!specialistId || specialistId === '0') {
            throw new Error('Invalid specialist ID generated');
        }
        
        // Создаем специалиста
        await connection.query(
            'INSERT INTO specialists (id, full_name, available_from, available_to) VALUES (?, ?, ?, ?)',
            [specialistId, full_name, available_from, available_to]
        );
        
        console.log('Created specialist with ID:', specialistId);
        
        // Добавляем навыки специалиста
        if (skills && skills.length > 0) {
            console.log('Adding skills:', skills);
            for (const skillId of skills) {
                console.log('Linking skill:', skillId, 'to specialist:', specialistId);
                await connection.query(
                    'INSERT INTO specialist_skills (specialist_id, skill_id) VALUES (?, ?)',
                    [specialistId, skillId]
                );
            }
        }
        
        await connection.commit();
        
        // Получаем созданного специалиста с навыками
        const [newSpecialistRows] = await connection.query(
            'SELECT * FROM specialists WHERE id = ?',
            [specialistId]
        );
        
        if (newSpecialistRows.length === 0) {
            throw new Error('Failed to retrieve created specialist');
        }
        
        const newSpecialist = newSpecialistRows[0];
        
        const [specialistSkills] = await connection.query(`
            SELECT s.* FROM skills s
            JOIN specialist_skills ss ON s.id = ss.skill_id
            WHERE ss.specialist_id = ?
        `, [specialistId]);
        
        newSpecialist.skills = specialistSkills;
        newSpecialist.interviews = [];
        
        console.log('Successfully created specialist:', newSpecialist);
        
        res.status(201).json(newSpecialist);
    } catch (error) {
        await connection.rollback();
        console.error('Error creating specialist:', error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

app.put('/api/specialists/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { full_name, available_from, available_to, skills } = req.body;
        
        console.log('Updating specialist:', id, { full_name, available_from, available_to, skills });
        
        // Обновляем специалиста
        await connection.query(
            'UPDATE specialists SET full_name = ?, available_from = ?, available_to = ? WHERE id = ?',
            [full_name, available_from, available_to, id]
        );
        
        // Удаляем старые навыки
        await connection.query(
            'DELETE FROM specialist_skills WHERE specialist_id = ?',
            [id]
        );
        
        // Добавляем новые навыки
        if (skills && skills.length > 0) {
            for (const skillId of skills) {
                await connection.query(
                    'INSERT INTO specialist_skills (specialist_id, skill_id) VALUES (?, ?)',
                    [id, skillId]
                );
            }
        }
        
        await connection.commit();
        
        res.json({ message: 'Specialist updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating specialist:', error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

app.delete('/api/specialists/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM specialists WHERE id = ?', [req.params.id]);
        res.json({ message: 'Specialist deleted successfully' });
    } catch (error) {
        console.error('Error deleting specialist:', error);
        res.status(500).json({ error: error.message });
    }
});


app.post('/api/interviews', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { specialist_id, candidate_name, interview_time, duration_minutes = 60, skills } = req.body;
        
        console.log('Creating interview:', { specialist_id, candidate_name, interview_time, duration_minutes, skills });
        
        // Проверяем существование специалиста
        const [specialistRows] = await connection.query(
            'SELECT * FROM specialists WHERE id = ?',
            [specialist_id]
        );
        
        if (specialistRows.length === 0) {
            throw new Error('Specialist not found');
        }
        
        const specialist = specialistRows[0];
        
        // Проверяем доступность специалиста в это время
        const interviewTime = new Date(`2000-01-01T${interview_time}`);
        const availableFrom = new Date(`2000-01-01T${specialist.available_from}`);
        const availableTo = new Date(`2000-01-01T${specialist.available_to}`);
        
        if (interviewTime < availableFrom || interviewTime > availableTo) {
            return res.status(400).json({ 
                error: 'Specialist is not available at this time' 
            });
        }
        
        // Проверяем пересечение по времени
        const [existingInterviews] = await connection.query(`
            SELECT * FROM interviews 
            WHERE specialist_id = ? 
            AND (
                interview_time BETWEEN DATE_SUB(?, INTERVAL ? MINUTE) 
                AND DATE_ADD(?, INTERVAL ? MINUTE)
                OR DATE_ADD(interview_time, INTERVAL duration_minutes MINUTE) BETWEEN DATE_SUB(?, INTERVAL ? MINUTE) 
                AND DATE_ADD(?, INTERVAL ? MINUTE)
            )
        `, [
            specialist_id, 
            interview_time, duration_minutes, 
            interview_time, duration_minutes,
            interview_time, duration_minutes,
            interview_time, duration_minutes
        ]);
        
        if (existingInterviews.length > 0) {
            return res.status(400).json({ 
                error: 'Time slot overlaps with existing interview' 
            });
        }
        
        // Получаем навыки специалиста
        const [specialistSkillsRows] = await connection.query(`
            SELECT skill_id FROM specialist_skills WHERE specialist_id = ?
        `, [specialist_id]);
        
        const specialistSkillIds = specialistSkillsRows.map(s => s.skill_id);
        
        // Проверяем совпадение навыков (минимум 80%)
        if (skills && skills.length > 0 && specialistSkillIds.length > 0) {
            const matchingSkills = skills.filter(skillId => 
                specialistSkillIds.includes(skillId)
            );
            const matchPercentage = (matchingSkills.length / skills.length) * 100;
            
            if (matchPercentage < 80) {
                return res.status(400).json({ 
                    error: `Skill match is only ${matchPercentage.toFixed(0)}% (minimum 80% required)` 
                });
            }
        }
        
        // Генерируем UUID для собеседования
        const interviewId = generateUUID();
        console.log('Generated interview ID:', interviewId);
        
        // Создаем собеседование
        await connection.query(
            'INSERT INTO interviews (id, specialist_id, candidate_name, interview_time, duration_minutes) VALUES (?, ?, ?, ?, ?)',
            [interviewId, specialist_id, candidate_name, interview_time, duration_minutes]
        );
        
        // Добавляем навыки собеседования
        if (skills && skills.length > 0) {
            for (const skillId of skills) {
                await connection.query(
                    'INSERT INTO interview_skills (interview_id, skill_id) VALUES (?, ?)',
                    [interviewId, skillId]
                );
            }
        }
        
        await connection.commit();
        
        // Получаем созданное собеседование
        const [newInterviewRows] = await connection.query(
            'SELECT * FROM interviews WHERE id = ?',
            [interviewId]
        );
        
        const newInterview = newInterviewRows[0];
        
        if (skills && skills.length > 0) {
            const [interviewSkills] = await connection.query(`
                SELECT s.* FROM skills s
                WHERE s.id IN (?)
            `, [skills]);
            newInterview.skills = interviewSkills;
        } else {
            newInterview.skills = [];
        }
        
        console.log('Successfully created interview:', newInterview);
        
        res.status(201).json(newInterview);
    } catch (error) {
        await connection.rollback();
        console.error('Error creating interview:', error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

app.delete('/api/interviews/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM interviews WHERE id = ?', [req.params.id]);
        res.json({ message: 'Interview deleted successfully' });
    } catch (error) {
        console.error('Error deleting interview:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/interviews/:id/transfer', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { new_specialist_id } = req.body;
        
        console.log('Transferring interview:', id, 'to specialist:', new_specialist_id);
        
        // Получаем текущее собеседование
        const [interviewRows] = await connection.query(
            'SELECT * FROM interviews WHERE id = ?',
            [id]
        );
        
        if (interviewRows.length === 0) {
            throw new Error('Interview not found');
        }
        
        const interview = interviewRows[0];
        
        // Получаем нового специалиста
        const [newSpecialistRows] = await connection.query(
            'SELECT * FROM specialists WHERE id = ?',
            [new_specialist_id]
        );
        
        if (newSpecialistRows.length === 0) {
            throw new Error('New specialist not found');
        }
        
        const newSpecialist = newSpecialistRows[0];
        
        // Проверяем доступность нового специалиста
        const interviewTime = new Date(`2000-01-01T${interview.interview_time}`);
        const availableFrom = new Date(`2000-01-01T${newSpecialist.available_from}`);
        const availableTo = new Date(`2000-01-01T${newSpecialist.available_to}`);
        
        if (interviewTime < availableFrom || interviewTime > availableTo) {
            return res.status(400).json({ 
                error: 'New specialist is not available at this time' 
            });
        }
        
        // Проверяем пересечение по времени у нового специалиста
        const [existingInterviews] = await connection.query(`
            SELECT * FROM interviews 
            WHERE specialist_id = ? 
            AND id != ?
            AND (
                interview_time BETWEEN DATE_SUB(?, INTERVAL ? MINUTE) 
                AND DATE_ADD(?, INTERVAL ? MINUTE)
                OR DATE_ADD(interview_time, INTERVAL duration_minutes MINUTE) BETWEEN DATE_SUB(?, INTERVAL ? MINUTE) 
                AND DATE_ADD(?, INTERVAL ? MINUTE)
            )
        `, [
            new_specialist_id, 
            id,
            interview.interview_time, interview.duration_minutes,
            interview.interview_time, interview.duration_minutes,
            interview.interview_time, interview.duration_minutes,
            interview.interview_time, interview.duration_minutes
        ]);
        
        if (existingInterviews.length > 0) {
            return res.status(400).json({ 
                error: 'Time slot overlaps with existing interview for new specialist' 
            });
        }
        
        // Получаем навыки собеседования
        const [interviewSkillsRows] = await connection.query(`
            SELECT skill_id FROM interview_skills WHERE interview_id = ?
        `, [id]);
        
        const interviewSkillIds = interviewSkillsRows.map(s => s.skill_id);
        
        // Получаем навыки нового специалиста
        const [newSpecialistSkillsRows] = await connection.query(`
            SELECT skill_id FROM specialist_skills WHERE specialist_id = ?
        `, [new_specialist_id]);
        
        const newSpecialistSkillIds = newSpecialistSkillsRows.map(s => s.skill_id);
        
        // Проверяем совпадение навыков
        if (interviewSkillIds.length > 0 && newSpecialistSkillIds.length > 0) {
            const matchingSkills = interviewSkillIds.filter(skillId => 
                newSpecialistSkillIds.includes(skillId)
            );
            const matchPercentage = (matchingSkills.length / interviewSkillIds.length) * 100;
            
            if (matchPercentage < 80) {
                return res.status(400).json({ 
                    error: `Skill match is only ${matchPercentage.toFixed(0)}% (minimum 80% required)` 
                });
            }
        }
        
        // Переводим собеседование
        await connection.query(
            'UPDATE interviews SET specialist_id = ? WHERE id = ?',
            [new_specialist_id, id]
        );
        
        await connection.commit();
        
        res.json({ message: 'Interview transferred successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error transferring interview:', error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Маршрут для главной страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Обработка ошибок 404
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Обработка ошибок сервера
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Запуск сервера
async function startServer() {
    await initDatabase();
    
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log(`Open in browser: http://localhost:${PORT}`);
    });
}

startServer();
