import { HTTP_STATUS, ERROR_MESSAGES } from "../constants/index.js";

export const errorHandler = (err, req, res, next) => {
  console.error(err);

  res.status(err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: err.message || ERROR_MESSAGES.INTERNAL_ERROR
  });
};
