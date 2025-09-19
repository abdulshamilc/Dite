// categoryValidation.js
import Joi from "joi";

 const addCategoryValidation = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  description: Joi.string().min(5).max(255).required(),
  product: Joi.number().min(0).default(0),
  isActive: Joi.boolean().default(true)
});

export default addCategoryValidation