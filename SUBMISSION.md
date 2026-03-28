# Leave Management System - Assignment Submission
## Udaya | 28 March 2026

---

## 1. Project Structure

```
practs/
├── backend/
│   ├── server.js              # Express app entry point
│   ├── db.js                  # MySQL connection
│   ├── package.json           # Dependencies
│   └── routes/
│       └── routes.js          # All API endpoints
│
└── frontend/
    ├── index.html
    ├── pages/
    │   ├── login.html
    │   ├── employee.html
    │   └── manager.html
    ├── js/
    │   ├── login.js
    │   ├── employee.js
    │   └── manager.js
    └── css/
        ├── login.css
        ├── employee.css
        └── manager.css
```

---

## 2. SQL Queries

### Create Database
```sql
CREATE DATABASE `leave manage`;
USE `leave manage`;
```

### Users Table
```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password VARCHAR(120) NOT NULL,
    role VARCHAR(20) NOT NULL
);
```

### Leaves Table
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

### Leave Balances Table
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

### Sample Data
```sql
INSERT INTO users (name, email, password, role) VALUES
('Manager One', 'manager@gmail.com', '123', 'manager'),
('Uday', 'uday@gmail.com', '123', 'employee');
```

---

## 3. Source Code

### backend/db.js

```javascript
const mysql = require("mysql2")

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "leave mange"
})
db.connect(err => {
    if (err) {
        console.log(err)
        return
    }

    console.log("connected")
})

module.exports = db
```

---

### backend/server.js

```javascript
const express = require("express")
const cors = require("cors")
const path = require("path")
const routes = require("./routes/routes")

const app = express()

app.use(cors())
app.use(express.json())

app.use(express.static(path.join(__dirname, "../frontend")))

app.use("/", routes)

app.listen(5000, () => {
    console.log("server running")
})
```

---

### backend/routes/routes.js

