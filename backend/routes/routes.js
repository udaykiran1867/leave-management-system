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
