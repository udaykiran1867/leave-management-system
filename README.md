## Project folders
- backend -> Node.js + Express + MySQL APIs
- frontend -> HTML, CSS, JavaScript pages

## 1. Database setup (MySQL)

Open MySQL and run the below SQL step by step.

```sql
CREATE DATABASE `leave manage`;
USE `leave manage`;
```

### users table
```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password VARCHAR(120) NOT NULL,
    role VARCHAR(20) NOT NULL
);
```

### leaves table
```sql
CREATE TABLE leaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    leave_type VARCHAR(20) NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    manager_comment TEXT,
    approved_by INT,
    reviewed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### leave_balances table
```sql
CREATE TABLE leave_balances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    leave_type VARCHAR(20) NOT NULL,
    total_days INT NOT NULL,
    used_days INT NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_user_leave_type (user_id, leave_type)
);
```

## 2. Insert sample users

```sql
INSERT INTO users (name, email, password, role) VALUES
('Manager One', 'manager@gmail.com', '123', 'manager'),
('Uday', 'uday@gmail.com', '123', 'employee')
```

## 3. Backend setup

Commands to run backend

```bash
cd backend
npm install
npm start
```

Backend runs on:
- `http://localhost:5000`

## 4. Frontend setup

open:
- `frontend/index.html`


Demo login
Manager: `manager@gmail.com` / `123`
Employee: `uday@gmail.com` / `123`


