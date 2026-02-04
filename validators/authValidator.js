import Joi from "joi";

const signupStep1Validation = Joi.object({
  name: Joi.string()
    .min(3)
    .max(27)
    .required()
    .messages({
      "string.empty": "Name is required",
      "string.min": "Name must be at least 3 characters",
      "string.max": "Name must not exceed 27 characters",
      "any.required": "Name is required",
    }),
  email: Joi.string().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Please enter a valid email address",
    "any.required": "Email is required",
  }),
  phone: Joi.string()
    .pattern(/^(?:\+91|91|0)?[6-9]\d{9}$/)
    .required()
    .messages({
      "string.empty": "Phone number is required",
      "string.pattern.base": "Please enter a valid Indian phone number",
      "any.required": "Phone number is required",
    }),
  referralCode: Joi.string().optional().allow(''),
});

const signupPasswordValidation = Joi.object({
  password: Joi.string()
    .pattern(
      new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$")
    )
    .required()
    .messages({
      "string.pattern.base":
        "Password must be at least 8 characters long, include an uppercase letter, a lowercase letter, a number, and a special character",
      "string.empty": "Password is required",
      "any.required": "Password is required",
    }),
  confirmPassword: Joi.any()
    .valid(Joi.ref("password"))
    .required()
    .messages({
      "any.only": "Password and confirm password have to be same",
      "any.required": "Confirm password is required",
    }),
});

export { 
    signupStep1Validation,
    signupPasswordValidation
};
