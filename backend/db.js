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