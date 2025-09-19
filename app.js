import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import adminRouter from "./routes/adminRouter.js";
import userRouter from "./routes/userRouter.js";
import path from 'path'
import nocache from "nocache";
import { fileURLToPath } from "url";
import session from "express-session";
const app = express();

// Setting Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Env config
dotenv.config();

//DB Connection
connectDB();

//Setting Port
const port = process.env.PORT 

//Setting Session
app.use(session({
  secret:process.env.SESSION_SECRET,
  resave:false ,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 } 
}))
//No Cashe
app.use(nocache());

// Setting viewEngine
app.set('view engine' , 'ejs') ;
app.set('views',path.join(__dirname ,'views'))

// Setting Middleware 
app.use(express.json());
app.use(express.urlencoded({extended:true})) ;
app.use(express.static(path.join(__dirname , 'public')));


//Setup Router
app.use("/admin", adminRouter); //admin router 
app.use('/',userRouter) //User Router



app.get("/", (req, res) => {
  res.send("Hello World");
});



app.listen(port, () => console.log("Server is Running on 300"));
