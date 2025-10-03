import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import adminRouter from "./routes/adminRouter.js";
import userRouter from "./routes/userRouter.js";
import path from "path";
import nocache from "nocache";
import { fileURLToPath } from "url";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
const app = express();

// Setting Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Env config
dotenv.config();

//DB Connection
connectDB();

//Setting Port
const port = process.env.PORT;

//Setting Session
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 },
  })
);
//No Cashe
app.use(nocache());

// To accesss the session over all the ejs file 
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

// Serialize user
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new GoogleStrategy({
    clientID:process.env.googleClientID,
    clientSecret:process.env.googleClientSecret ,
    callbackURL: 'http://localhost:3007/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    // Here you can save user to DB if you want
    // console.log('Google Profile:', profile);
    return done(null, profile);
  }
));



// Setting viewEngine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Setting Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

//Setup Router
app.use("/admin", adminRouter); //admin router
app.use("/", userRouter); //User Router

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.listen(port, () => console.log("Server is Running on 300"));