```javascript
const express = require("express")
const router = express.Router()
const db = require("../db")

const LEAVE_TOTALS = {
    vacation: 18,
    sick: 10,
    other: 6
}

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (error, rows) => {
            if (error) {
                reject(error)
                return
            }

            resolve(rows)
        })
    })
}

function formatDateOnly(value) {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return null
    }

    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    const day = String(date.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function getLeaveDays(fromDate, toDate) {
    const start = formatDateOnly(fromDate)
    const end = formatDateOnly(toDate)

    if (!start || !end) {
        return 0
    }

    const startDate = new Date(`${start}T00:00:00Z`)
    const endDate = new Date(`${end}T00:00:00Z`)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return 0
    }

    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1
    return totalDays > 0 ? totalDays : 0
}

async function ensureBalanceRows(userId) {
    const leaveTypes = Object.keys(LEAVE_TOTALS)

    for (const leaveType of leaveTypes) {
        await runQuery(
            `
            INSERT INTO leave_balances (user_id, leave_type, total_days, used_days)
            VALUES (?, ?, ?, 0)
            ON DUPLICATE KEY UPDATE leave_type = leave_type
            `,
            [userId, leaveType, LEAVE_TOTALS[leaveType]]
        )
    }
}

async function userHasRole(userId, role) {
    const rows = await runQuery("SELECT id, role FROM users WHERE id = ?", [userId])
    return rows.length > 0 && rows[0].role === role
}

async function rollbackSafely() {
    try {
        await runQuery("ROLLBACK")
    } catch (rollbackError) {
        console.error(rollbackError)
    }
}

// LOGIN
router.post("/login", async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
        res.status(400).json({ message: "missing_fields" })
        return
    }

    try {
        const users = await runQuery(
            "SELECT id, name, email, role FROM users WHERE email = ? AND password = ?",
            [email, password]
        )

        if (!users.length) {
            res.status(401).json({ message: "invalid" })
            return
        }

        res.json(users[0])
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "server_error" })
    }
})

// APPLY LEAVE
router.post("/apply-leave", async (req, res) => {
    const { userId, leaveType, fromDate, toDate, reason } = req.body

    if (!userId || !leaveType || !fromDate || !toDate || !reason) {
        res.status(400).json({ message: "missing_fields" })
        return
    }

    if (!LEAVE_TOTALS[leaveType]) {
        res.status(400).json({ message: "invalid_leave_type" })
        return
    }

    const startDate = formatDateOnly(fromDate)
    const endDate = formatDateOnly(toDate)

    if (!startDate || !endDate || getLeaveDays(startDate, endDate) <= 0) {
        res.status(400).json({ message: "invalid_dates" })
        return
    }

    try {
        if (!(await userHasRole(userId, "employee"))) {
            res.status(400).json({ message: "invalid_user" })
            return
        }

        await runQuery(
            "INSERT INTO leaves (user_id, leave_type, from_date, to_date, reason, status) VALUES (?, ?, ?, ?, ?, 'pending')",
            [userId, leaveType, startDate, endDate, reason.trim()]
        )

        res.json({ message: "applied" })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "server_error" })
    }
})

// GET USER'S LEAVES
router.get("/my-leaves/:id", async (req, res) => {
    const userId = Number(req.params.id)

    if (!userId) {
        res.status(400).json({ message: "invalid_user" })
        return
    }

    try {
        const leaveRows = await runQuery(
            `
            SELECT
                l.id,
                l.leave_type,
                l.from_date,
                l.to_date,
                l.reason,
                l.status,
                l.manager_comment,
                l.created_at,
                u.name AS approved_by_name
            FROM leaves l
            LEFT JOIN users u ON l.approved_by = u.id
            WHERE l.user_id = ?
            ORDER BY l.created_at DESC
            `,
            [userId]
        )

        res.json(leaveRows)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "server_error" })
    }
})

// GET ALL LEAVES (Manager)
router.get("/all-leaves", async (req, res) => {
    const managerId = Number(req.query.managerId || 0)
    const status = String(req.query.status || "")

    if (!managerId) {
        res.status(400).json({ message: "missing_manager" })
        return
    }

    try {
        if (!(await userHasRole(managerId, "manager"))) {
            res.status(403).json({ message: "unauthorized" })
            return
        }

        let sql = `
            SELECT
                l.id,
                l.user_id,
                l.leave_type,
                l.from_date,
                l.to_date,
                l.reason,
                l.status,
                l.manager_comment,
                l.approved_by,
                l.reviewed_at,
                l.created_at,
                e.name AS employee_name,
                m.name AS manager_name
            FROM leaves l
            JOIN users e ON l.user_id = e.id
            LEFT JOIN users m ON l.approved_by = m.id
            WHERE e.role = 'employee'
        `
        const params = []

        if (["pending", "approved", "rejected"].includes(status)) {
            sql += " AND l.status = ?"
            params.push(status)
        }

        sql += " ORDER BY l.created_at DESC"

        const leaveRows = await runQuery(sql, params)
        res.json(leaveRows)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "server_error" })
    }
})

// GET LEAVE BALANCES
router.get("/leave-balances/:id", async (req, res) => {
    const userId = Number(req.params.id)

    if (!userId) {
        res.status(400).json({ message: "invalid_user" })
        return
    }

    try {
        await ensureBalanceRows(userId)

        const rows = await runQuery(
            "SELECT leave_type, total_days, used_days FROM leave_balances WHERE user_id = ?",
            [userId]
        )

        const result = {
            vacation: { total: LEAVE_TOTALS.vacation, used: 0, remaining: LEAVE_TOTALS.vacation },
            sick: { total: LEAVE_TOTALS.sick, used: 0, remaining: LEAVE_TOTALS.sick },
            other: { total: LEAVE_TOTALS.other, used: 0, remaining: LEAVE_TOTALS.other }
        }

        rows.forEach(row => {
            if (!result[row.leave_type]) {
                return
            }

            const total = Number(row.total_days || 0)
            const used = Number(row.used_days || 0)

            result[row.leave_type] = {
                total,
                used,
                remaining: total - used
            }
        })

        res.json(result)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "server_error" })
    }
})

// GET LEAVE CALENDAR
router.get("/leave-calendar", async (req, res) => {
    const month = String(req.query.month || "")

    if (!month.match(/^\d{4}-\d{2}$/)) {
        res.status(400).json({ message: "invalid_params" })
        return
    }

    const monthStart = `${month}-01`
    const monthEnd = `${month}-31`

    try {
        const rows = await runQuery(
            `
            SELECT
                l.id,
                l.user_id,
                l.leave_type,
                l.from_date,
                l.to_date,
                l.status,
                u.name AS employee_name
            FROM leaves l
            JOIN users u ON l.user_id = u.id
            WHERE l.status = 'approved'
              AND l.from_date <= ?
              AND l.to_date >= ?
            ORDER BY l.from_date ASC
            `,
            [monthEnd, monthStart]
        )

        res.json(rows)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "server_error" })
    }
})

// UPDATE LEAVE STATUS (Manager Approval)
router.put("/leave/:id", async (req, res) => {
    const leaveId = Number(req.params.id)
    const { managerId, status, managerComment } = req.body

    if (!leaveId || !managerId || !status) {
        res.status(400).json({ message: "missing_fields" })
        return
    }

    if (!["approved", "rejected"].includes(status)) {
        res.status(400).json({ message: "invalid_status" })
        return
    }

    try {
        await runQuery("START TRANSACTION")

        if (!(await userHasRole(managerId, "manager"))) {
            await rollbackSafely()
            res.status(403).json({ message: "unauthorized" })
            return
        }

        const leaveRows = await runQuery(
            "SELECT id, user_id, leave_type, from_date, to_date, status FROM leaves WHERE id = ? FOR UPDATE",
            [leaveId]
        )

        if (!leaveRows.length) {
            await rollbackSafely()
            res.status(404).json({ message: "leave_not_found" })
            return
        }

        const leave = leaveRows[0]
        const leaveDays = getLeaveDays(leave.from_date, leave.to_date)

        if (!leaveDays || !LEAVE_TOTALS[leave.leave_type]) {
            await rollbackSafely()
            res.status(400).json({ message: "invalid_leave_data" })
            return
        }

        await ensureBalanceRows(leave.user_id)

        const balanceRows = await runQuery(
            `
            SELECT total_days, used_days
            FROM leave_balances
            WHERE user_id = ? AND leave_type = ?
            FOR UPDATE
            `,
            [leave.user_id, leave.leave_type]
        )

        const totalDays = Number(balanceRows[0]?.total_days || 0)
        const usedDays = Number(balanceRows[0]?.used_days || 0)

        if (leave.status !== "approved" && status === "approved") {
            if (usedDays + leaveDays > totalDays) {
                await rollbackSafely()
                res.status(400).json({ message: "insufficient_balance" })
                return
            }

            await runQuery(
                "UPDATE leave_balances SET used_days = used_days + ? WHERE user_id = ? AND leave_type = ?",
                [leaveDays, leave.user_id, leave.leave_type]
            )
        }

        if (leave.status === "approved" && status !== "approved") {
            await runQuery(
                "UPDATE leave_balances SET used_days = GREATEST(used_days - ?, 0) WHERE user_id = ? AND leave_type = ?",
                [leaveDays, leave.user_id, leave.leave_type]
            )
        }

        await runQuery(
            `
            UPDATE leaves
            SET status = ?, manager_comment = ?, approved_by = ?, reviewed_at = NOW()
            WHERE id = ?
            `,
            [status, managerComment || null, managerId, leaveId]
        )

        await runQuery("COMMIT")
        res.json({ message: "updated" })
    } catch (error) {
        await rollbackSafely()
        console.error(error)
        res.status(500).json({ message: "server_error" })
    }
})

module.exports = router
```

