import mongoSanitize from "express-mongo-sanitize";

export const sanitizeInputs = (req, res, next) => {
  //  Sanitize req.body ONLY (safe)
  if (req.body) {
    mongoSanitize.sanitize(req.body);
  }

  //  XSS filter for req.body ONLY
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === "string") {
        req.body[key] = req.body[key]
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }
    }
  }

  next();
};
