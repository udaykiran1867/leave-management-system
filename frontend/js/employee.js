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