---

### frontend/js/login.js

```javascript
const apiBase = "http://localhost:5000"

function login() {
    const role = document.getElementById("role").value
    const email = document.getElementById("email").value.trim()
    const password = document.getElementById("password").value.trim()
    const loginButton = document.getElementById("loginButton")

    if (!role || !email || !password) {
        alert("Please select role, email, and password")
        return
    }

    loginButton.disabled = true
    loginButton.textContent = "Signing in..."

    fetch(`${apiBase}/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
    })
        .then(async response => {
            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.message || "Login failed")
            }
            return data
        })
        .then(user => {
            if (user.role !== role) {
                alert("Selected role does not match this account")
                return
            }

            localStorage.setItem("user", JSON.stringify(user))
            if (user.role === "manager") {
                window.location.href = "manager.html"
                return
            }
            window.location.href = "employee.html"
        })
        .catch(error => {
            if (error.message === "invalid") {
                alert("Invalid email or password")
                return
            }
            alert("Unable to login right now")
        })
        .finally(() => {
            loginButton.disabled = false
            loginButton.textContent = "Sign in"
        })
}
```

---

### frontend/js/employee.js

```javascript
const apiBase = "http://localhost:5000"
const user = JSON.parse(localStorage.getItem("user") || "null")

if (!user || user.role !== "employee") {
    window.location.href = "login.html"
}

document.getElementById("employeeName").textContent = user.name

const calendarMonthInput = document.getElementById("employeeCalendarMonth")
const currentMonth = new Date().toISOString().slice(0, 7)
calendarMonthInput.value = currentMonth
calendarMonthInput.addEventListener("change", loadCalendar)

function logout() {
    localStorage.removeItem("user")
    window.location.href = "login.html"
}

function formatDate(value) {
    return new Date(value).toISOString().slice(0, 10)
}

function statusClass(status) {
    if (status === "approved") return "status-approved"
    if (status === "rejected") return "status-rejected"
    return "status-pending"
}

function loadBalances() {
    fetch(`${apiBase}/leave-balances/${user.id}`)
        .then(res => res.json())
        .then(data => {
            document.getElementById("vacationBalance").textContent = data.vacation?.remaining ?? 0
            document.getElementById("sickBalance").textContent = data.sick?.remaining ?? 0
            document.getElementById("personalBalance").textContent = data.other?.remaining ?? 0
        })
}

function loadLeaves() {
    fetch(`${apiBase}/my-leaves/${user.id}`)
        .then(res => res.json())
        .then(rows => {
            const body = document.getElementById("leaveList")
            body.innerHTML = ""

            if (!rows.length) {
                body.innerHTML = '<tr><td colspan="5">No leave requests yet</td></tr>'
                return
            }

            rows.forEach(item => {
                const row = document.createElement("tr")
                row.innerHTML = `
                    <td>${item.leave_type}</td>
                    <td>${formatDate(item.from_date)}</td>
                    <td>${formatDate(item.to_date)}</td>
                    <td><span class="status-pill ${statusClass(item.status)}">${item.status}</span></td>
                    <td>${item.manager_comment || "-"}</td>
                `
                body.appendChild(row)
            })
        })
}

