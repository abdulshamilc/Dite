import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import adminRouter from "./routes/adminRouter.js";
import userRouter from "./routes/userRouter.js";
import path from "path";
import nocache from "nocache";
import { fileURLToPath } from "url";
import session from "express-session";
import MongoStore from "connect-mongo";
import passport from "passport";
import flash  from 'connect-flash';
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { limiter } from "./security/rateLimiter.js";
import helmetConfig from "./security/helmet.js";
import { sanitizeInputs } from "./security/sanitizer.js";
import { User } from "./models/userModels.js";
import bcrypt from "bcryptjs";
import offerCronJob from "./cron/offerCron.js";
import couponCronJob from "./cron/coupenCron.js";
const app = express();

//Setting limit for the requst

app.use(limiter);

// Setting Secure Http Headers
helmetConfig(app)


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

    // MongoDB session store
    store: MongoStore.create({
      mongoUrl: process.env.CONNECTION_STRING,
      collectionName: "sessions",
      touchAfter: 24 * 60 * 60, 
    }),

    cookie: {
       maxAge: 12 * 60 * 60 * 1000, // 12 hour
    },
  })
);

//No Cashe
app.use(nocache());


// To accesss the session over all the ejs file 
app.use(async (req, res, next) => {
  res.locals.session = req.session;
  res.locals.currentUser = null;
  if (req.session.user) {
    try {
      const email = typeof req.session.user === 'string' ? req.session.user : req.session.user.email;
      if (email) {
         const user = await User.findOne({ email });
         if (user) res.locals.currentUser = user;
      }
    } catch (error) {
      console.error("Middleware user fetch error:", error);
    }
  }
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
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      let user = await User.findOne({ email });

      if (!user) {
        const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        user = new User({
          name: profile.displayName,
          email: email,
          password: hashedPassword,
        });
        await user.save();
      }
      return done(null, profile);
    } catch (error) {
      return done(error, null);
    }
  }
));

//Crone Job Starting 
offerCronJob() ;
couponCronJob() ;

// Setting viewEngine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Setting Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

//Sanitizing the INput Files 
app.use(sanitizeInputs);

//Setup Router
app.use("/admin", adminRouter); //admin router
app.use("/", userRouter); //User Router

app.use("/admin",(req, res) => {
  res.status(404).render('pageNotFoundAdmin'); 
});
app.use((req, res) => {
  res.status(404).render('pageNotFound'); 
});

app.listen(port, () => console.log(`Server is Running on http://localhost:${port}`));
