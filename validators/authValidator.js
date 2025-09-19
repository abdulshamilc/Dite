import Joi from "joi";

const signupValidation = Joi.object({
  name: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string()
    .pattern(
      new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$")
    )
    .required()
    .messages({
      "string.pattern.base":
        "Password must be at least 8 characters long, include an uppercase letter, a lowercase letter, a number, and a special character",
    }),
  confirmPassword: Joi.any()
    .valid(Joi.ref("password"))
    .required()
    .messages({
      "any.only": "Confirm password does not match password",
    }),
});


export { 
    signupValidation 
};