function applyLeave() {
    const leaveType = document.getElementById("leaveType").value
    const fromDate = document.getElementById("fromDate").value
    const toDate = document.getElementById("toDate").value
    const reason = document.getElementById("reason").value.trim()
    const button = document.getElementById("applyButton")

    if (!leaveType || !fromDate || !toDate || !reason) {
        alert("Fill all fields before submitting")
        return
    }

    if (fromDate > toDate) {
        alert("End date cannot be before start date")
        return
    }

    button.disabled = true
    button.textContent = "Submitting..."

    fetch(`${apiBase}/apply-leave`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            userId: user.id,
            leaveType,
            fromDate,
            toDate,
            reason
        })
    })
        .then(async response => {
            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.message || "submit_failed")
            }
        })
        .then(() => {
            document.getElementById("reason").value = ""
            loadLeaves()
            loadBalances()
            loadCalendar()
        })
        .catch(error => {
            if (error.message === "invalid_dates") {
                alert("Please choose valid dates")
                return
            }
            alert("Could not submit leave request")
        })
        .finally(() => {
            button.disabled = false
            button.textContent = "Submit Request"
        })
}

function renderCalendarCell(day, events) {
    const cell = document.createElement("div")
    cell.className = "calendar-cell"

    const dayTag = document.createElement("div")
    dayTag.className = "day-tag"
    dayTag.textContent = day
    cell.appendChild(dayTag)

    events.forEach(event => {
        const badge = document.createElement("div")
        badge.className = "calendar-badge"
        badge.textContent = event
        cell.appendChild(badge)
    })

    return cell
}

function loadCalendar() {
    const month = calendarMonthInput.value
    if (!month) return

    fetch(`${apiBase}/leave-calendar?month=${month}`)
        .then(res => res.json())
        .then(rows => {
            const grid = document.getElementById("employeeCalendar")
            grid.innerHTML = ""

            const firstDay = new Date(`${month}-01T00:00:00`)
            const year = firstDay.getFullYear()
            const monthIndex = firstDay.getMonth()
            const totalDays = new Date(year, monthIndex + 1, 0).getDate()

            const eventsByDay = {}

            rows.forEach(entry => {
                const from = new Date(entry.from_date)
                const to = new Date(entry.to_date)

                for (let date = new Date(from); date <= to; date.setDate(date.getDate() + 1)) {
                    if (date.getFullYear() !== year || date.getMonth() !== monthIndex) {
                        continue
                    }

                    const day = date.getDate()
                    if (!eventsByDay[day]) {
                        eventsByDay[day] = []
                    }
                    eventsByDay[day].push(entry.employee_name)
                }
            })

            for (let day = 1; day <= totalDays; day += 1) {
                grid.appendChild(renderCalendarCell(day, eventsByDay[day] || []))
            }
        })
}

loadBalances()
loadLeaves()
loadCalendar()
```

---

### frontend/js/manager.js

```javascript
const apiBase = "http://localhost:5000"
const user = JSON.parse(localStorage.getItem("user") || "null")

if (!user || user.role !== "manager") {
    window.location.href = "login.html"
}

document.getElementById("managerName").textContent = user.name

const calendarMonthInput = document.getElementById("managerCalendarMonth")
calendarMonthInput.value = new Date().toISOString().slice(0, 7)
calendarMonthInput.addEventListener("change", loadCalendar)

function logout() {
    localStorage.removeItem("user")
    window.location.href = "login.html"
}

function formatDate(value) {
    return new Date(value).toISOString().slice(0, 10)
}

function statusClass(status) {
    if (status === "approved") return "status-approved"
    if (status === "rejected") return "status-rejected"
    return "status-pending"
}

function loadPendingLeaves() {
    fetch(`${apiBase}/all-leaves?managerId=${user.id}&status=pending`)
        .then(res => res.json())
        .then(items => {
            const container = document.getElementById("pendingLeaves")
            container.innerHTML = ""

            if (!items.length) {
                container.innerHTML = '<p class="empty-message">No pending requests right now</p>'
                return
            }

            items.forEach(item => {
                const card = document.createElement("div")
                card.className = "request-card"

                card.innerHTML = `
                    <h3>${item.employee_name}</h3>
                    <p><strong>Type:</strong> ${item.leave_type}</p>
                    <p><strong>Dates:</strong> ${formatDate(item.from_date)} to ${formatDate(item.to_date)}</p>
                    <p><strong>Reason:</strong> ${item.reason}</p>
                `

                const comment = document.createElement("textarea")
                comment.placeholder = "Manager comment"
                comment.rows = 2
                comment.id = `comment-${item.id}`

                const actions = document.createElement("div")
                actions.className = "action-row"

                const approveButton = document.createElement("button")
                approveButton.textContent = "Approve"
                approveButton.onclick = () => updateLeaveStatus(item.id, "approved")

                const rejectButton = document.createElement("button")
                rejectButton.className = "danger"
                rejectButton.textContent = "Reject"
                rejectButton.onclick = () => updateLeaveStatus(item.id, "rejected")

                actions.appendChild(approveButton)
                actions.appendChild(rejectButton)
                card.appendChild(comment)
                card.appendChild(actions)
                container.appendChild(card)
            })
        })
}

