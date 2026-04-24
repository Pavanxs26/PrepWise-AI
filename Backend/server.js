require("dotenv").config({ path: "./.env" });
const app = require("./src/app")
const connectToDB = require("./src/config/database")

connectToDB()


app.listen(3000, () => {
    console.log("Server is running on port 3000")
})

console.log("ENV PATH:", process.cwd());

console.log("KEY:", process.env.GOOGLE_GENAI_API_KEY);