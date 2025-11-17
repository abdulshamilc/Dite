// security/helmetConfig.js
import helmet from "helmet";

export default function helmetConfig(app) {
  app.use(
    helmet({
      contentSecurityPolicy: false, // disable CSP if your frontend loads external scripts
      crossOriginResourcePolicy: { policy: "cross-origin" },
      xssFilter: true, // helps prevent cross-site scripting
      referrerPolicy: { policy: "no-referrer" },
      hidePoweredBy: true, // hides X-Powered-By: Express
    })
  );

  console.log("🔐 Helmet security headers enabled");
}