function loadAllLeaves() {
    fetch(`${apiBase}/all-leaves?managerId=${user.id}`)
        .then(res => res.json())
        .then(items => {
            const body = document.getElementById("allLeaves")
            body.innerHTML = ""

            if (!items.length) {
                body.innerHTML = '<tr><td colspan="6">No requests found</td></tr>'
                return
            }

            items.forEach(item => {
                const row = document.createElement("tr")
                row.innerHTML = `
                    <td>${item.employee_name}</td>
                    <td>${item.leave_type}</td>
                    <td>${formatDate(item.from_date)}</td>
                    <td>${formatDate(item.to_date)}</td>
                    <td><span class="status-pill ${statusClass(item.status)}">${item.status}</span></td>
                    <td>${item.manager_comment || "-"}</td>
                `
                body.appendChild(row)
            })
        })
}

function updateLeaveStatus(leaveId, status) {
    const commentInput = document.getElementById(`comment-${leaveId}`)
    const managerComment = commentInput ? commentInput.value.trim() : ""

    fetch(`${apiBase}/leave/${leaveId}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            managerId: user.id,
            status,
            managerComment
        })
    })
        .then(async response => {
            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.message || "update_failed")
            }
        })
        .then(() => {
            loadPendingLeaves()
            loadAllLeaves()
            loadCalendar()
        })
        .catch(error => {
            if (error.message === "insufficient_balance") {
                alert("Employee does not have enough leave balance")
                return
            }
            alert("Could not update leave status")
        })
}

function renderCalendarCell(day, events) {
    const cell = document.createElement("div")
    cell.className = "calendar-cell"

    const dayTag = document.createElement("div")
    dayTag.className = "day-tag"
    dayTag.textContent = day
    cell.appendChild(dayTag)

    events.forEach(event => {
        const badge = document.createElement("div")
        badge.className = "calendar-badge"
        badge.textContent = event
        cell.appendChild(badge)
    })

    return cell
}

function loadCalendar() {
    const month = calendarMonthInput.value
    if (!month) return

    fetch(`${apiBase}/leave-calendar?month=${month}`)
        .then(res => res.json())
        .then(rows => {
            const grid = document.getElementById("managerCalendar")
            grid.innerHTML = ""

            const firstDay = new Date(`${month}-01T00:00:00`)
            const year = firstDay.getFullYear()
            const monthIndex = firstDay.getMonth()
            const totalDays = new Date(year, monthIndex + 1, 0).getDate()
            const eventsByDay = {}

            rows.forEach(entry => {
                const from = new Date(entry.from_date)
                const to = new Date(entry.to_date)

                for (let date = new Date(from); date <= to; date.setDate(date.getDate() + 1)) {
                    if (date.getFullYear() !== year || date.getMonth() !== monthIndex) {
                        continue
                    }
                    const day = date.getDate()
                    if (!eventsByDay[day]) {
                        eventsByDay[day] = []
                    }
                    eventsByDay[day].push(entry.employee_name)
                }
            })

            for (let day = 1; day <= totalDays; day += 1) {
                grid.appendChild(renderCalendarCell(day, eventsByDay[day] || []))
            }
        })
}

loadPendingLeaves()
loadAllLeaves()
loadCalendar()
```

---

### backend/package.json

```json
{
  "name": "backend",
  "version": "1.0.0",
  "description": "",
  "main": "db.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "start": "node server.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "cors": "^2.8.6",
    "express": "^5.2.1",
    "mysql2": "^3.20.0"
  }
}
```

---

### frontend/pages/login.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Leave Management Login</title>
    <link rel="stylesheet" href="../css/login.css">
</head>
<body>
    <div class="page-wrap">
        <div class="card auth-card">
            <h1>Employee Leave Management</h1>
            <p class="subtitle">Sign in as employee or manager</p>

            <label for="role">Login As</label>
            <select id="role">
                <option value="">Select role</option>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
            </select>

            <label for="email">Email</label>
            <input type="email" id="email" placeholder="name@company.com">

            <label for="password">Password</label>
            <input type="password" id="password" placeholder="Enter password">

            <button id="loginButton" onclick="login()">Login</button>

            <div class="login-hint">
                <p>Manager demo: manager@gmail.com / 123</p>
                <p>Employee demo: uday@gmail.com / 123</p>
            </div>
        </div>
    </div>
    <script src="../js/login.js"></script>
</body>
</html>
```

---

### frontend/pages/employee.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Employee Dashboard</title>
    <link rel="stylesheet" href="../css/employee.css">
</head>
<body>
    <div class="page-wrap">
        <header class="topbar">
            <h1>Employee Dashboard</h1>
            <div class="topbar-actions">
                <span id="employeeName"></span>
                <button class="secondary" onclick="logout()">Logout</button>
            </div>
        </header>

        <section class="card">
            <h2>Leave Balances</h2>
            <div class="balance-grid">
                <div class="balance-item">
                    <p>Vacation</p>
                    <strong id="vacationBalance">0</strong>
                </div>
                <div class="balance-item">
                    <p>Sick</p>
                    <strong id="sickBalance">0</strong>
                </div>
                <div class="balance-item">
                    <p>Personal</p>
                    <strong id="personalBalance">0</strong>
                </div>
            </div>
        </section>

        <section class="card">
            <h2>Submit Leave Request</h2>
            <div class="form-grid">
                <div>
                    <label for="leaveType">Leave Type</label>
                    <select id="leaveType">
                        <option value="vacation">Vacation</option>
                        <option value="sick">Sick Leave</option>
                        <option value="other">Other Leave</option>
                    </select>
                </div>
                <div>
                    <label for="fromDate">Start Date</label>
                    <input type="date" id="fromDate">
                </div>
                <div>
                    <label for="toDate">End Date</label>
                    <input type="date" id="toDate">
                </div>
                <div class="full-width">
                    <label for="reason">Reason</label>
                    <textarea id="reason" rows="3" placeholder="Reason for leave"></textarea>
                </div>
            </div>
            <button id="applyButton" onclick="applyLeave()">Submit Request</button>
        </section>

        <section class="card">
            <h2>My Requests</h2>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Status</th>
                            <th>Manager Comment</th>
                        </tr>
                    </thead>
                    <tbody id="leaveList"></tbody>
                </table>
            </div>
        </section>

        <section class="card">
            <div class="calendar-header">
                <h2>Team Leave Calendar</h2>
                <input type="month" id="employeeCalendarMonth">
            </div>
            <div id="employeeCalendar" class="calendar-grid"></div>
        </section>
    </div>
    <script src="../js/employee.js"></script>
</body>
</html>
```

---

### frontend/pages/manager.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manager Dashboard</title>
    <link rel="stylesheet" href="../css/manager.css">
</head>
<body>
    <div class="page-wrap">
        <header class="topbar">
            <h1>Manager Dashboard</h1>
            <div class="topbar-actions">
                <span id="managerName"></span>
                <button class="secondary" onclick="logout()">Logout</button>
            </div>
        </header>

        <section class="card">
            <h2>Pending Approvals</h2>
            <div id="pendingLeaves" class="request-list"></div>
        </section>

        <section class="card">
            <h2>All Requests</h2>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Type</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Status</th>
                            <th>Comment</th>
                        </tr>
                    </thead>
                    <tbody id="allLeaves"></tbody>
                </table>
            </div>
        </section>

        <section class="card">
            <div class="calendar-header">
                <h2>Leave Calendar</h2>
                <input type="month" id="managerCalendarMonth">
            </div>
            <div id="managerCalendar" class="calendar-grid"></div>
        </section>
    </div>
    <script src="../js/manager.js"></script>
</body>
</html>
```

---

### frontend/css/login.css

```css
:where(*, *::before, *::after) {
    box-sizing: border-box;
}

body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    font-family: "Segoe UI", "Trebuchet MS", "Tahoma", sans-serif;
    line-height: 1.45;
    color: #1a2438;
    background:
        radial-gradient(1000px 440px at -10% -20%, #dbe8ff 0, transparent 60%),
        radial-gradient(760px 360px at 120% 10%, #d5ede7 0, transparent 60%),
        #f3f7fc;
}

.page-wrap {
    width: min(470px, 100%);
}

.card {
    position: relative;
    border: 1px solid #d7e0ee;
    border-radius: 18px;
    padding: 28px;
    background: #ffffff;
    box-shadow: 0 18px 44px rgba(18, 32, 59, 0.12);
}

.card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 4px;
    border-radius: 18px 18px 0 0;
    background: linear-gradient(90deg, #1454bd, #2f73d9);
}

h1,
p {
    margin: 0;
}

h1 {
    font-size: clamp(1.5rem, 4vw, 1.9rem);
    letter-spacing: -0.02em;
}

.subtitle {
    margin-top: 8px;
    margin-bottom: 18px;
    color: #5d6a82;
}

label {
    display: block;
    margin: 12px 0 6px;
    font-size: 0.88rem;
    font-weight: 600;
    color: #2a3750;
}

input,
select,
button {
    width: 100%;
    font: inherit;
}

input,
select {
    border: 1px solid #d7e0ee;
    border-radius: 14px;
    padding: 11px 12px;
    background: #fff;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
}

input::placeholder {
    color: #8a95a9;
}

input:focus-visible,
select:focus-visible {
    border-color: #7ea3e8;
    box-shadow: 0 0 0 4px rgba(20, 84, 189, 0.16);
}

button {
    margin-top: 16px;
    border: 0;
    border-radius: 14px;
    padding: 11px 14px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #1454bd, #2f6ed5);
    cursor: pointer;
    transition: transform 0.15s, filter 0.2s;
}

button:hover {
    transform: translateY(-1px);
    filter: brightness(0.96);
}

button:focus-visible {
    outline: 3px solid rgba(20, 84, 189, 0.16);
    outline-offset: 2px;
}

button:disabled {
    opacity: 0.7;
    cursor: wait;
    transform: none;
}

.login-hint {
    margin-top: 16px;
    padding: 11px 12px;
    border: 1px dashed #c8d5ea;
    border-radius: 12px;
    background: #f8fbff;
    color: #5d6a82;
    font-size: 0.84rem;
    display: grid;
    gap: 4px;
}
```

---

### frontend/css/employee.css

```css
:where(*, *::before, *::after) {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: "Segoe UI", "Trebuchet MS", "Tahoma", sans-serif;
    line-height: 1.45;
    color: #1c283d;
    background:
        radial-gradient(1100px 520px at -15% -20%, #deecff 0, transparent 60%),
        radial-gradient(880px 420px at 110% 0, #dff4ec 0, transparent 60%),
        #f2f6fc;
}

.page-wrap {
    width: min(1120px, 94vw);
    margin: 24px auto 36px;
    display: grid;
    gap: 12px;
}

.card {
    background: #ffffff;
    border: 1px solid #d8e1ef;
    border-radius: 14px;
    padding: 16px 17px;
    box-shadow: 0 10px 26px rgba(21, 36, 62, 0.06);
}

h1,
h2,
p {
    margin: 0;
}

h1 {
    font-size: clamp(1.3rem, 2.4vw, 1.7rem);
    letter-spacing: -0.02em;
}

h2 {
    font-size: 1.1rem;
    margin-bottom: 10px;
}

label {
    display: block;
    font-size: 0.88rem;
    font-weight: 600;
    margin-bottom: 6px;
}

input,
select,
textarea,
button {
    font: inherit;
}

input,
select,
textarea {
    width: 100%;
    border: 1px solid #d8e1ef;
    border-radius: 12px;
    padding: 9px 11px;
    background: #fff;
    transition: border-color 0.2s, box-shadow 0.2s;
}

input::placeholder,
textarea::placeholder {
    color: #8a95a9;
}

input:focus-visible,
select:focus-visible,
textarea:focus-visible {
    border-color: #7ca2e8;
    box-shadow: 0 0 0 4px rgba(17, 90, 195, 0.14);
    outline: none;
}

textarea {
    resize: vertical;
}

button {
    border: 0;
    border-radius: 12px;
    padding: 9px 13px;
    color: #fff;
    background: linear-gradient(135deg, #115ac3, #2f75da);
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s, filter 0.2s;
}

button:hover {
    transform: translateY(-1px);
    filter: brightness(0.96);
}

button:focus-visible {
    outline: 3px solid rgba(17, 90, 195, 0.2);
    outline-offset: 2px;
}

button:disabled {
    opacity: 0.7;
    cursor: wait;
}

button.secondary {
    background: #e8f0ff;
    color: #1d4d9e;
}

button.secondary:hover {
    background: #d8e7ff;
}

button.danger {
    background: #c83d3d;
}

button.danger:hover {
    background: #ab2f2f;
}

.topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.topbar-actions {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #60718c;
    font-weight: 600;
}

.balance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
}

.balance-item {
    padding: 12px;
    border: 1px solid #d8e1ef;
    border-radius: 12px;
    background: linear-gradient(180deg, #f9fbff, #eef5ff);
}

.balance-item p {
    color: #60718c;
    margin-bottom: 7px;
}

.balance-item strong {
    font-size: 1.4rem;
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 10px;
    margin-bottom: 10px;
}

.full-width {
    grid-column: 1 / -1;
}

.table-wrap {
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
}

th,
td {
    border-bottom: 1px solid #d8e1ef;
    text-align: left;
    padding: 9px 8px;
    font-size: 0.92rem;
    white-space: nowrap;
}

th {
    position: sticky;
    top: 0;
    background: #f7faff;
    color: #60718c;
    font-weight: 600;
}

tbody tr:nth-child(even) {
    background: #fbfdff;
}

tbody tr:hover {
    background: #f2f7ff;
}

.status-pill {
    display: inline-block;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: capitalize;
}

.status-pending {
    background: #fff4d6;
    color: #986a00;
}

.status-approved {
    background: #e0f7ee;
    color: #117650;
}

.status-rejected {
    background: #ffe5e5;
    color: #b43d3d;
}

.calendar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}

.calendar-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
}

.calendar-cell {
    min-height: 96px;
    padding: 8px;
    border: 1px solid #d8e1ef;
    border-radius: 12px;
    background: #fbfdff;
}

.day-tag {
    margin-bottom: 6px;
    font-weight: 700;
}

.calendar-badge {
    width: fit-content;
    padding: 3px 8px;
    margin-bottom: 4px;
    border-radius: 999px;
    font-size: 0.75rem;
    color: #154e9e;
    background: #e6f0ff;
}
```

---

### frontend/css/manager.css

```css
:where(*, *::before, *::after) {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: sans-serif;
    line-height: 1.45;
    color: #1c283d;
    background:
        radial-gradient(980px 480px at -10% -20%, #dbe9ff 0, transparent 60%),
        radial-gradient(820px 390px at 110% 0, #e1f3e8 0, transparent 60%),
        #f2f6fc;
}

.page-wrap {
    width: min(1140px, 94vw);
    margin: 24px auto 36px;
    display: grid;
    gap: 12px;
}

.card {
    background: #ffffff;
    border: 1px solid #d8e1ef;
    border-radius: 14px;
    padding: 16px 17px;
    box-shadow: 0 10px 26px rgba(21, 36, 62, 0.06);
}

h1,h2,h3,p {
    margin: 0;
}

h1 {
    font-size: clamp(1.3rem, 2.4vw, 1.7rem);
    letter-spacing: -0.02em;
}

h2 {
    font-size: 1.1rem;
    margin-bottom: 10px;
}

h3 {
    font-size: 1rem;
}

input,textarea,button {
    font: inherit;
}

input,textarea {
    width: 100%;
    border: 1px solid #d8e1ef;
    border-radius: 12px;
    padding: 9px 11px;
    background: #fff;
    transition: border-color 0.2s, box-shadow 0.2s;
}

input::placeholder,textarea::placeholder {
    color: #8a95a9;
}

input:focus-visible,textarea:focus-visible {
    border-color: #7ca2e8;
    box-shadow: 0 0 0 4px rgba(17, 90, 195, 0.14);
    outline: none;
}

textarea {
    resize: vertical;
}

button {
    border: 0;
    border-radius: 12px;
    padding: 8px 12px;
    color: #fff;
    background: linear-gradient(135deg, #115ac3, #2e73d7);
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s, filter 0.2s;
}

button:hover {
    transform: translateY(-1px);
    filter: brightness(0.96);
}

button:focus-visible {
    outline: 3px solid rgba(17, 90, 195, 0.2);
    outline-offset: 2px;
}

button.secondary {
    background: #e8f0ff;
    color: #1d4d9e;
}

button.secondary:hover {
    background: #d8e7ff;
}

button.danger {
    background: #c63f3f;
}

button.danger:hover {
    background: #aa3131;
}

.topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.topbar-actions {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #60718c;
    font-weight: 600;
}

.request-list {
    display: grid;
    gap: 10px;
}

.request-card {
    border: 1px solid #d8e1ef;
    border-radius: 12px;
    padding: 12px;
    background: linear-gradient(180deg, #ffffff, #f8fbff);
    display: grid;
    gap: 7px;
}

.request-card p {
    color: #2c3750;
    line-height: 1.35;
}

.request-card strong {
    color: #1a2c49;
}

.action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.table-wrap {
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
}

th,
td {
    border-bottom: 1px solid #d8e1ef;
    text-align: left;
    padding: 9px 8px;
    font-size: 0.92rem;
    white-space: nowrap;
}

th {
    position: sticky;
    top: 0;
    background: #f7faff;
    color: #60718c;
    font-weight: 600;
}

tbody tr:nth-child(even) {
    background: #fbfdff;
}

tbody tr:hover {
    background: #f2f7ff;
}

.status-pill {
    display: inline-block;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: capitalize;
}

.status-pending {
    background: #fff4d6;
    color: #986a00;
}

.status-approved {
    background: #dff7ec;
    color: #117650;
}

.status-rejected {
    background: #ffe6e6;
    color: #b43d3d;
}

.calendar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}

.calendar-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
}

.calendar-cell {
    min-height: 96px;
    padding: 8px;
    border: 1px solid #d8e1ef;
    border-radius: 12px;
    background: #fbfdff;
}

.day-tag {
    margin-bottom: 6px;
    font-weight: 700;
}

.calendar-badge {
    width: fit-content;
    padding: 3px 8px;
    margin-bottom: 4px;
    border-radius: 999px;
    font-size: 0.75rem;
    color: #154e9e;
    background: #e6f0ff;
}

.empty-message {
    color: #60718c;
}
```

---

## Demo Credentials

**Manager:** `manager@gmail.com` / `123`  
**Employee:** `uday@gmail.com` / `123`

## Setup

```bash
cd backend
npm install
npm start
```

Backend: `http://localhost:5000`  
Frontend: `frontend/pages/login.html`

