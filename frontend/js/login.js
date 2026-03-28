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
            loginButton.textContent = "Login"
        })
}