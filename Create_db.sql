-- Создание базы данных
CREATE DATABASE IF NOT EXISTS hr_interviews;
USE hr_interviews;

-- Таблица навыков
CREATE TABLE IF NOT EXISTS skills (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица специалистов
CREATE TABLE IF NOT EXISTS specialists (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    full_name VARCHAR(200) NOT NULL,
    available_from TIME NOT NULL,
    available_to TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Связь специалистов и навыков (многие-ко-многим)
CREATE TABLE IF NOT EXISTS specialist_skills (
    specialist_id VARCHAR(36),
    skill_id VARCHAR(36),
    PRIMARY KEY (specialist_id, skill_id),
    FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- Таблица собеседований
CREATE TABLE IF NOT EXISTS interviews (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    specialist_id VARCHAR(36) NOT NULL,
    candidate_name VARCHAR(200) NOT NULL,
    interview_time TIME NOT NULL,
    duration_minutes INT DEFAULT 60, -- М часов N минут (по умолчанию 1 час)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE CASCADE
);

-- Связь собеседований и навыков соискателя
CREATE TABLE IF NOT EXISTS interview_skills (
    interview_id VARCHAR(36),
    skill_id VARCHAR(36),
    PRIMARY KEY (interview_id, skill_id),
    FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- Начальные данные (несколько навыков)
INSERT INTO skills (id, name) VALUES 
('skill-1', 'JavaScript'),
('skill-2', 'Node.js'),
('skill-3', 'React'),
('skill-4', 'TypeScript'),
('skill-5', 'SQL'),
('skill-6', 'MongoDB'),
('skill-7', 'Docker'),
('skill-8', 'AWS'),
('skill-9', 'Python'),
('skill-10', 'Java');
