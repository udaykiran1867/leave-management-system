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